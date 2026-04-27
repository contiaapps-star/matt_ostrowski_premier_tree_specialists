import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { zipCodeToCounty } from '../db/schema.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface ZipLookupResult {
  county: string;
  region: 'northeast_ohio' | 'central_ohio';
}

let cache: Map<string, ZipLookupResult> | null = null;
let cacheDb: DrizzleDb | null = null;

function buildCache(db: DrizzleDb): Map<string, ZipLookupResult> {
  const rows = db.select().from(zipCodeToCounty).all();
  const map = new Map<string, ZipLookupResult>();
  for (const row of rows) {
    map.set(row.zip, {
      county: row.county,
      region: row.region as ZipLookupResult['region'],
    });
  }
  return map;
}

export function lookupCounty(
  zip: string | null | undefined,
  db: DrizzleDb = getDb(),
): ZipLookupResult | null {
  if (typeof zip !== 'string') return null;
  const trimmed = zip.trim();
  if (trimmed.length < 5) return null;
  const five = trimmed.slice(0, 5);
  if (!/^\d{5}$/.test(five)) return null;

  if (!cache || cacheDb !== db) {
    cache = buildCache(db);
    cacheDb = db;
  }
  return cache.get(five) ?? null;
}

export function resetZipCache(): void {
  cache = null;
  cacheDb = null;
}
