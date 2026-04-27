import { html, raw } from 'hono/html';
import type { StatsSnapshot, VolumePerSource } from '../../services/stats.service.js';

function formatMinutes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1) {
    const seconds = Math.round(value * 60);
    return `${seconds}s`;
  }
  if (value < 60) return `${value.toFixed(1)}m`;
  const hours = value / 60;
  return `${hours.toFixed(1)}h`;
}

function formatPct(value: number | null): string {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
}

function kpiCard(label: string, value: string, hint: string, testId: string) {
  return html`<div class="pts-card" data-testid="${testId}">
    <div class="text-xs uppercase tracking-wide text-slate-500">${label}</div>
    <div class="mt-2 text-2xl font-semibold text-slate-900">${value}</div>
    <div class="mt-1 text-xs text-slate-500">${hint}</div>
  </div>`;
}

function sourceLabel(source: string): string {
  if (source === 'google_lsa_email') return 'Google LSA';
  if (source === 'website_form') return 'Website Form';
  if (source === 'answerforce_email') return 'AnswerForce';
  return source;
}

function barChart(daily: VolumePerSource['daily'], testId: string) {
  const max = Math.max(1, ...daily.map((d) => d.count));
  const barWidth = 18;
  const gap = 4;
  const chartHeight = 60;
  const labelHeight = 14;
  const totalWidth = daily.length * (barWidth + gap);
  const totalHeight = chartHeight + labelHeight;

  const bars = daily
    .map((d, i) => {
      const barHeight = max === 0 ? 0 : (d.count / max) * (chartHeight - 2);
      const x = i * (barWidth + gap);
      const y = chartHeight - barHeight;
      const label = d.day.slice(5); // MM-DD
      return `
        <g>
          <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}"
                rx="2" fill="#16a34a" opacity="${d.count === 0 ? 0.2 : 0.85}">
            <title>${d.day}: ${d.count}</title>
          </rect>
          <text x="${x + barWidth / 2}" y="${chartHeight + labelHeight - 2}"
                text-anchor="middle" font-size="9" fill="#64748b">${label}</text>
        </g>`;
    })
    .join('');

  return html`<svg
      viewBox="0 0 ${totalWidth} ${totalHeight}"
      width="100%" height="${totalHeight}"
      preserveAspectRatio="none"
      data-testid="${testId}"
      role="img"
      aria-label="Daily volume bar chart"
    >${raw(bars)}</svg>`;
}

function volumePerSourceCard(item: VolumePerSource) {
  return html`<div
      class="pts-card"
      data-testid="stats-volume-source"
      data-source="${item.source}"
    >
    <div class="flex items-center justify-between">
      <div class="text-xs uppercase tracking-wide text-slate-500">${sourceLabel(item.source)}</div>
      <div class="text-sm font-semibold text-slate-900" data-testid="stats-volume-total">${item.total}</div>
    </div>
    <div class="mt-2">${barChart(item.daily, `stats-bar-${item.source}`)}</div>
    <div class="mt-1 text-xs text-slate-500">last 7 days</div>
  </div>`;
}

/**
 * Renders the full stats body, including the htmx polling attributes when
 * `pollUrl` is provided. The same render is used both for the initial
 * full-page render and for the every-60-s self-replacement (the response
 * to GET `/stats/body` is this same section, so it keeps re-arming the
 * trigger after each swap).
 */
export function statsPage(stats: StatsSnapshot, pollUrl?: string) {
  const pollAttrs = pollUrl
    ? raw(
        ` hx-get="${pollUrl}" hx-trigger="every 60s[document.visibilityState==='visible']" hx-swap="outerHTML" hx-disinherit="*"`,
      )
    : raw('');
  const responseTime = stats.responseTime;
  const responseTimeValue =
    responseTime.count === 0
      ? '—'
      : `${formatMinutes(responseTime.avgMinutes)} avg`;
  const responseTimeHint =
    responseTime.count === 0
      ? 'No leads dispatched in the last 7 days yet.'
      : `p50 ${formatMinutes(responseTime.p50Minutes)} · p95 ${formatMinutes(responseTime.p95Minutes)} · n=${responseTime.count}`;

  const autoSendValue = formatPct(stats.autoSendRate.ratePct);
  const autoSendHint =
    stats.autoSendRate.totalProcessed === 0
      ? 'No processed leads yet.'
      : `${stats.autoSendRate.autoSent} auto-sent of ${stats.autoSendRate.totalProcessed} processed`;

  const arbostarValue = formatPct(stats.arboStarSyncRate.ratePct);
  const arbostarHint =
    stats.arboStarSyncRate.processed === 0
      ? 'No outbound dispatches yet.'
      : `${stats.arboStarSyncRate.synced}/${stats.arboStarSyncRate.processed} synced`;

  const oosValue = stats.outOfServiceArea.count.toString();
  const oosHint = stats.outOfServiceArea.ratePct === null
    ? 'No leads in window.'
    : `${formatPct(stats.outOfServiceArea.ratePct)} of total`;

  const flagValue = stats.manualFlagCount.total.toString();
  const flagHintParts = stats.manualFlagCount.byReason
    .sort((a, b) => b.count - a.count)
    .map((r) => `${r.reason}: ${r.count}`);
  const flagHint = flagHintParts.length === 0 ? 'No flags this week.' : flagHintParts.join(' · ');

  return html`<section id="stats-page-region" data-testid="stats-page"${pollAttrs}>
    <div class="mb-4">
      <h1 class="text-xl font-semibold text-slate-900">Stats — last 7 days</h1>
      <p class="text-sm text-slate-500" data-testid="stats-window">
        Window: ${stats.windowStart.toISOString().slice(0, 10)} → ${stats.windowEnd.toISOString().slice(0, 10)} ·
        ${stats.totalLeadsInWindow} lead${stats.totalLeadsInWindow === 1 ? '' : 's'} received
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="stats-grid">
      ${kpiCard('Time to first response', responseTimeValue, responseTimeHint, 'stats-kpi-response-time')}
      ${kpiCard('Auto-send rate', autoSendValue, autoSendHint, 'stats-kpi-auto-send-rate')}
      ${kpiCard('ArboStar sync rate', arbostarValue, arbostarHint, 'stats-kpi-arbostar-sync-rate')}
      ${kpiCard('Out-of-service-area', oosValue, oosHint, 'stats-kpi-out-of-service-area')}
      ${kpiCard('Manual flags', flagValue, flagHint, 'stats-kpi-manual-flag-count')}
    </div>

    <div class="mt-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-2">Volume per source</h2>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3" data-testid="stats-volume-grid">
        ${stats.volumePerSource.map(volumePerSourceCard)}
      </div>
    </div>

    <p class="mt-4 text-xs text-slate-400" data-testid="stats-cached-at">
      Cached at ${stats.cachedAt.toISOString()} (refreshes every 60s).
    </p>
  </section>`;
}
