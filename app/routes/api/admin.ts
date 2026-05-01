import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { config } from '../../config.js';
import { getDb } from '../../db/client.js';
import { agentMailMessages } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { processIngestedLeads } from '../../services/extraction-batch.service.js';
import { processExtractedLeads } from '../../services/response-batch.service.js';
import { dispatchPendingLeads } from '../../services/outbound-batch.service.js';

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

adminRoute.post('/generate-responses', async (c) => {
  if (!authorize(c.req.header('x-admin-token'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    const result = await processExtractedLeads();
    return c.json(result, 200);
  } catch (err) {
    logger.error({ err }, 'generate-responses failed');
    return c.json({ error: 'internal_server_error' }, 500);
  }
});

adminRoute.post('/dispatch-batch', async (c) => {
  if (!authorize(c.req.header('x-admin-token'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    const result = await dispatchPendingLeads();
    return c.json(result, 200);
  } catch (err) {
    logger.error({ err }, 'dispatch-batch failed');
    return c.json({ error: 'internal_server_error' }, 500);
  }
});

/**
 * Read-only view of the AgentMail raw archive — useful for the team to
 * inspect what's actually coming in from the Gmail forwarding rules. Returns
 * the latest 50 messages with parse status so they can spot which ones need
 * parser attention.
 */
adminRoute.get('/agent-mail-archive', async (c) => {
  if (!authorize(c.req.header('x-admin-token'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  try {
    const db = getDb();
    const rows = db
      .select({
        id: agentMailMessages.id,
        agentmailMessageId: agentMailMessages.agentmailMessageId,
        receivedAt: agentMailMessages.receivedAt,
        fromAddress: agentMailMessages.fromAddress,
        subject: agentMailMessages.subject,
        detectedSource: agentMailMessages.detectedSource,
        parseStatus: agentMailMessages.parseStatus,
        parseError: agentMailMessages.parseError,
        leadId: agentMailMessages.leadId,
      })
      .from(agentMailMessages)
      .orderBy(desc(agentMailMessages.receivedAt))
      .limit(50)
      .all();
    return c.json({ count: rows.length, messages: rows }, 200);
  } catch (err) {
    logger.error({ err }, 'agent-mail-archive query failed');
    return c.json({ error: 'internal_server_error' }, 500);
  }
});
