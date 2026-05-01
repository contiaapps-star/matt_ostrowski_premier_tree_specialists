import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import {
  AGENT_MAIL_PARSE_STATUSES,
  type AgentMailParseStatus,
  leads,
} from '../db/schema.js';
import { authMiddleware, csrfMiddleware, type AuthVariables } from '../middleware/auth.js';
import { resolveAgentMailAddress } from '../services/agentmail-bootstrap.service.js';
import {
  getArchiveById,
  getArchiveCounts,
  listArchive,
} from '../services/agent-mail-archive.service.js';
import { baseLayout } from '../views/layouts/base.html.js';
import {
  archiveDetailPage,
  archiveListPage,
  archiveNotFoundPage,
} from '../views/pages/agent-mail-archive.html.js';

export const adminArchiveRoute = new Hono<{ Variables: AuthVariables }>();

adminArchiveRoute.use('*', authMiddleware);
adminArchiveRoute.use('*', csrfMiddleware);

function isParseStatus(value: string): value is AgentMailParseStatus {
  return (AGENT_MAIL_PARSE_STATUSES as readonly string[]).includes(value);
}

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

adminArchiveRoute.get('/admin/agent-mail-archive', (c) => {
  const url = new URL(c.req.url);
  const statusParam = url.searchParams.get('status');
  const sourceParam = url.searchParams.get('source');

  const parseStatus = statusParam && isParseStatus(statusParam) ? statusParam : undefined;
  const detectedSource = sourceParam ?? undefined;

  const db = getDb();
  const items = listArchive({ parseStatus, detectedSource, limit: 100 }, db);
  const counts = getArchiveCounts(db);
  const csrfToken = c.get('csrfToken');
  const user = c.get('user');

  const body = archiveListPage({
    items,
    counts,
    filter: { parseStatus: parseStatus ?? null, detectedSource: detectedSource ?? null },
    agentMailAddress: resolveAgentMailAddress({ db }),
  });

  return c.html(
    baseLayout({
      title: 'AgentMail archive',
      body,
      reviewQueueCount: getReviewQueueCount(),
      userDisplayName: user?.displayName ?? null,
      csrfToken,
      showTourButton: false,
      showSimulateButton: false,
    }),
  );
});

adminArchiveRoute.get('/admin/agent-mail-archive/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const message = getArchiveById(id, db);
  const csrfToken = c.get('csrfToken');
  const user = c.get('user');

  const body = message ? archiveDetailPage({ message }) : archiveNotFoundPage(id);

  return c.html(
    baseLayout({
      title: message ? `Archived: ${message.subject ?? message.agentmailMessageId}` : 'Not found',
      body,
      reviewQueueCount: getReviewQueueCount(),
      userDisplayName: user?.displayName ?? null,
      csrfToken,
      showTourButton: false,
      showSimulateButton: false,
    }),
    message ? 200 : 404,
  );
});
