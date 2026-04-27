import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../app/config.js';
import { closeDb, openDb } from '../app/db/client.js';
import { logger } from '../app/lib/logger.js';
import { dispatchPendingLeads } from '../app/services/outbound-batch.service.js';
import { dispatchLead } from '../app/services/outbound-dispatcher.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', 'app', 'db', 'migrations');

async function main(): Promise<void> {
  const { db } = openDb(config.DATABASE_PATH);
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  const target = process.argv[2];
  if (target && target.length > 0) {
    const r = await dispatchLead(target);
    logger.info(
      {
        leadId: r.leadId,
        emailSent: r.emailSent,
        smsSent: r.smsSent,
        arboStarSynced: r.arboStarSynced,
        skipped: r.skipped,
        reason: r.reason,
        errors: r.errors,
      },
      `dispatch ${r.leadId}`,
    );
    return;
  }

  const result = await dispatchPendingLeads();
  for (const r of result.results) {
    logger.info(
      {
        leadId: r.leadId,
        emailSent: r.emailSent,
        smsSent: r.smsSent,
        arboStarSynced: r.arboStarSynced,
        skipped: r.skipped,
        reason: r.reason,
      },
      `dispatch ${r.leadId}`,
    );
  }
  for (const e of result.errors) {
    logger.error({ leadId: e.leadId, error: e.error }, 'dispatch error');
  }
  logger.info(
    { processed: result.processed, succeeded: result.succeeded, failed: result.failed },
    'dispatch-now done',
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
      logger.error({ err }, 'dispatch-now failed');
      closeDb();
      process.exit(1);
    });
}
