import { html } from 'hono/html';
import type { Lead } from '../../db/schema.js';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatSource,
  formatTimeAgo,
  truncate,
} from '../../lib/format.js';
import { confidenceBadge } from './confidence-badge.html.js';
import { statusBadge } from './status-badge.html.js';

export function leadRow(lead: Lead) {
  const customerName = lead.customerName ?? '(unknown name)';
  const phone = formatPhone(lead.customerPhoneE164);
  const cityZip = [lead.customerCity, lead.customerZip].filter(Boolean).join(' · ');
  const scopeText =
    truncate(lead.scopeSummary, 60) || truncate(lead.scopeRaw, 60) || '(no scope)';
  const detailUrl = `/leads/${encodeURIComponent(lead.id)}`;

  return html`<tr
      class="border-b border-slate-200 hover:bg-slate-50 cursor-pointer"
      data-testid="lead-row"
      data-lead-id="${lead.id}"
      hx-get="${detailUrl}"
      hx-target="body"
      hx-push-url="true"
    >
      <td class="px-4 py-3 align-top">
        <div class="font-medium text-slate-900">${customerName}</div>
        ${phone ? html`<div class="text-xs text-slate-500">${phone}</div>` : ''}
      </td>
      <td class="px-4 py-3 align-top text-sm text-slate-700" data-testid="lead-row-source">
        ${formatSource(lead.source)}
      </td>
      <td class="px-4 py-3 align-top text-sm text-slate-700">
        <div>${formatScopeCategory(lead.scopeCategory)}</div>
        <div class="text-xs text-slate-500">${scopeText}</div>
      </td>
      <td class="px-4 py-3 align-top text-sm text-slate-700">${cityZip || '—'}</td>
      <td class="px-4 py-3 align-top">${confidenceBadge(lead.confidenceScore, lead.confidenceReasoning)}</td>
      <td class="px-4 py-3 align-top">${statusBadge(lead.status)}</td>
      <td class="px-4 py-3 align-top text-sm text-slate-600" title="${formatDateET(lead.receivedAt)}">
        ${formatTimeAgo(lead.receivedAt)}
      </td>
      <td class="px-4 py-3 align-top text-right">
        <a
          href="${detailUrl}"
          class="text-brand-700 hover:text-brand-900 text-sm font-medium"
          data-testid="lead-row-open"
          onclick="event.stopPropagation()"
        >Open →</a>
      </td>
    </tr>`;
}
