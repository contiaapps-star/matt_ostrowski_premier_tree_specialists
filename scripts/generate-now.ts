import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import { logger } from '../app/lib/logger.js';
import { processExtractedLeads } from '../app/services/response-batch.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

async function main(): Promise<void> {
  const { db } = openDb(config.DATABASE_PATH);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const result = await processExtractedLeads();

  for (const r of result.results) {
    logger.info(
      {
        leadId: r.leadId,
        status: r.status,
        finalConfidence: r.finalConfidence,
        llmConfidence: r.llmConfidence,
        responseTextSet: r.responseTextSet,
        escalationTriggered: r.escalationTriggered,
        reason: r.reason,
      },
      `response-gen ${r.leadId} -> ${r.status}`,
    );
  }
  for (const e of result.errors) {
    logger.error({ leadId: e.leadId, error: e.error }, 'response-gen error');
  }
  logger.info(
    { processed: result.processed, succeeded: result.succeeded, failed: result.failed },
    'generate-now done',
  );
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
  main()
    .then(() => {
      closeDb();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'generate-now failed');
      closeDb();
      process.exit(1);
    });
}
