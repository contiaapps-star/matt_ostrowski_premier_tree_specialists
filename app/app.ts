import { Hono } from 'hono';
import { healthRoute } from './routes/health.js';
import { intakeRoute } from './routes/api/intake.js';
import { adminRoute } from './routes/api/admin.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

export function createApp(): Hono {
  const app = new Hono();

  app.use('*', requestLogger);
  app.onError(errorHandler);

  app.route('/health', healthRoute);
  app.route('/api/intake', intakeRoute);
  app.route('/api/admin', adminRoute);

  app.get('/', (c) =>
    c.json({
      service: 'premier-tree-intake',
      message: 'Premier Tree Specialists — Lead Intake Dashboard',
    }),
  );

  app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

  return app;
}
