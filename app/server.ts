import { serve, type ServerType } from '@hono/node-server';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';

export interface StartedServer {
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

export async function startServer(port: number = config.PORT): Promise<StartedServer> {
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
