import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { faqEntries, zipCodeToCounty } from '../db/schema.js';
import { FAQ_ROWS, ZIP_ROWS } from '../db/seed-data.js';
import { generateUuidV7 } from './uuid.js';
import { logger } from './logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ReferenceDataBootstrapResult {
  zipsInserted: number;
  faqsInserted: number;
}

function tableCount(db: DrizzleDb, table: typeof zipCodeToCounty | typeof faqEntries): number {
  const row = db.select({ count: sql<number>`count(*)` }).from(table).all()[0];
  return Number(row?.count ?? 0);
}

/**
 * Load reference data (ZIP→county lookup + FAQ knowledge base) on a fresh DB.
 * Idempotent: each table is only populated when its row count is zero, so
 * re-running on a hydrated DB is a no-op. Without this, a fresh Railway deploy
 * would mark every lead out-of-service-area (no zip lookups) and have nothing
 * to ground response generation against (no FAQ entries).
 */
export function bootstrapReferenceDataIfNeeded(db: DrizzleDb): ReferenceDataBootstrapResult {
  const result: ReferenceDataBootstrapResult = { zipsInserted: 0, faqsInserted: 0 };

  db.transaction((tx) => {
    if (tableCount(tx, zipCodeToCounty) === 0) {
      for (const row of ZIP_ROWS) {
        tx.insert(zipCodeToCounty).values(row).run();
        result.zipsInserted += 1;
      }
    }

    if (tableCount(tx, faqEntries) === 0) {
      for (const f of FAQ_ROWS) {
        tx.insert(faqEntries).values({ id: generateUuidV7(), ...f }).run();
        result.faqsInserted += 1;
      }
    }
  });

  if (result.zipsInserted > 0 || result.faqsInserted > 0) {
    logger.info(
      { zipsInserted: result.zipsInserted, faqsInserted: result.faqsInserted },
      'bootstrapped reference data (zips + FAQs)',
    );
  }

  return result;
}
