import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import { logger } from '../app/lib/logger.js';
import { replayFixture } from '../app/services/intake-replay.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

async function main(): Promise<void> {
  const fixtureName = process.argv[2];
  if (!fixtureName) {
    logger.error('Usage: tsx scripts/replay-fixture.ts <fixture-name>');
    process.exit(2);
  }

  const { db } = openDb(config.DATABASE_PATH);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const result = await replayFixture(fixtureName);
  logger.info(result, 'replay result');

  if (result.status >= 400) {
    closeDb();
    process.exit(1);
  }
  closeDb();
  process.exit(0);
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
  main().catch((err) => {
    logger.error({ err }, 'replay failed');
    closeDb();
    process.exit(1);
  });
}
