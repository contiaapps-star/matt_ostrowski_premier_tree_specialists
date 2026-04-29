import { html } from 'hono/html';
import type { StatsSnapshot } from '../../services/stats.service.js';
import type { TimeRangeKey } from '../../lib/time-range.js';
import { TIME_RANGES } from '../../lib/time-range.js';

interface KpiCardProps {
  label: string;
  value: string;
  accent?: 'brand' | 'accent' | 'amber' | 'rose' | 'slate';
  testid: string;
  hint?: string;
}

function kpiCard({ label, value, accent = 'slate', testid, hint }: KpiCardProps) {
  const accentClass = {
    brand: 'text-brand-700',
    accent: 'text-accent-700',
    amber: 'text-amber-700',
    rose: 'text-rose-700',
    slate: 'text-slate-800',
  }[accent];
  return html`<div
      class="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
      data-testid="${testid}"
    >
      <span class="text-2xl font-semibold ${accentClass} leading-tight">${value}</span>
      <span class="text-[11px] font-medium uppercase tracking-wider text-slate-500">${label}</span>
      ${hint ? html`<span class="text-xs text-slate-500">${hint}</span>` : html``}
    </div>`;
}

export interface KpiStripProps {
  snapshot: StatsSnapshot;
  range: TimeRangeKey;
  pollUrl: string;
}

function fmtPct(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)}%`;
}

function fmtCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function kpiStrip({ snapshot, range, pollUrl }: KpiStripProps) {
  const totalProcessed = snapshot.autoSendRate.totalProcessed;
  const autoSent = snapshot.autoSendRate.autoSent;
  const automationPct = snapshot.autoSendRate.ratePct;
  const subOne = snapshot.responseTime.subOneMinutePct;
  const needsReview = Math.max(0, totalProcessed - autoSent - snapshot.manualFlagCount.total);
  const flagged = snapshot.manualFlagCount.total;
  const rangeLabel = TIME_RANGES[range].label;
  return html`<section
      id="kpi-strip-region"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      data-testid="kpi-strip"
      data-tour="kpis"
      hx-get="${pollUrl}"
      hx-trigger="every 60s[document.visibilityState==='visible']"
      hx-swap="outerHTML"
      aria-label="${rangeLabel} key metrics"
    >
      ${kpiCard({
        label: 'Total Leads',
        value: fmtCount(snapshot.totalLeadsInWindow),
        accent: 'slate',
        testid: 'kpi-total',
        hint: rangeLabel,
      })}
      ${kpiCard({
        label: 'Auto-Sent',
        value: fmtCount(autoSent),
        accent: 'accent',
        testid: 'kpi-auto-sent',
      })}
      ${kpiCard({
        label: 'Needs Review',
        value: fmtCount(needsReview),
        accent: 'amber',
        testid: 'kpi-needs-review',
      })}
      ${kpiCard({
        label: 'Flagged',
        value: fmtCount(flagged),
        accent: 'rose',
        testid: 'kpi-flagged',
      })}
      ${kpiCard({
        label: 'Automation Rate',
        value: fmtPct(automationPct),
        accent: 'brand',
        testid: 'kpi-automation-rate',
      })}
      ${kpiCard({
        label: '< 1 Min Response',
        value: fmtPct(subOne),
        accent: 'accent',
        testid: 'kpi-sub-one-min',
      })}
    </section>`;
}
