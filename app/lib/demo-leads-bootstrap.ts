import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import {
  auditLog,
  leads,
  leadSourceEvents,
  type NewLead,
  type NewLeadSourceEvent,
} from '../db/schema.js';
import { buildDemoLeadSpecs } from '../db/seed-data.js';
import { generateUuidV7 } from './uuid.js';
import { logger } from './logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DemoLeadsBootstrapResult {
  action: 'inserted' | 'skipped_has_leads';
  count: number;
}

/**
 * Insert the synthetic demo leads (8 leads spanning all sources, scope
 * categories, and statuses) at boot whenever the leads table is empty.
 * Idempotent: once any lead exists (real or seeded) this is a no-op, so a
 * Railway restart will never overwrite real data.
 */
export function bootstrapDemoLeadsIfNeeded(db: DrizzleDb): DemoLeadsBootstrapResult {
  const countRow = db.select({ count: sql<number>`count(*)` }).from(leads).all()[0];
  const leadCount = Number(countRow?.count ?? 0);
  if (leadCount > 0) {
    return { action: 'skipped_has_leads', count: leadCount };
  }

  const specs = buildDemoLeadSpecs();
  let inserted = 0;

  db.transaction((tx) => {
    for (const spec of specs) {
      const leadId = generateUuidV7();
      const eventId = generateUuidV7();
      const auditId = generateUuidV7();
      const receivedAt = new Date(spec.receivedAtIso);

      const leadRow: NewLead = {
        id: leadId,
        receivedAt,
        source: spec.source,
        ...spec.lead,
      };
      tx.insert(leads).values(leadRow).run();

      const eventRow: NewLeadSourceEvent = {
        id: eventId,
        leadId,
        source: spec.source,
        receivedAt,
        rawPayload: JSON.stringify(spec.rawPayload),
      };
      tx.insert(leadSourceEvents).values(eventRow).run();

      tx.insert(auditLog)
        .values({
          id: auditId,
          leadId,
          actor: 'system',
          action: 'ingested',
          details: JSON.stringify({ source: spec.source, seeded: true }),
        })
        .run();

      inserted += 1;
    }
  });

  logger.info({ count: inserted }, 'bootstrapped demo leads (leads table was empty)');
  return { action: 'inserted', count: inserted };
}
