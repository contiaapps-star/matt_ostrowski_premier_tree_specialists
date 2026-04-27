import { html, raw } from 'hono/html';

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function confidenceBadge(score: number | null | undefined, reasoning?: string | null) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return html`<span
        class="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
        data-testid="confidence-badge"
        data-confidence="none"
        title="Not yet scored"
      >n/a</span>`;
  }

  const pct = Math.round(score * 100);
  let palette = 'bg-red-100 text-red-800 border-red-200';
  let bucket = 'low';
  if (score >= 0.8) {
    palette = 'bg-green-100 text-green-800 border-green-200';
    bucket = 'high';
  } else if (score >= 0.5) {
    palette = 'bg-amber-100 text-amber-800 border-amber-200';
    bucket = 'mid';
  }

  const tooltipText = reasoning ? escapeAttr(reasoning) : null;
  return html`<span
      class="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${palette}"
      data-testid="confidence-badge"
      data-confidence="${bucket}"
      data-score="${pct}"
      ${tooltipText ? raw(`title="${tooltipText}"`) : ''}
    >${pct}%</span>`;
}
