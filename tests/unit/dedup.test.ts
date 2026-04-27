import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';
import { findOrCreateLead } from '../../app/services/dedup.service.js';

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

describe('findOrCreateLead', () => {
  it('creates a new lead when phone is unseen', () => {
    const result = findOrCreateLead(
      {
        phone: '+12162458908',
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:00Z'),
        scopeRaw: 'first inbound',
      },
      db,
    );
    expect(result.isNew).toBe(true);
    expect(result.leadId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the same leadId when same phone arrives within 30 minutes', () => {
    const phone = '+12162458908';
    const first = findOrCreateLead(
      {
        phone,
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:00Z'),
        scopeRaw: 'first',
      },
      db,
    );
    const second = findOrCreateLead(
      {
        phone,
        source: 'google_lsa_email',
        receivedAt: new Date('2026-04-26T12:25:00Z'),
        scopeRaw: 'second within window',
      },
      db,
    );
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.leadId).toBe(first.leadId);
  });

  it('creates a separate lead when same phone arrives 31 minutes later', () => {
    const phone = '+12162458908';
    const first = findOrCreateLead(
      {
        phone,
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:00Z'),
        scopeRaw: 'first',
      },
      db,
    );
    const second = findOrCreateLead(
      {
        phone,
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:31:00Z'),
        scopeRaw: 'second outside window',
      },
      db,
    );
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(true);
    expect(second.leadId).not.toBe(first.leadId);
  });

  it('always creates a new lead when phone is null', () => {
    const a = findOrCreateLead(
      {
        phone: null,
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:00Z'),
        scopeRaw: 'A',
      },
      db,
    );
    const b = findOrCreateLead(
      {
        phone: null,
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:01:00Z'),
        scopeRaw: 'B',
      },
      db,
    );
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
    expect(a.leadId).not.toBe(b.leadId);
  });

  it('different phones never dedup against each other', () => {
    const a = findOrCreateLead(
      {
        phone: '+12162458908',
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:00Z'),
        scopeRaw: 'A',
      },
      db,
    );
    const b = findOrCreateLead(
      {
        phone: '+16145262266',
        source: 'website_form',
        receivedAt: new Date('2026-04-26T12:00:30Z'),
        scopeRaw: 'B',
      },
      db,
    );
    expect(a.isNew).toBe(true);
    expect(b.isNew).toBe(true);
    expect(a.leadId).not.toBe(b.leadId);
  });
});
