import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../lib/logger.js';
import { forbiddenPage, notFoundPage, serverErrorPage } from '../views/pages/errors.html.js';

function acceptsHtml(accept: string | undefined): boolean {
  if (!accept) return false;
  return accept.includes('text/html');
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }

  logger.error(
    { err, path: c.req.path, method: c.req.method },
    'Unhandled error',
  );

  if (acceptsHtml(c.req.header('accept'))) {
    return c.html(serverErrorPage('An unexpected error occurred while handling your request.'), 500);
  }
  return c.json({ error: 'internal_server_error' }, 500);
};

export function htmlNotFound(c: import('hono').Context, detail?: string) {
  return c.html(notFoundPage(detail), 404);
}

export function htmlForbidden(c: import('hono').Context, detail?: string) {
  return c.html(forbiddenPage(detail), 403);
}
