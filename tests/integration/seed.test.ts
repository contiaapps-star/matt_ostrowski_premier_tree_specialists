import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
});

afterEach(() => {
  sqlite.close();
});

function counts() {
  return {
    leads: (sqlite.prepare('SELECT count(*) c FROM leads').get() as { c: number }).c,
    faq: (sqlite.prepare('SELECT count(*) c FROM faq_entries').get() as { c: number }).c,
    zips: (sqlite.prepare('SELECT count(*) c FROM zip_code_to_county').get() as { c: number }).c,
    users: (sqlite.prepare('SELECT count(*) c FROM users').get() as { c: number }).c,
    events: (sqlite.prepare('SELECT count(*) c FROM lead_source_events').get() as { c: number }).c,
    audits: (sqlite.prepare('SELECT count(*) c FROM audit_log').get() as { c: number }).c,
  };
}

describe('seed script', () => {
  it('produces the expected row counts on a fresh DB', () => {
    runSeed(db);
    const c = counts();
    expect(c.leads).toBe(8);
    expect(c.faq).toBe(6);
    expect(c.zips).toBeGreaterThanOrEqual(70);
    expect(c.users).toBe(1);
    expect(c.events).toBe(8);
    expect(c.audits).toBeGreaterThanOrEqual(8);
  });

  it('is idempotent — running twice yields the same counts', () => {
    runSeed(db);
    const first = counts();
    runSeed(db);
    const second = counts();
    expect(second).toEqual(first);
  });

  it('seeded admin user has role admin and matches expected email', () => {
    runSeed(db);
    const row = sqlite
      .prepare(`SELECT email, role, display_name FROM users LIMIT 1`)
      .get() as { email: string; role: string; display_name: string };
    expect(row.email).toBe('matt@premiertreesllc.com');
    expect(row.role).toBe('admin');
    expect(row.display_name).toBe('Matt Ostrowski');
  });

  it('seeded FAQ contains the oak_season canonical answer verbatim', () => {
    runSeed(db);
    const row = sqlite
      .prepare(`SELECT answer FROM faq_entries WHERE category='oak_season'`)
      .get() as { answer: string };
    expect(row.answer).toContain('Oak season is currently closed until November');
    expect(row.answer).toContain('Oak Wilt');
  });
});
