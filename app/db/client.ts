import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import Database, { type Database as BetterSqliteDatabase } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { config } from '../config.js';
import * as schema from './schema.js';

let cachedDb: BetterSQLite3Database<typeof schema> | null = null;
let cachedSqlite: BetterSqliteDatabase | null = null;
let cachedPath: string | null = null;

function ensureParentDir(path: string): void {
  if (path === ':memory:' || path.startsWith('file::memory:')) return;
  const dir = dirname(path);
  if (!dir || dir === '.' || dir === '/') return;
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort; better-sqlite3 will surface a clear error if it can't open
  }
}

function applyPragmas(sqlite: BetterSqliteDatabase, isInMemory: boolean): void {
  if (!isInMemory) {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
}

export function openDb(path: string = config.DATABASE_PATH): {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: BetterSqliteDatabase;
} {
  const isInMemory = path === ':memory:' || path.startsWith('file::memory:');
  if (!isInMemory) ensureParentDir(path);

  const sqlite = new Database(path);
  applyPragmas(sqlite, isInMemory);
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

function init(): void {
  if (cachedDb && cachedSqlite && cachedPath === config.DATABASE_PATH) return;
  const { db, sqlite } = openDb(config.DATABASE_PATH);
  cachedDb = db;
  cachedSqlite = sqlite;
  cachedPath = config.DATABASE_PATH;
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  init();
  return cachedDb as BetterSQLite3Database<typeof schema>;
}

export function getSqlite(): BetterSqliteDatabase {
  init();
  return cachedSqlite as BetterSqliteDatabase;
}

export function closeDb(): void {
  if (cachedSqlite) {
    cachedSqlite.close();
  }
  cachedDb = null;
  cachedSqlite = null;
  cachedPath = null;
}

export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
