import { html } from 'hono/html';

function kpi(label: string, value: string, hint: string) {
  return html`<div class="pts-card" data-testid="stats-kpi">
    <div class="text-xs uppercase tracking-wide text-slate-500">${label}</div>
    <div class="mt-2 text-2xl font-semibold text-slate-400">${value}</div>
    <div class="mt-1 text-xs text-slate-500">${hint}</div>
  </div>`;
}

export function statsPage() {
  return html`<section data-testid="stats-page">
    <div class="mb-4">
      <h1 class="text-xl font-semibold text-slate-900">Stats</h1>
      <p class="text-sm text-slate-500">Stats coming in Phase 7. KPIs below are placeholders.</p>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="stats-grid">
      ${kpi('Time to first response', '—', 'avg / p50 / p95 last 7 days')}
      ${kpi('Auto-send rate', '—', '% of leads with confidence ≥ 80%')}
      ${kpi('Volume per source', '—', 'count last 7 days')}
      ${kpi('ArboStar sync rate', '—', '% successful pushes')}
      ${kpi('Out-of-service-area', '—', 'count last 7 days')}
    </div>
  </section>`;
}
