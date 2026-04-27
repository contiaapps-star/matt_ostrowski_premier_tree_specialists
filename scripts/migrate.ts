import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import { logger } from '../app/lib/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

export async function runMigrations(path: string = config.DATABASE_PATH): Promise<void> {
  const { db } = openDb(path);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
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
  runMigrations()
    .then(() => {
      logger.info({ path: config.DATABASE_PATH }, 'Migrations applied');
      closeDb();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      closeDb();
      process.exit(1);
    });
}
