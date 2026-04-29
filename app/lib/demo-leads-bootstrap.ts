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
import { buildAllDemoLeads, insertDemoLeadInto } from '../db/demo-rich-seed.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface DemoLeadsBootstrapResult {
  action: 'inserted_rich' | 'inserted_basic' | 'skipped_has_leads';
  count: number;
}

/**
 * Insert demo leads at boot when the leads table is empty. Loads the rich
 * demo set (~70 leads — hand-crafted + procedurally generated with recent
 * timestamps) so the dashboard has plenty of variety on a fresh DB.
 *
 * Idempotent: once any lead exists (real or seeded) this is a no-op so a
 * Railway restart will never overwrite real data. If the rich seed throws
 * for any reason, falls back to the basic 8-lead spec.
 */
export function bootstrapDemoLeadsIfNeeded(db: DrizzleDb): DemoLeadsBootstrapResult {
  const countRow = db.select({ count: sql<number>`count(*)` }).from(leads).all()[0];
  const leadCount = Number(countRow?.count ?? 0);
  if (leadCount > 0) {
    return { action: 'skipped_has_leads', count: leadCount };
  }

  try {
    const allDemo = buildAllDemoLeads(50);
    const baseTime = Date.now();
    let inserted = 0;
    db.transaction((tx) => {
      for (const spec of allDemo) {
        insertDemoLeadInto(tx, spec, baseTime);
        inserted += 1;
      }
    });
    logger.info({ count: inserted }, 'bootstrapped rich demo leads (leads table was empty)');
    return { action: 'inserted_rich', count: inserted };
  } catch (err) {
    logger.warn({ err }, 'rich demo seed failed — falling back to basic 8-lead spec');
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

  logger.info({ count: inserted }, 'bootstrapped basic demo leads (8-lead spec)');
  return { action: 'inserted_basic', count: inserted };
}
