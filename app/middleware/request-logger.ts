import type { MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const started = Date.now();
  await next();
  const elapsedMs = Date.now() - started;
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      elapsed_ms: elapsedMs,
    },
    'request',
  );
};
