import { html } from 'hono/html';
import type { LeadStatus } from '../../db/schema.js';
import { isHandled, isInProgress } from '../../lib/format.js';

/**
 * Per Zaki's review: only two states matter to the user — "handled" (auto-sent
 * or manually sent) shows green; everything else shows amber as "Needs Review".
 * Internal in-flight states (extracting, responding, ingested) render as a
 * neutral grey "Processing" pill since they're transient and rarely seen.
 */
export function statusBadge(status: string) {
  const safeStatus = status as LeadStatus;
  if (isHandled(safeStatus)) {
    return html`<span
        class="inline-flex items-center rounded-full border bg-green-100 text-green-800 border-green-200 px-2.5 py-0.5 text-xs font-medium"
        data-testid="status-badge"
        data-status="${safeStatus}"
        data-state="handled"
      >Auto-sent</span>`;
  }
  if (isInProgress(safeStatus)) {
    return html`<span
        class="inline-flex items-center rounded-full border bg-slate-100 text-slate-700 border-slate-200 px-2.5 py-0.5 text-xs font-medium"
        data-testid="status-badge"
        data-status="${safeStatus}"
        data-state="processing"
      >Processing</span>`;
  }
  return html`<span
      class="inline-flex items-center rounded-full border bg-amber-100 text-amber-800 border-amber-200 px-2.5 py-0.5 text-xs font-medium"
      data-testid="status-badge"
      data-status="${safeStatus}"
      data-state="needs-review"
    >Needs Review</span>`;
}
