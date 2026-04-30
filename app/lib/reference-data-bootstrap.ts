import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import { appSettings, faqEntries, zipCodeToCounty } from '../db/schema.js';
import { FAQ_ROWS, ZIP_ROWS } from '../db/seed-data.js';
import { DEFAULT_FAQ_MARKDOWN } from '../services/faq.service.js';
import { generateUuidV7 } from './uuid.js';
import { logger } from './logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ReferenceDataBootstrapResult {
  zipsInserted: number;
  faqsInserted: number;
  faqMarkdownSeeded: boolean;
}

function tableCount(db: DrizzleDb, table: typeof zipCodeToCounty | typeof faqEntries): number {
  const row = db.select({ count: sql<number>`count(*)` }).from(table).all()[0];
  return Number(row?.count ?? 0);
}

function appSettingHas(db: DrizzleDb, key: string): boolean {
  const rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  return rows.length > 0;
}

/**
 * Load reference data (ZIP→county lookup + FAQ knowledge base + FAQ markdown
 * blob) on a fresh DB. Idempotent: each table / key is only populated when
 * empty. Without this, a fresh Railway deploy would mark every lead
 * out-of-service-area and have nothing to ground response generation against.
 */
export function bootstrapReferenceDataIfNeeded(db: DrizzleDb): ReferenceDataBootstrapResult {
  const result: ReferenceDataBootstrapResult = {
    zipsInserted: 0,
    faqsInserted: 0,
    faqMarkdownSeeded: false,
  };

  db.transaction((tx) => {
    if (tableCount(tx, zipCodeToCounty) === 0) {
      for (const row of ZIP_ROWS) {
        tx.insert(zipCodeToCounty).values(row).run();
        result.zipsInserted += 1;
      }
    }

    // Legacy FAQ entries table is still populated for back-compat with the
    // old admin tools and tests that read from it directly. The live response
    // pipeline reads the markdown blob below.
    if (tableCount(tx, faqEntries) === 0) {
      for (const f of FAQ_ROWS) {
        tx.insert(faqEntries).values({ id: generateUuidV7(), ...f }).run();
        result.faqsInserted += 1;
      }
    }

    // FAQ markdown — single source of truth for the AI response generator.
    if (!appSettingHas(tx, 'faq_markdown')) {
      tx.insert(appSettings)
        .values({ key: 'faq_markdown', value: DEFAULT_FAQ_MARKDOWN, updatedAt: new Date() })
        .run();
      result.faqMarkdownSeeded = true;
    }
  });

  if (result.zipsInserted > 0 || result.faqsInserted > 0 || result.faqMarkdownSeeded) {
    logger.info(
      result,
      'bootstrapped reference data (zips + FAQs + markdown)',
    );
  }

  return result;
}
