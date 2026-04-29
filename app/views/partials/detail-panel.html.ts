import { html } from 'hono/html';
import type { AuditLogRow, Lead, LeadSourceEvent, OutboundMessage } from '../../db/schema.js';
import { formatPhone, formatSource, formatTimeAgo } from '../../lib/format.js';
import { sourceEventList } from './source-event.html.js';
import {
  auditTrailRegion,
  extractedDataRegion,
  leadSummaryRegion,
  outboundStatusCard,
  responseRegion,
} from '../pages/lead-detail.html.js';

export interface DetailPanelProps {
  lead: Lead;
  auditEvents: AuditLogRow[];
  sourceEvents: LeadSourceEvent[];
  outboundMessages: OutboundMessage[];
}

const SOURCE_PILL: Record<string, string> = {
  google_lsa_email: 'bg-blue-50 text-blue-800 border-blue-200',
  website_form: 'bg-brand-50 text-brand-800 border-brand-200',
  answerforce_email: 'bg-orange-50 text-orange-800 border-orange-200',
};

export function detailPanel({ lead, auditEvents, sourceEvents, outboundMessages }: DetailPanelProps) {
  const phone = formatPhone(lead.customerPhoneE164) || lead.customerPhoneE164 || 'No phone';
  const sourceClass = SOURCE_PILL[lead.source] ?? 'bg-slate-50 text-slate-700 border-slate-200';
  return html`<section
      class="flex h-full flex-col"
      data-testid="lead-detail-page"
      data-lead-id="${lead.id}"
      data-tour="detail-panel"
    >
      <header class="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div class="min-w-0">
          <h2 class="truncate text-lg font-semibold text-slate-900" data-testid="panel-customer-name">${lead.customerName ?? '(unknown name)'}</h2>
          <p class="mt-0.5 truncate text-xs text-slate-500">
            ${phone}
            <span aria-hidden="true">·</span>
            <span class="inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sourceClass}">${formatSource(lead.source)}</span>
            <span aria-hidden="true">·</span>
            received ${formatTimeAgo(lead.receivedAt)}
          </p>
        </div>
        <a
          href="/"
          class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close detail"
          data-testid="close-panel-btn"
          hx-get="/partials/detail-panel-empty"
          hx-target="#detail-panel"
          hx-swap="innerHTML"
          hx-push-url="/"
        >
          <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"/></svg>
        </a>
      </header>
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          ${leadSummaryRegion(lead)}
          ${extractedDataRegion(lead)}
        </div>
        <div data-tour="response-actions">
          ${responseRegion(lead)}
        </div>
        ${outboundStatusCard(lead, outboundMessages)}
        ${auditTrailRegion(auditEvents)}
        <details class="pts-card" data-testid="original-payload">
          <summary class="cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
            <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M4 8h16M8 4v16"/></svg>
            Original payload
            <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">${sourceEvents.length}</span>
          </summary>
          <div class="mt-3">${sourceEventList(sourceEvents)}</div>
        </details>
      </div>
    </section>`;
}

export function detailPanelEmpty() {
  return html`<div class="flex h-full flex-col items-center justify-center gap-2 px-8 py-16 text-center text-slate-400" data-testid="detail-panel-empty">
      <svg class="h-12 w-12" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M32 8 L42 22 L36 22 L44 34 L36 34 L46 48 L34 48 L34 56 L30 56 L30 48 L18 48 L28 34 L20 34 L28 22 L22 22 Z"/>
      </svg>
      <p class="text-sm font-medium text-slate-500">Pick a lead to see details</p>
      <p class="text-xs text-slate-400 max-w-xs">Click any card on the left. Auto-sent leads stay read-only; flagged or pending leads will show actions to approve, edit, or regenerate.</p>
    </div>`;
}
