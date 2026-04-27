import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { intakeRoute } from './routes/api/intake.js';
import { adminRoute } from './routes/api/admin.js';
import { authRoute } from './routes/auth.js';
import { dashboardRoute } from './routes/dashboard.js';
import { leadsRoute } from './routes/leads.js';
import { queueRoute } from './routes/queue.js';
import { statsRoute } from './routes/stats.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { notFoundPage } from './views/pages/errors.html.js';

const STATIC_ROOT = resolve(process.cwd(), 'public');

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function serveFromPublic(relPath: string): { body: Buffer; type: string } | null {
  // strict path traversal guard
  if (relPath.includes('..')) return null;
  const fullPath = resolve(STATIC_ROOT, relPath.replace(/^\/+/, ''));
  if (!fullPath.startsWith(STATIC_ROOT)) return null;
  try {
    const stat = statSync(fullPath);
    if (!stat.isFile()) return null;
    const body = readFileSync(fullPath);
    const type = MIME[extname(fullPath).toLowerCase()] ?? 'application/octet-stream';
    return { body, type };
  } catch {
    return null;
  }
}

function staticHandler(rel: string) {
  const file = serveFromPublic(rel);
  if (!file) return null;
  return new Response(new Uint8Array(file.body), {
    status: 200,
    headers: { 'content-type': file.type },
  });
}

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', requestLogger);
  app.onError(errorHandler);

  // Public routes (no auth required).
  app.route('/health', healthRoute);
  app.route('/api/intake', intakeRoute);
  app.route('/api/admin', adminRoute);
  app.route('/', authRoute);

  // Static files served from /public.
  app.get('/styles.css', (c) => {
    const res = staticHandler('styles.css');
    if (!res) return c.text('', 404);
    return res;
  });
  app.get('/favicon.svg', (c) => {
    const res = staticHandler('favicon.svg');
    if (!res) return c.text('', 404);
    return res;
  });
  app.get('/favicon.ico', (c) => {
    const res = staticHandler('favicon.svg');
    if (!res) return c.text('', 404);
    return res;
  });
  app.get('/public/*', (c) => {
    const url = new URL(c.req.url);
    const rel = url.pathname.replace(/^\/public\//, '');
    const res = staticHandler(rel);
    if (!res) return c.text('', 404);
    return res;
  });

  // Authenticated UI routes.
  app.route('/', dashboardRoute);
  app.route('/', leadsRoute);
  app.route('/', queueRoute);
  app.route('/', statsRoute);

  app.notFound((c) => {
    if (c.req.header('accept')?.includes('text/html')) {
      return c.html(notFoundPage(`No route for ${c.req.method} ${c.req.path}.`), 404);
    }
    return c.json({ error: 'not_found', path: c.req.path }, 404);
  });

  return app;
}
