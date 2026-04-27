import { count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { leads } from '../db/schema.js';
import { baseLayout } from '../views/layouts/base.html.js';
import { statsPage } from '../views/pages/stats.html.js';
import { demoUserMiddleware, type DemoUserVariables } from '../middleware/demo-user.js';

export const statsRoute = new Hono<{ Variables: DemoUserVariables }>();

statsRoute.use('*', demoUserMiddleware);

function getReviewQueueCount(): number {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(eq(leads.status, 'awaiting_review'))
    .all();
  return Number(rows[0]?.value ?? 0);
}

statsRoute.get('/stats', (c) =>
  c.html(
    baseLayout({
      title: 'Stats',
      body: statsPage(),
      active: 'stats',
      reviewQueueCount: getReviewQueueCount(),
      userDisplayName: c.get('user')?.displayName ?? null,
    }),
  ),
);
