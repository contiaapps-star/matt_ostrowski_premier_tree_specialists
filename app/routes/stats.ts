import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { leads } from '../db/schema.js';
import { baseLayout } from '../views/layouts/base.html.js';
import { statsPage } from '../views/pages/stats.html.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { computeStats } from '../services/stats.service.js';

export const statsRoute = new Hono<{ Variables: AuthVariables }>();

statsRoute.use('*', authMiddleware);

const POLL_URL = '/stats/body';

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

statsRoute.get('/stats', (c) => {
  const stats = computeStats();
  return c.html(
    baseLayout({
      title: 'Stats',
      body: statsPage(stats, POLL_URL),
      active: 'stats',
      reviewQueueCount: getReviewQueueCount(),
      userDisplayName: c.get('user')?.displayName ?? null,
      csrfToken: c.get('csrfToken'),
    }),
  );
});

statsRoute.get('/stats/body', (c) => {
  return c.html(statsPage(computeStats(), POLL_URL));
});
