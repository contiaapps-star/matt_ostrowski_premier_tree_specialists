import { html, raw } from 'hono/html';
import type { Lead } from '../../db/schema.js';
import { emptyState } from '../partials/empty-state.html.js';
import { leadRow } from '../partials/lead-row.html.js';

export interface QueuePageData {
  leads: Lead[];
  reviewCount: number;
  flaggedCount: number;
  averageWaitMinutes: number | null;
  /** When provided, the queue body polls this URL every 15 s to stay live. */
  pollUrl?: string;
}

export function queueBodyPartial(data: QueuePageData) {
  const { leads, reviewCount, flaggedCount, averageWaitMinutes, pollUrl } = data;
  const total = leads.length;
  const avgText =
    averageWaitMinutes === null
      ? 'no wait data yet'
      : `average wait: ${Math.round(averageWaitMinutes)} min`;

  const pollAttrs = pollUrl
    ? raw(
        ` hx-get="${pollUrl}" hx-trigger="every 15s[document.visibilityState==='visible']" hx-swap="outerHTML" hx-disinherit="*"`,
      )
    : raw('');

  return html`<div id="queue-body-region" data-testid="queue-body-region"${pollAttrs}>
    <p class="text-sm text-slate-500" data-testid="queue-subtitle">
      ${reviewCount} awaiting review · ${flaggedCount} manually flagged · ${avgText}
    </p>

    <div class="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 mt-3 mb-4" data-testid="queue-banner">
      <strong>${total} lead${total === 1 ? '' : 's'} need attention.</strong>
      Oldest first; tackle these to keep response time under 1 minute.
    </div>

    ${total === 0
      ? emptyState({
          title: 'Inbox zero! No leads need review.',
          description: 'New review-queue items will appear here automatically.',
          testId: 'empty-state-queue',
        })
      : html`<div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-200" data-testid="queue-table">
            <thead class="bg-slate-50">
              <tr class="text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                <th class="px-4 py-2">Customer</th>
                <th class="px-4 py-2">Source</th>
                <th class="px-4 py-2">Scope</th>
                <th class="px-4 py-2">City / ZIP</th>
                <th class="px-4 py-2">Confidence</th>
                <th class="px-4 py-2">Status</th>
                <th class="px-4 py-2">Received</th>
                <th class="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100" data-testid="queue-table-body">
              ${leads.map((l) => leadRow(l))}
            </tbody>
          </table>
        </div>`}
  </div>`;
}

export function queuePage(data: QueuePageData) {
  return html`<section data-testid="queue-page">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Review Queue</h1>
      </div>
    </div>
    ${queueBodyPartial(data)}
  </section>`;
}
