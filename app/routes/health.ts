import { Hono } from 'hono';
import { config } from '../config.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';

export const healthRoute = new Hono();

healthRoute.get('/', (c) =>
  c.json({
    status: 'ok',
    version: VERSION,
    integration_mode: config.INTEGRATION_MODE,
  }),
);
