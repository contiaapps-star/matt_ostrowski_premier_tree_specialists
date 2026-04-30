import { html } from 'hono/html';
import type { StatsSnapshot } from '../../services/stats.service.js';

interface KpiCardProps {
  label: string;
  value: string;
  accent?: 'brand' | 'accent' | 'amber' | 'slate';
  testid: string;
  hint?: string;
}

function kpiCard({ label, value, accent = 'slate', testid, hint }: KpiCardProps) {
  const accentClass = {
    brand: 'text-brand-700',
    accent: 'text-green-700',
    amber: 'text-amber-700',
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
  pollUrl: string;
}

function fmtPct(value: number | null): string {
  if (value == null) return '—';
  return `${Math.round(value)}%`;
}

function fmtCount(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function kpiStrip({ snapshot, pollUrl }: KpiStripProps) {
  const totalProcessed = snapshot.autoSendRate.totalProcessed;
  const autoSent = snapshot.autoSendRate.autoSent;
  const responseRatePct = snapshot.autoSendRate.ratePct;
  // "Needs Review" = everything that landed in the inbox during the window and
  // hasn't been auto/manually sent yet (awaiting review, flagged, failed,
  // ingested, etc.).
  const needsReview = Math.max(0, snapshot.totalLeadsInWindow - autoSent);
  void totalProcessed;
  return html`<section
      id="kpi-strip-region"
      class="grid grid-cols-2 gap-3 sm:grid-cols-4"
      data-testid="kpi-strip"
      data-tour="kpis"
      hx-get="${pollUrl}"
      hx-trigger="every 60s[document.visibilityState==='visible']"
      hx-swap="outerHTML"
      aria-label="Last 24 hours key metrics"
    >
      ${kpiCard({
        label: 'Total Leads',
        value: fmtCount(snapshot.totalLeadsInWindow),
        accent: 'slate',
        testid: 'kpi-total',
        hint: 'last 24h',
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
        label: 'Response Rate',
        value: fmtPct(responseRatePct),
        accent: 'brand',
        testid: 'kpi-response-rate',
        hint: 'auto-handled',
      })}
    </section>`;
}
