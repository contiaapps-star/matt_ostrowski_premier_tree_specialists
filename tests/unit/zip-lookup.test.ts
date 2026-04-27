import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '../../app/db/schema.js';
import { lookupCounty, resetZipCache } from '../../app/lib/zip-lookup.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

let sqlite: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeEach(() => {
  resetZipCache();
  sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  runSeed(db);
});

afterEach(() => {
  resetZipCache();
  sqlite.close();
});

describe('lookupCounty', () => {
  it('finds a Cuyahoga (Northeast Ohio) zip', () => {
    expect(lookupCounty('44113', db)).toEqual({
      county: 'Cuyahoga',
      region: 'northeast_ohio',
    });
  });

  it('finds a Franklin (Central Ohio) zip', () => {
    expect(lookupCounty('43201', db)).toEqual({
      county: 'Franklin',
      region: 'central_ohio',
    });
  });

  it('returns null for an out-of-service-area zip (Florida)', () => {
    expect(lookupCounty('33101', db)).toBeNull();
  });

  it('returns null for an obviously bad input', () => {
    expect(lookupCounty('abcde', db)).toBeNull();
    expect(lookupCounty('', db)).toBeNull();
    expect(lookupCounty(null, db)).toBeNull();
    expect(lookupCounty(undefined, db)).toBeNull();
  });

  it('handles 9-digit ZIP+4 by reading first 5', () => {
    expect(lookupCounty('44113-1234', db)).toEqual({
      county: 'Cuyahoga',
      region: 'northeast_ohio',
    });
  });

  it('caches results — second call does not re-query', () => {
    const first = lookupCounty('44113', db);
    const second = lookupCounty('44113', db);
    expect(first).toEqual(second);
  });
});
