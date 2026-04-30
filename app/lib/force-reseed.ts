import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';
import {
  appSettings,
  auditLog,
  faqEntries,
  leads,
  leadSourceEvents,
  outboundMessages,
  zipCodeToCounty,
} from '../db/schema.js';
import { FAQ_ROWS, ZIP_ROWS } from '../db/seed-data.js';
import { buildAllDemoLeads, insertDemoLeadInto } from '../db/demo-rich-seed.js';
import { DEFAULT_FAQ_MARKDOWN } from '../services/faq.service.js';
import { generateUuidV7 } from './uuid.js';
import { logger } from './logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ForceReseedResult {
  zipsInserted: number;
  faqsInserted: number;
  leadsInserted: number;
  faqMarkdownReset: boolean;
}

/**
 * Destructive: wipes leads + lead-derived rows + reference data (zips/FAQs)
 * and re-seeds them with the rich demo set. Triggered by the RESEED_ON_BOOT
 * env var. Preserves users, sessions, and app_settings so credentials and
 * runtime configuration are not lost.
 */
export function forceReseed(db: DrizzleDb): ForceReseedResult {
  logger.warn(
    'RESEED_ON_BOOT=true — wiping leads, source events, audit log, outbound messages, FAQs, and zip lookup tables, then re-seeding demo data',
  );

  const result: ForceReseedResult = {
    zipsInserted: 0,
    faqsInserted: 0,
    leadsInserted: 0,
    faqMarkdownReset: false,
  };

  // Phase 1: wipe + re-insert reference data and lead-derived tables. We
  // do not touch users or sessions. We DO reset the faq_markdown row in
  // app_settings so deploys with this flag pick up the latest defaults.
  db.transaction((tx) => {
    tx.delete(outboundMessages).run();
    tx.delete(auditLog).run();
    tx.delete(leadSourceEvents).run();
    tx.delete(leads).run();
    tx.delete(faqEntries).run();
    tx.delete(zipCodeToCounty).run();
    tx.delete(appSettings).where(eq(appSettings.key, 'faq_markdown')).run();

    for (const row of ZIP_ROWS) {
      tx.insert(zipCodeToCounty).values(row).run();
      result.zipsInserted += 1;
    }
    for (const f of FAQ_ROWS) {
      tx.insert(faqEntries).values({ id: generateUuidV7(), ...f }).run();
      result.faqsInserted += 1;
    }
    tx.insert(appSettings)
      .values({ key: 'faq_markdown', value: DEFAULT_FAQ_MARKDOWN, updatedAt: new Date() })
      .run();
    result.faqMarkdownReset = true;
  });

  // Phase 2: insert the rich demo lead set. insertDemoLeadInto manages its
  // own per-lead transaction, so don't wrap this in a top-level transaction.
  const allDemo = buildAllDemoLeads(50);
  const baseTime = Date.now();
  db.transaction((tx) => {
    for (const spec of allDemo) {
      insertDemoLeadInto(tx, spec, baseTime);
      result.leadsInserted += 1;
    }
  });

  logger.info(result, 'force reseed complete');
  return result;
}
