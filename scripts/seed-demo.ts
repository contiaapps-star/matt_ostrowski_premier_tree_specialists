/**
 * Demo seed CLI — runs the canonical `runSeed()` first (which produces the
 * fixed 8-lead set the tests depend on) and then layers a much richer
 * fixture on top so the dashboard has plenty of variety to click through.
 *
 * Run inside the dev container:
 *   docker compose exec app npm run db:seed:demo
 *
 * Idempotent — runSeed wipes-then-reseeds and the demo set is regenerated
 * from the same hand-crafted + procedurally-seeded list each time.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import * as schema from '../app/db/schema.js';
import { logger } from '../app/lib/logger.js';
import { buildAllDemoLeads, insertDemoLeadInto } from '../app/db/demo-rich-seed.js';
import { runSeed } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export function runDemoSeed(
  db: DrizzleDb,
  baseTime: number = Date.now(),
  extraProcedural: number = 50,
): { baseLeadCount: number; demoLeadCount: number } {
  const baseCounts = runSeed(db);
  const allDemo = buildAllDemoLeads(extraProcedural);
  db.transaction((tx) => {
    for (const spec of allDemo) {
      insertDemoLeadInto(tx, spec, baseTime);
    }
  });
  return { baseLeadCount: baseCounts.leads, demoLeadCount: allDemo.length };
}

const isMain = (() => {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return import.meta.url === new URL(`file://${process.argv[1]}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  const { db } = openDb(config.DATABASE_PATH);
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    const result = runDemoSeed(db);
    logger.info(
      result,
      `demo seed complete — ${result.baseLeadCount} base + ${result.demoLeadCount} demo leads`,
    );
    closeDb();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'demo seed failed');
    closeDb();
    process.exit(1);
  }
}
