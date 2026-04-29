import { and, asc, count, desc, eq, gte, inArray, type SQL } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { getDb } from '../db/client.js';
import {
  LEAD_SOURCES,
  auditLog,
  leads,
  leadSourceEvents,
  outboundMessages,
  type AuditLogRow,
  type Lead,
  type LeadSource,
  type LeadSourceEvent,
  type OutboundMessage,
} from '../db/schema.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import {
  DEFAULT_TIME_RANGE,
  parseTimeRange,
  rangeStartDate,
  rangeHours,
  type TimeRangeKey,
} from '../lib/time-range.js';
import { computeStats } from '../services/stats.service.js';
import { baseLayout } from '../views/layouts/base.html.js';
import {
  detailPanel,
  detailPanelEmpty,
} from '../views/partials/detail-panel.html.js';
import { kpiStrip } from '../views/partials/kpi-strip.html.js';
import { notFoundPage } from '../views/pages/lead-detail.html.js';
import {
  TRIAGE_KEYS,
  leadsListRegion,
  workspacePage,
  type TriageKey,
  type WorkspaceFilters,
} from '../views/pages/workspace.html.js';

export const workspaceRoute = new Hono<{ Variables: AuthVariables }>();

workspaceRoute.use('*', authMiddleware);

const PAGE_LIMIT = 50;

const TRIAGE_STATUS_MAP: Record<TriageKey, readonly Lead['status'][] | null> = {
  all: null,
  auto: ['auto_sent', 'manually_sent'],
  needs_review: ['awaiting_review'],
  flagged: ['manually_flagged', 'failed'],
};

function parseTriage(value: string | null): TriageKey {
  if (!value) return 'all';
  return (TRIAGE_KEYS as readonly string[]).includes(value) ? (value as TriageKey) : 'all';
}

function parseSource(value: string | null): LeadSource | null {
  if (!value) return null;
  return (LEAD_SOURCES as readonly string[]).includes(value) ? (value as LeadSource) : null;
}

function parseFilters(qp: URLSearchParams): WorkspaceFilters {
  return {
    range: parseTimeRange(qp.get('range')),
    source: parseSource(qp.get('source')),
    triage: parseTriage(qp.get('triage')),
  };
}

function buildWhere(filters: WorkspaceFilters): SQL | undefined {
  const conditions: SQL[] = [gte(leads.receivedAt, rangeStartDate(filters.range))];
  if (filters.source) {
    conditions.push(eq(leads.source, filters.source));
  }
  const triageStatuses = TRIAGE_STATUS_MAP[filters.triage];
  if (triageStatuses) {
    conditions.push(inArray(leads.status, [...triageStatuses]));
  }
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
}

function selectLeads(filters: WorkspaceFilters): { items: Lead[]; total: number } {
  const db = getDb();
  const where = buildWhere(filters);
  const items = (where
    ? db.select().from(leads).where(where).orderBy(desc(leads.receivedAt)).limit(PAGE_LIMIT)
    : db.select().from(leads).orderBy(desc(leads.receivedAt)).limit(PAGE_LIMIT)
  ).all() as Lead[];
  const totalRows = (where
    ? db.select({ value: count() }).from(leads).where(where)
    : db.select({ value: count() }).from(leads)
  ).all();
  return { items, total: Number(totalRows[0]?.value ?? 0) };
}

function computeTriageCounts(filters: WorkspaceFilters): Record<TriageKey, number> {
  const db = getDb();
  const baseRange = gte(leads.receivedAt, rangeStartDate(filters.range));
  const sourceCond = filters.source ? eq(leads.source, filters.source) : null;

  function countFor(triage: TriageKey): number {
    const statuses = TRIAGE_STATUS_MAP[triage];
    const conditions: SQL[] = [baseRange];
    if (sourceCond) conditions.push(sourceCond);
    if (statuses) conditions.push(inArray(leads.status, [...statuses]));
    const where = conditions.length === 1 ? conditions[0]! : and(...conditions)!;
    const rows = db.select({ value: count() }).from(leads).where(where).all();
    return Number(rows[0]?.value ?? 0);
  }

  return {
    all: countFor('all'),
    auto: countFor('auto'),
    needs_review: countFor('needs_review'),
    flagged: countFor('flagged'),
  };
}

