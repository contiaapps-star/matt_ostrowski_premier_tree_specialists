import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import {
  LEAD_SOURCES,
  LEAD_STATUSES,
  leads,
  type Lead,
  type LeadSource,
  type LeadStatus,
} from '../db/schema.js';
import { baseLayout } from '../views/layouts/base.html.js';
import {
  dashboardPage,
  leadsTablePartial,
  type DashboardFilters,
} from '../views/pages/dashboard.html.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';

export const dashboardRoute = new Hono<{ Variables: AuthVariables }>();

dashboardRoute.use('*', authMiddleware);

const PAGE_SIZE = 20;
const DEFAULT_LOOKBACK_DAYS = 7;

function parseDateBoundary(value: string | null, opts: { endOfDay?: boolean }): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map((s) => Number(s));
  if (!y || !m || !d) return null;
  const date = new Date(
    Date.UTC(y, m - 1, d, opts.endOfDay ? 23 : 0, opts.endOfDay ? 59 : 0, opts.endOfDay ? 59 : 0),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseFilters(
  qp: URLSearchParams,
): DashboardFilters & { fromDate: Date | null; toDate: Date | null } {
  const sourceRaw = qp.get('source');
  const statusRaw = qp.get('status');
  const fromRaw = qp.get('from');
  const toRaw = qp.get('to');

  const source =
    sourceRaw && (LEAD_SOURCES as readonly string[]).includes(sourceRaw) ? sourceRaw : null;
  const status =
    statusRaw && (LEAD_STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : null;

  return {
    source,
    status,
    from: fromRaw,
    to: toRaw,
    fromDate: parseDateBoundary(fromRaw, { endOfDay: false }),
    toDate: parseDateBoundary(toRaw, { endOfDay: true }),
  };
}

function buildWhere(parsed: ReturnType<typeof parseFilters>): SQL | undefined {
  const conditions: SQL[] = [];
  if (parsed.source) {
    conditions.push(eq(leads.source, parsed.source as LeadSource));
  }
  if (parsed.status) {
    conditions.push(eq(leads.status, parsed.status as LeadStatus));
  }

  let effectiveFrom = parsed.fromDate;
  if (!effectiveFrom && !parsed.toDate) {
    effectiveFrom = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  }
  if (effectiveFrom) {
    conditions.push(gte(leads.receivedAt, effectiveFrom));
  }
  if (parsed.toDate) {
    conditions.push(lte(leads.receivedAt, parsed.toDate));
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
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

function selectLeads(where: SQL | undefined, page: number): Lead[] {
  const db = getDb();
  const base = db.select().from(leads);
  const filtered = where ? base.where(where) : base;
  return filtered
    .orderBy(desc(leads.receivedAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE)
    .all() as Lead[];
}

function countLeads(where: SQL | undefined): number {
  const db = getDb();
  const base = db.select({ value: count() }).from(leads);
  const rows = (where ? base.where(where) : base).all();
  return Number(rows[0]?.value ?? 0);
}

dashboardRoute.get('/', (c) => c.redirect('/dashboard'));

dashboardRoute.get('/dashboard', (c) => {
  const url = new URL(c.req.url);
  const parsed = parseFilters(url.searchParams);
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const where = buildWhere(parsed);
  const total = countLeads(where);
  const items = selectLeads(where, page);

  const reviewCount = getReviewQueueCount();
  const user = c.get('user');

  const partialQs = url.searchParams.toString();
  const pollUrl = `/dashboard/leads-table${partialQs ? `?${partialQs}` : ''}`;

  const body = dashboardPage({
    leads: items,
    filters: { source: parsed.source, status: parsed.status, from: parsed.from, to: parsed.to },
    total,
    page,
    pageSize: PAGE_SIZE,
    pollUrl,
  });

  return c.html(
    baseLayout({
      title: 'Dashboard',
      body,
      active: 'dashboard',
      reviewQueueCount: reviewCount,
      userDisplayName: user?.displayName ?? null,
      csrfToken: c.get('csrfToken'),
    }),
  );
});

dashboardRoute.get('/dashboard/leads-table', (c) => {
  const url = new URL(c.req.url);
  const parsed = parseFilters(url.searchParams);
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const where = buildWhere(parsed);
  const items = selectLeads(where, page);
  const partialQs = url.searchParams.toString();
  const pollUrl = `/dashboard/leads-table${partialQs ? `?${partialQs}` : ''}`;
  return c.html(leadsTablePartial(items, pollUrl));
});
