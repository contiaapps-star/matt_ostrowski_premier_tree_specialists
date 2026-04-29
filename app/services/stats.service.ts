import { and, count, eq, gte, isNotNull, sql, type SQL } from 'drizzle-orm';
import { config } from '../config.js';
import { getDb } from '../db/client.js';
import { auditLog, leads, type LeadSource } from '../db/schema.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_TTL_MS = 60_000;

export interface ComputeStatsOptions {
  hours?: number;
}

export interface ResponseTimeStats {
  count: number;
  avgMinutes: number | null;
  p50Minutes: number | null;
  p95Minutes: number | null;
  subOneMinutePct: number | null;
}

export interface DailyVolumePoint {
  day: string; // YYYY-MM-DD (UTC)
  count: number;
}

export interface VolumePerSource {
  source: LeadSource;
  total: number;
  daily: DailyVolumePoint[];
}

export interface StatsSnapshot {
  windowStart: Date;
  windowEnd: Date;
  totalLeadsInWindow: number;
  responseTime: ResponseTimeStats;
  autoSendRate: { autoSent: number; totalProcessed: number; ratePct: number | null };
  volumePerSource: VolumePerSource[];
  arboStarSyncRate: { synced: number; processed: number; ratePct: number | null };
  outOfServiceArea: { count: number; ratePct: number | null };
  manualFlagCount: { total: number; byReason: Array<{ reason: string; count: number }> };
  cachedAt: Date;
}

const cacheByHours = new Map<number, { snapshot: StatsSnapshot; expiresAt: number }>();

export function clearStatsCache(): void {
  cacheByHours.clear();
}

export function computeStats(now: Date = new Date(), options: ComputeStatsOptions = {}): StatsSnapshot {
  const windowMs = options.hours != null ? options.hours * 60 * 60 * 1000 : SEVEN_DAYS_MS;
  const cached = cacheByHours.get(windowMs);
  if (cached && cached.expiresAt > now.getTime()) {
    return cached.snapshot;
  }
  const snapshot = computeFresh(now, windowMs);
  cacheByHours.set(windowMs, { snapshot, expiresAt: now.getTime() + CACHE_TTL_MS });
  return snapshot;
}

function computeFresh(now: Date, windowMs: number): StatsSnapshot {
  const windowStart = new Date(now.getTime() - windowMs);
  const db = getDb();

  // Total leads received in window.
  const totalRows = db
    .select({ value: count() })
    .from(leads)
    .where(gte(leads.receivedAt, windowStart))
    .all();
  const totalLeadsInWindow = Number(totalRows[0]?.value ?? 0);

  const responseTime = computeResponseTime(windowStart);
  const autoSendRate = computeAutoSendRate(windowStart);
  const volumePerSource = computeVolumePerSource(windowStart, now);
  const arboStarSyncRate = computeArboStarSyncRate(windowStart);
  const outOfServiceArea = computeOutOfServiceArea(windowStart, totalLeadsInWindow);
  const manualFlagCount = computeManualFlagCount(windowStart);

  return {
    windowStart,
    windowEnd: now,
    totalLeadsInWindow,
    responseTime,
    autoSendRate,
    volumePerSource,
    arboStarSyncRate,
    outOfServiceArea,
    manualFlagCount,
    cachedAt: now,
  };
}

function isProcessedStatus(): SQL<unknown> {
  return sql`${leads.status} IN ('auto_sent','manually_sent','manually_flagged','awaiting_review')`;
}

function computeResponseTime(windowStart: Date): ResponseTimeStats {
  const db = getDb();
  // Only leads that actually have a response_sent_at within the window.
  const rows = db
    .select({
      delta: sql<number>`((${leads.responseSentAt} - ${leads.receivedAt}) / 1000.0 / 60.0)`,
    })
    .from(leads)
    .where(
      and(
        isNotNull(leads.responseSentAt),
        gte(leads.responseSentAt, windowStart),
        sql`${leads.responseSentAt} >= ${leads.receivedAt}`,
      ),
    )
    .all();

  const minutes = rows
    .map((r) => Number(r.delta))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);

  if (minutes.length === 0) {
    return { count: 0, avgMinutes: null, p50Minutes: null, p95Minutes: null, subOneMinutePct: null };
  }

  const avg = minutes.reduce((a, b) => a + b, 0) / minutes.length;
  const p50 = percentile(minutes, 0.5);
  const p95 = percentile(minutes, 0.95);
  const underOne = minutes.filter((m) => m < 1).length;
  const subOneMinutePct = round2((underOne / minutes.length) * 100);
  return {
    count: minutes.length,
    avgMinutes: round2(avg),
    p50Minutes: round2(p50),
    p95Minutes: round2(p95),
    subOneMinutePct,
  };
}

