import { Hono } from 'hono';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';
import { processIngestedLeads } from '../../services/extraction-batch.service.js';

export const adminRoute = new Hono();

function authorize(token: string | undefined): boolean {
  const expected = config.SESSION_SECRET;
  if (!expected || expected.length === 0) return false;
  return typeof token === 'string' && token === expected;
}

adminRoute.post('/extract-batch', async (c) => {
  if (!authorize(c.req.header('x-admin-token'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    const result = await processIngestedLeads();
    return c.json(result, 200);
  } catch (err) {
    logger.error({ err }, 'extract-batch failed');
    return c.json({ error: 'internal_server_error' }, 500);
  }
});
