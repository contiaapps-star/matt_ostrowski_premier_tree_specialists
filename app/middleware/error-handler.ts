import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../lib/logger.js';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  logger.error({ err, path: c.req.path, method: c.req.method }, 'Unhandled error');
  return c.json({ error: 'internal_server_error' }, 500);
};
