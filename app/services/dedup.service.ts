import { and, desc, eq, gte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { type LeadSource, leads } from '../db/schema.js';
import { generateUuidV7 } from '../lib/uuid.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export const DEDUP_WINDOW_MS = 30 * 60 * 1000;

export interface DedupInput {
  phone: string | null;
  source: LeadSource;
  receivedAt: Date;
  scopeRaw: string;
}

export interface DedupResult {
  leadId: string;
  isNew: boolean;
}

/**
 * Find an existing lead with the same E.164 phone within the dedup window, or
 * insert a fresh `ingested` lead row. Wrapped in a transaction so concurrent
 * intakes for the same phone don't both decide to create a new row.
 */
export function findOrCreateLead(input: DedupInput, db: DrizzleDb = getDb()): DedupResult {
  return db.transaction((tx) => {
    if (input.phone) {
      const cutoff = new Date(input.receivedAt.getTime() - DEDUP_WINDOW_MS);
      const existing = tx
        .select({ id: leads.id })
        .from(leads)
        .where(
          and(eq(leads.dedupPhoneE164, input.phone), gte(leads.receivedAt, cutoff)),
        )
        .orderBy(desc(leads.receivedAt))
        .limit(1)
        .all();

      if (existing.length > 0) {
        return { leadId: existing[0]!.id, isNew: false };
      }
    }

    const id = generateUuidV7();
    tx.insert(leads)
      .values({
        id,
        receivedAt: input.receivedAt,
        source: input.source,
        dedupPhoneE164: input.phone,
        status: 'ingested',
        scopeRaw: input.scopeRaw,
      })
      .run();
    return { leadId: id, isNew: true };
  });
}
