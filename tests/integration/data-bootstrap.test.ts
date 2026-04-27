import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb, getSqlite } from '../../app/db/client.js';
import {
  auditLog,
  faqEntries,
  leads,
  leadSourceEvents,
  zipCodeToCounty,
} from '../../app/db/schema.js';
import { bootstrapReferenceDataIfNeeded } from '../../app/lib/reference-data-bootstrap.js';
import { bootstrapDemoLeadsIfNeeded } from '../../app/lib/demo-leads-bootstrap.js';
import { generateUuidV7 } from '../../app/lib/uuid.js';
import { ZIP_ROWS, FAQ_ROWS } from '../../app/db/seed-data.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

function freshSchema(): void {
  closeDb();
  const db = getDb();
  const sqlite = getSqlite();
  sqlite.pragma('foreign_keys = ON');
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  // Wipe reference + lead tables so each test starts truly empty.
  db.delete(auditLog).run();
  db.delete(leadSourceEvents).run();
  db.delete(leads).run();
  db.delete(faqEntries).run();
  db.delete(zipCodeToCounty).run();
}

function countOf(table: typeof zipCodeToCounty | typeof faqEntries | typeof leads): number {
  const row = getDb().select({ count: sql<number>`count(*)` }).from(table).all()[0];
  return Number(row?.count ?? 0);
}

describe('reference-data-bootstrap', () => {
  beforeEach(() => {
    freshSchema();
  });

  afterEach(() => {
    closeDb();
  });

  it('inserts all zips and FAQs when both tables are empty', () => {
    const result = bootstrapReferenceDataIfNeeded(getDb());

    expect(result.zipsInserted).toBe(ZIP_ROWS.length);
    expect(result.faqsInserted).toBe(FAQ_ROWS.length);
    expect(countOf(zipCodeToCounty)).toBe(ZIP_ROWS.length);
    expect(countOf(faqEntries)).toBe(FAQ_ROWS.length);
  });

  it('is idempotent — second call inserts nothing', () => {
    bootstrapReferenceDataIfNeeded(getDb());
    const second = bootstrapReferenceDataIfNeeded(getDb());

    expect(second.zipsInserted).toBe(0);
    expect(second.faqsInserted).toBe(0);
    expect(countOf(zipCodeToCounty)).toBe(ZIP_ROWS.length);
    expect(countOf(faqEntries)).toBe(FAQ_ROWS.length);
  });

  it('only fills the empty table when one is already populated', () => {
    // Pre-populate zips only.
    getDb().insert(zipCodeToCounty).values({ zip: '99999', county: 'Test', region: 'central_ohio' }).run();

    const result = bootstrapReferenceDataIfNeeded(getDb());

    expect(result.zipsInserted).toBe(0);
    expect(result.faqsInserted).toBe(FAQ_ROWS.length);
    expect(countOf(zipCodeToCounty)).toBe(1); // untouched
    expect(countOf(faqEntries)).toBe(FAQ_ROWS.length);
  });
});

describe('demo-leads-bootstrap', () => {
  beforeEach(() => {
    freshSchema();
  });

  afterEach(() => {
    closeDb();
  });

  it('inserts demo leads when leads table is empty', () => {
    const result = bootstrapDemoLeadsIfNeeded(getDb());

    expect(result.action).toBe('inserted');
    expect(result.count).toBe(8);
    expect(countOf(leads)).toBe(8);
    // Each lead must have a matching source event + audit row.
    expect(countOf(leadSourceEvents)).toBe(8);
    expect(countOf(auditLog)).toBe(8);
  });

  it('skips when leads already exist (does not overwrite real data)', () => {
    getDb()
      .insert(leads)
      .values({
        id: generateUuidV7(),
        receivedAt: new Date(),
        source: 'website_form',
        scopeRaw: 'pre-existing',
      })
      .run();

    const result = bootstrapDemoLeadsIfNeeded(getDb());

    expect(result.action).toBe('skipped_has_leads');
    expect(countOf(leads)).toBe(1);
  });

  it('is idempotent — running twice still yields exactly 8 leads', () => {
    bootstrapDemoLeadsIfNeeded(getDb());
    const second = bootstrapDemoLeadsIfNeeded(getDb());

    expect(second.action).toBe('skipped_has_leads');
    expect(countOf(leads)).toBe(8);
  });
});
