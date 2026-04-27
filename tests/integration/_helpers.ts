import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDb, getDb, getSqlite } from '../../app/db/client.js';
import { auditLog, leads, leadSourceEvents, outboundMessages } from '../../app/db/schema.js';
import { resetZipCache } from '../../app/lib/zip-lookup.js';
import { intakeRateLimiter } from '../../app/middleware/rate-limit.js';
import { runSeed } from '../../scripts/seed.js';

const MIGRATIONS_FOLDER = resolve(process.cwd(), 'app', 'db', 'migrations');

/**
 * Migrate + seed reference data (zips, FAQ, users) for tests, but DO NOT
 * pre-load any demo leads. Tests assert against a clean leads table.
 */
export function setupFreshDb(): void {
  closeDb();
  resetZipCache();
  intakeRateLimiter.reset();
  const db = getDb();
  const sqlite = getSqlite();
  sqlite.pragma('foreign_keys = ON');
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  runSeed(db);
  db.delete(outboundMessages).run();
  db.delete(auditLog).run();
  db.delete(leadSourceEvents).run();
  db.delete(leads).run();
}

export function teardownDb(): void {
  closeDb();
  resetZipCache();
}

export { getDb, getSqlite };