function loadLead(id: string): Lead | null {
  const db = getDb();
  const rows = db.select().from(leads).where(eq(leads.id, id)).all();
  return rows.length > 0 ? (rows[0] as Lead) : null;
}

function loadLeadDetailBundle(leadId: string): {
  auditEvents: AuditLogRow[];
  sourceEvents: LeadSourceEvent[];
  outboundMessages: OutboundMessage[];
} {
  const db = getDb();
  const auditEvents = db
    .select()
    .from(auditLog)
    .where(eq(auditLog.leadId, leadId))
    .orderBy(desc(auditLog.createdAt))
    .all() as AuditLogRow[];
  const sourceEvents = db
    .select()
    .from(leadSourceEvents)
    .where(eq(leadSourceEvents.leadId, leadId))
    .orderBy(asc(leadSourceEvents.receivedAt))
    .all() as LeadSourceEvent[];
  const outboundMessagesRows = db
    .select()
    .from(outboundMessages)
    .where(eq(outboundMessages.leadId, leadId))
    .orderBy(asc(outboundMessages.createdAt))
    .all() as OutboundMessage[];
  return { auditEvents, sourceEvents, outboundMessages: outboundMessagesRows };
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

function renderShell(c: Context<{ Variables: AuthVariables }>, activeLeadId: string | null) {
  const url = new URL(c.req.url);
  const filters = parseFilters(url.searchParams);
  const { items, total } = selectLeads(filters);
  const triageCounts = computeTriageCounts(filters);
  const snapshot = computeStats(new Date(), { hours: rangeHours(filters.range) });
  let activeLead = null;
  if (activeLeadId) {
    const lead = loadLead(activeLeadId);
    if (lead) {
      activeLead = { lead, ...loadLeadDetailBundle(lead.id) };
    }
  }
  const reviewCount = getReviewQueueCount();
  const user = c.get('user');
  const body = workspacePage({ filters, leads: items, total, triageCounts, snapshot, activeLead });
  return c.html(
    baseLayout({
      title: activeLead?.lead.customerName ?? 'Workspace',
      body,
      reviewQueueCount: reviewCount,
      userDisplayName: user?.displayName ?? null,
      csrfToken: c.get('csrfToken'),
    }),
  );
}

workspaceRoute.get('/', (c) => renderShell(c, null));

workspaceRoute.get('/leads/:id', (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) {
    const reviewCount = getReviewQueueCount();
    const user = c.get('user');
    return c.html(
      baseLayout({
        title: 'Lead not found',
        body: notFoundPage(id),
        reviewQueueCount: reviewCount,
        userDisplayName: user?.displayName ?? null,
        csrfToken: c.get('csrfToken'),
      }),
      404,
    );
  }
  return renderShell(c, id);
});

workspaceRoute.get('/partials/leads-list', (c) => {
  const url = new URL(c.req.url);
  const filters = parseFilters(url.searchParams);
  const { items, total } = selectLeads(filters);
  return c.html(leadsListRegion(items, filters, total, null));
});

workspaceRoute.get('/partials/kpi-strip', (c) => {
  const url = new URL(c.req.url);
  const range: TimeRangeKey = parseTimeRange(url.searchParams.get('range'));
  const snapshot = computeStats(new Date(), { hours: rangeHours(range) });
  const search = url.searchParams.toString();
  const pollUrl = `/partials/kpi-strip${search ? `?${search}` : ''}`;
  return c.html(kpiStrip({ snapshot, range, pollUrl }));
});

workspaceRoute.get('/partials/lead-detail/:id', (c) => {
  const id = c.req.param('id');
  const lead = loadLead(id);
  if (!lead) {
    return c.html(detailPanelEmpty(), 404);
  }
  const bundle = loadLeadDetailBundle(id);
  return c.html(detailPanel({ lead, ...bundle }));
});

workspaceRoute.get('/partials/detail-panel-empty', (c) => c.html(detailPanelEmpty()));

// Legacy redirects — old paths map onto the workspace with preset filters.
workspaceRoute.get('/dashboard', (c) => {
  const url = new URL(c.req.url);
  const params = url.searchParams.toString();
  return c.redirect(params ? `/?${params}` : '/');
});
workspaceRoute.get('/queue', (c) => c.redirect('/?triage=needs_review'));
workspaceRoute.get('/stats', (c) => c.redirect('/?range=week'));

void DEFAULT_TIME_RANGE;
