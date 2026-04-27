import { asc, count, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { leads } from '../db/schema.js';
import { baseLayout } from '../views/layouts/base.html.js';
import { queuePage } from '../views/pages/queue.html.js';
import { demoUserMiddleware, type DemoUserVariables } from '../middleware/demo-user.js';

export const queueRoute = new Hono<{ Variables: DemoUserVariables }>();

queueRoute.use('*', demoUserMiddleware);

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

function getFlaggedCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'manually_flagged'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

queueRoute.get('/queue', (c) => {
  const db = getDb();
  const items = db
    .select()
    .from(leads)
    .where(inArray(leads.status, ['awaiting_review', 'manually_flagged']))
    .orderBy(asc(leads.receivedAt))
    .all();

  const reviewCount = items.filter((l) => l.status === 'awaiting_review').length;
  const flaggedCount = items.filter((l) => l.status === 'manually_flagged').length;

  const now = Date.now();
  const waits = items
    .filter((l) => l.status === 'awaiting_review' && l.receivedAt instanceof Date)
    .map((l) => (now - (l.receivedAt as Date).getTime()) / 60_000);
  const averageWaitMinutes =
    waits.length === 0 ? null : waits.reduce((a, b) => a + b, 0) / waits.length;

  const body = queuePage({
    leads: items,
    reviewCount,
    flaggedCount,
    averageWaitMinutes,
  });

  const headerReviewCount = getReviewQueueCount();
  // Fallback if `reviewCount` differs (it shouldn't): use header for badge.
  void headerReviewCount;

  return c.html(
    baseLayout({
      title: 'Review Queue',
      body,
      active: 'queue',
      reviewQueueCount: reviewCount,
      userDisplayName: c.get('user')?.displayName ?? null,
    }),
  );
});

void getFlaggedCount;