function percentile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * q)));
  return sortedAsc[idx]!;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeAutoSendRate(windowStart: Date): StatsSnapshot['autoSendRate'] {
  const db = getDb();
  // Total leads that reached a "decision" state in the window.
  const totalRows = db
    .select({ value: count() })
    .from(leads)
    .where(and(gte(leads.receivedAt, windowStart), isProcessedStatus()))
    .all();
  const totalProcessed = Number(totalRows[0]?.value ?? 0);

  const autoRows = db
    .select({ value: count() })
    .from(leads)
    .where(and(gte(leads.receivedAt, windowStart), eq(leads.status, 'auto_sent')))
    .all();
  const autoSent = Number(autoRows[0]?.value ?? 0);

  const ratePct = totalProcessed === 0 ? null : round2((autoSent / totalProcessed) * 100);
  return { autoSent, totalProcessed, ratePct };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeVolumePerSource(windowStart: Date, now: Date): VolumePerSource[] {
  const db = getDb();
  const sources: LeadSource[] = ['google_lsa_email', 'website_form', 'answerforce_email'];

  const result: VolumePerSource[] = [];
  for (const source of sources) {
    const rows = db
      .select({ receivedAt: leads.receivedAt })
      .from(leads)
      .where(and(eq(leads.source, source), gte(leads.receivedAt, windowStart)))
      .all();

    const dailyMap = new Map<string, number>();
    // Pre-fill last 7 days with zeros for nice charts.
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dailyMap.set(isoDay(day), 0);
    }
    for (const row of rows) {
      const day = isoDay(row.receivedAt as Date);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);
    }

    const daily = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, c]) => ({ day, count: c }));

    result.push({ source, total: rows.length, daily });
  }
  return result;
}

function computeArboStarSyncRate(windowStart: Date): StatsSnapshot['arboStarSyncRate'] {
  const db = getDb();
  // Among leads that were SENT in the window (auto_sent or manually_sent),
  // what fraction were synced to ArboStar?
  const sentRows = db
    .select({ value: count() })
    .from(leads)
    .where(
      and(
        gte(leads.receivedAt, windowStart),
        sql`${leads.status} IN ('auto_sent','manually_sent')`,
      ),
    )
    .all();
  const processed = Number(sentRows[0]?.value ?? 0);

  const syncedRows = db
    .select({ value: count() })
    .from(leads)
    .where(
      and(
        gte(leads.receivedAt, windowStart),
        sql`${leads.status} IN ('auto_sent','manually_sent')`,
        isNotNull(leads.arbostarSyncedAt),
      ),
    )
    .all();
  const synced = Number(syncedRows[0]?.value ?? 0);

  const ratePct = processed === 0 ? null : round2((synced / processed) * 100);
  return { synced, processed, ratePct };
}

function computeOutOfServiceArea(
  windowStart: Date,
  totalLeadsInWindow: number,
): StatsSnapshot['outOfServiceArea'] {
  const db = getDb();
  const rows = db
    .select({ value: count() })
    .from(leads)
    .where(and(gte(leads.receivedAt, windowStart), eq(leads.outOfServiceArea, true)))
    .all();
  const c = Number(rows[0]?.value ?? 0);
  const ratePct = totalLeadsInWindow === 0 ? null : round2((c / totalLeadsInWindow) * 100);
  return { count: c, ratePct };
}

function computeManualFlagCount(windowStart: Date): StatsSnapshot['manualFlagCount'] {
  const db = getDb();
  const rows = db
    .select()
    .from(leads)
    .where(and(gte(leads.receivedAt, windowStart), eq(leads.status, 'manually_flagged')))
    .all();
  const total = rows.length;

  const byReason = new Map<string, number>();
  for (const row of rows) {
    let reason = 'other';
    if (row.escalationTriggered) reason = 'escalation';
    else if ((row.confidenceScore ?? 0) < (config.CONFIDENCE_DRAFT_THRESHOLD ?? 0.5)) {
      reason = 'low_confidence';
    } else if (
      row.customerName == null ||
      (row.customerEmail == null && row.customerPhoneE164 == null)
    ) {
      reason = 'missing_data';
    }
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
  }

  return {
    total,
    byReason: Array.from(byReason.entries()).map(([reason, c]) => ({ reason, count: c })),
  };
}

export function getLastIntakeAt(): Date | null {
  const db = getDb();
  const rows = db
    .select({ ts: auditLog.createdAt })
    .from(auditLog)
    .where(sql`${auditLog.action} IN ('ingested','ingested_dedup_merge')`)
    .orderBy(sql`${auditLog.createdAt} DESC`)
    .limit(1)
    .all();
  if (rows.length === 0) return null;
  return rows[0]!.ts as Date;
}
