import { resolve } from 'node:path';
import { serve, type ServerType } from '@hono/node-server';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createApp } from './app.js';
import { config } from './config.js';
import { getDb } from './db/client.js';
import { bootstrapAdminIfNeeded } from './lib/admin-bootstrap.js';
import { bootstrapDemoLeadsIfNeeded } from './lib/demo-leads-bootstrap.js';
import { bootstrapReferenceDataIfNeeded } from './lib/reference-data-bootstrap.js';
import { forceReseed } from './lib/force-reseed.js';
import { logger } from './lib/logger.js';
import { bootstrapAgentMail } from './services/agentmail-bootstrap.service.js';

export interface StartedServer {
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

function runMigrationsIfPresent(): void {
  const folder = resolve(process.cwd(), 'app', 'db', 'migrations');
  try {
    const db = getDb();
    migrate(db, { migrationsFolder: folder });
    logger.info({ folder }, 'migrations applied');
  } catch (err) {
    logger.error({ err, folder }, 'failed to apply migrations on startup');
    throw err;
  }
}

export async function startServer(port: number = config.PORT): Promise<StartedServer> {
  // Tests apply migrations themselves via setupFreshDb against a per-test
  // in-memory DB; running them again here would just thrash. Everywhere else
  // (dev + prod), make sure the schema exists before serving.
  if (config.NODE_ENV !== 'test') {
    runMigrationsIfPresent();
    if (config.RESEED_ON_BOOT) {
      forceReseed(getDb());
      bootstrapAdminIfNeeded(getDb(), config);
    } else {
      bootstrapReferenceDataIfNeeded(getDb());
      bootstrapAdminIfNeeded(getDb(), config);
      bootstrapDemoLeadsIfNeeded(getDb());
    }
    // Provision the AgentMail inbox + webhook idempotently. Any failure is
    // logged but never blocks server startup — /settings falls back to
    // "Pending" and the webhook simply won't fire.
    void bootstrapAgentMail().catch((err) => {
      logger.error({ err }, '[agentmail-bootstrap] unexpected error');
    });
  }
  const app = createApp();

  return await new Promise<StartedServer>((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: '0.0.0.0',
      },
      (info) => {
        logger.info(
          { port: info.port, integration_mode: config.INTEGRATION_MODE, env: config.NODE_ENV },
          'Server listening',
        );
        resolve({
          server,
          port: info.port,
          close: () =>
            new Promise<void>((res, rej) => {
              server.close((err) => (err ? rej(err) : res()));
            }),
        });
      },
    );
  });
}

import { pathToFileURL } from 'node:url';

const isMainModule = (() => {
  if (typeof process.argv[1] !== 'string') return false;
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMainModule) {
  startServer().catch((err) => {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  });
}
