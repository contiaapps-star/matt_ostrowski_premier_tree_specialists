import { Hono } from 'hono';
import { config } from '../config.js';
import { getSqlite } from '../db/client.js';
import { getLastIntakeAt } from '../services/stats.service.js';
import { logger } from '../lib/logger.js';

const VERSION = process.env.npm_package_version ?? '0.1.0';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  let dbOk = false;
  try {
    const sqlite = getSqlite();
    const result = sqlite.prepare('SELECT 1 AS ok').get() as { ok: number } | undefined;
    dbOk = result?.ok === 1;
  } catch (err) {
    logger.warn({ err }, 'health: DB connectivity check failed');
    dbOk = false;
  }

  let lastIntakeAtIso: string | null = null;
  try {
    const last = getLastIntakeAt();
    lastIntakeAtIso = last ? last.toISOString() : null;
  } catch {
    lastIntakeAtIso = null;
  }

  const status = dbOk ? 'ok' : 'degraded';
  const httpStatus = dbOk ? 200 : 503;

  return c.json(
    {
      status,
      version: VERSION,
      integration_mode: config.INTEGRATION_MODE,
      env: config.NODE_ENV,
      db_ok: dbOk,
      last_intake_at: lastIntakeAtIso,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    httpStatus,
  );
});
