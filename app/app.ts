import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', requestLogger);
  app.onError(errorHandler);

  app.route('/health', healthRoute);

  app.get('/', (c) =>
    c.json({
      service: 'premier-tree-intake',
      message: 'Premier Tree Specialists — Lead Intake Dashboard',
    }),
  );

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

  return app;
}
