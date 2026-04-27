import { html, raw } from 'hono/html';
import type { AuditLogRow, Lead, LeadSourceEvent, OutboundMessage } from '../../db/schema.js';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatSource,
  formatTimeAgo,
} from '../../lib/format.js';
import { confidenceBadge } from '../partials/confidence-badge.html.js';
import { statusBadge } from '../partials/status-badge.html.js';
import { auditTimeline } from '../partials/audit-event.html.js';
import { sourceEventList } from '../partials/source-event.html.js';

export interface LeadDetailPageData {
  lead: Lead;
  auditEvents: AuditLogRow[];
  sourceEvents: LeadSourceEvent[];
  outboundMessages?: OutboundMessage[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function leadSummaryRegion(lead: Lead) {
  return html`<div id="lead-summary-region">${leadSummaryCard(lead)}</div>`;
}

export function leadSummaryCard(lead: Lead) {
  return html`<div class="pts-card" data-testid="lead-summary-card">
    <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Lead Summary</h2>
    <dl class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
      <div>
        <dt class="text-xs text-slate-500">Status</dt>
        <dd class="mt-1">${statusBadge(lead.status)}</dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Source</dt>
        <dd class="mt-1 text-slate-800">${formatSource(lead.source)}</dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Scope category</dt>
        <dd class="mt-1 text-slate-800">${formatScopeCategory(lead.scopeCategory)}</dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Location</dt>
        <dd class="mt-1 text-slate-800">${[lead.customerCity, lead.customerZip].filter(Boolean).join(' · ') || '—'}</dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Lead received</dt>
        <dd class="mt-1 text-slate-800" title="${formatDateET(lead.receivedAt)}">
          ${formatTimeAgo(lead.receivedAt)} <span class="text-slate-500">(${formatDateET(lead.receivedAt)})</span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-slate-500">Confidence</dt>
        <dd class="mt-1">${confidenceBadge(lead.confidenceScore, lead.confidenceReasoning)}</dd>
      </div>
    </dl>
    ${lead.escalationTriggered
      ? html`<p class="mt-3 text-xs text-red-700" data-testid="escalation-banner">
          ⚠ Escalation triggered: ${lead.escalationReason ?? 'manual flag'}
        </p>`
      : ''}
    ${lead.outOfServiceArea
      ? html`<p class="mt-2 inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-700" data-testid="out-of-area-badge">
          Out of service area
        </p>`
      : ''}
  </div>`;
}

export function extractedDataCard(lead: Lead) {
  return html`<div class="pts-card" data-testid="extracted-data-card">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Extracted Data</h2>
      <span class="text-xs text-slate-500" data-testid="county-display">
        County: ${lead.serviceAreaCounty ?? '—'}
      </span>
    </div>
    <form
      class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm"
      data-testid="extracted-data-form"
      hx-patch="/leads/${lead.id}/extracted-data"
      hx-target="#extracted-data-region"
      hx-swap="outerHTML"
      hx-encoding="application/x-www-form-urlencoded"
    >
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Name</span>
        <input class="pts-input" name="customer_name" value="${lead.customerName ?? ''}" />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Phone</span>
        <input class="pts-input" name="customer_phone" value="${formatPhone(lead.customerPhoneE164) || lead.customerPhoneE164 || ''}" />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Email</span>
        <input class="pts-input" name="customer_email" type="email" value="${lead.customerEmail ?? ''}" />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">Address</span>
        <input class="pts-input" name="customer_address" value="${lead.customerAddress ?? ''}" />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">City</span>
        <input class="pts-input" name="customer_city" value="${lead.customerCity ?? ''}" />
      </label>
      <label class="flex flex-col">
        <span class="text-xs text-slate-500">ZIP</span>
        <input class="pts-input" name="customer_zip" value="${lead.customerZip ?? ''}" />
      </label>
      <div class="sm:col-span-2 flex items-center gap-2 mt-1">
        <button class="pts-btn-primary" type="submit" data-testid="save-extracted-data">Save extracted data</button>
        ${lead.outOfServiceArea
          ? html`<span class="text-xs text-slate-600" data-testid="service-area-out">Service area: out of area</span>`
          : html`<span class="text-xs text-green-700" data-testid="service-area-in">Service area: in area</span>`}
      </div>
    </form>
  </div>`;
}

function actionButtons(lead: Lead) {
  if (lead.status === 'awaiting_review') {
    return html`<div class="flex flex-wrap gap-2 mt-3" data-testid="response-actions">
      <button
        class="pts-btn-primary"
        data-testid="approve-btn"
        hx-post="/leads/${lead.id}/approve"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Approve & Send</button>
      <button
        class="pts-btn-secondary"
        data-testid="edit-send-btn"
        hx-post="/leads/${lead.id}/edit-and-send"
        hx-include="#response-text"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Edit & Send</button>
      <button
        class="pts-btn-danger"
        data-testid="reject-btn"
        hx-post="/leads/${lead.id}/reject"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Reject</button>
      <button
        class="pts-btn-secondary"
        data-testid="regenerate-btn"
        hx-post="/leads/${lead.id}/regenerate-response"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Regenerate</button>
    </div>`;
  }
  if (lead.status === 'auto_sent' || lead.status === 'manually_sent') {
    return html`<div class="mt-3 text-sm text-slate-600" data-testid="response-actions-readonly">
      Sent ${lead.responseSentAt ? formatTimeAgo(lead.responseSentAt) : ''} ${lead.responseSentBy ? `by ${lead.responseSentBy}` : ''}.
    </div>`;
  }
  if (lead.status === 'manually_flagged') {
    return html`<div class="flex flex-wrap gap-2 mt-3" data-testid="response-actions">
      <button
        class="pts-btn-primary"
        data-testid="manual-send-btn"
        hx-post="/leads/${lead.id}/edit-and-send"
        hx-include="#response-text"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Save &amp; send manually</button>
      <button
        class="pts-btn-secondary"
        data-testid="regenerate-btn"
        hx-post="/leads/${lead.id}/regenerate-response"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Try regenerate again</button>
    </div>`;
  }
  if (lead.status === 'extracted') {
    return html`<div class="flex flex-wrap gap-2 mt-3 items-center" data-testid="response-actions">
      <button
        class="pts-btn-primary"
        data-testid="regenerate-btn"
        hx-post="/leads/${lead.id}/regenerate-response"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Generate response now</button>
      <button
        class="pts-btn-secondary"
        data-testid="manual-send-btn"
        hx-post="/leads/${lead.id}/edit-and-send"
        hx-include="#response-text"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Save &amp; send manually</button>
      <span class="text-xs text-slate-500">Or write your own and click Save.</span>
    </div>`;
  }
  return html`<p class="mt-3 text-xs text-slate-500" data-testid="response-actions-pending">
    Response actions become available once the lead reaches review.
  </p>`;
}

export function responseRegion(lead: Lead) {
  const text = lead.responseText ?? '';
  const editable =
    lead.status === 'awaiting_review' ||
    lead.status === 'manually_flagged' ||
    lead.status === 'extracted';
  const placeholder = !text
    ? lead.escalationTriggered
      ? 'No draft generated — escalated for human review. Write a response from scratch.'
      : 'No draft yet — write a response or click Generate.'
    : '';
  return html`<div id="response-region" class="pts-card" data-testid="response-card" data-status="${lead.status}">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Generated Response</h2>
      ${statusBadge(lead.status)}
    </div>
    <textarea
      id="response-text"
      name="response_text"
      class="pts-input mt-3 h-40 font-mono text-xs"
      placeholder="${placeholder}"
      ${editable ? '' : raw('readonly')}
      data-testid="response-textarea"
    >${escapeHtml(text)}</textarea>
    ${!text && lead.escalationTriggered
      ? html`<p class="mt-2 text-xs text-red-700" data-testid="escalation-no-draft">
          ⚠ Escalation detected${lead.escalationReason ? ` — ${lead.escalationReason}` : ''}. The LLM did not auto-generate a draft; a human must respond.
        </p>`
      : ''}
    ${actionButtons(lead)}
  </div>`;
}

export function extractedDataRegion(lead: Lead) {
  return html`<div id="extracted-data-region">${extractedDataCard(lead)}</div>`;
}

function outboundStatusBadge(status: string) {
  const cls =
    status === 'sent'
      ? 'bg-green-100 text-green-800'
      : status === 'queued'
        ? 'bg-amber-100 text-amber-800'
        : status === 'failed'
          ? 'bg-red-100 text-red-800'
          : 'bg-slate-200 text-slate-700';
  return html`<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs ${cls}" data-testid="outbound-status-${status}">${status}</span>`;
}

export function outboundStatusCard(lead: Lead, messages: OutboundMessage[]) {
  const showCard = lead.status === 'auto_sent' || lead.status === 'manually_sent' || messages.length > 0;
  if (!showCard) {
    return html`<div id="outbound-status-region"></div>`;
  }
  const allFailed = messages.length > 0 && messages.every((m) => m.status === 'failed');
  return html`<div id="outbound-status-region">
    <div class="pts-card mt-4" data-testid="outbound-status-card" data-lead-id="${lead.id}">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500">Outbound Status</h2>
        ${lead.arbostarRequestId
          ? html`<span class="text-xs text-slate-600" data-testid="arbostar-request-id">
              ArboStar: <code class="bg-slate-100 px-1 rounded">${lead.arbostarRequestId}</code>
            </span>`
          : html`<span class="text-xs text-slate-500" data-testid="arbostar-not-synced">ArboStar: not synced</span>`}
      </div>
      ${messages.length === 0
        ? html`<p class="mt-3 text-sm text-slate-500" data-testid="outbound-empty">
            No outbound messages dispatched yet.
          </p>`
        : html`<ul class="mt-3 space-y-2 text-sm" data-testid="outbound-messages">
            ${messages.map(
              (m) => html`<li
                class="flex items-start justify-between gap-3 border-l-2 border-slate-200 pl-3"
                data-testid="outbound-message"
                data-channel="${m.channel}"
                data-status="${m.status}"
              >
                <div>
                  <div class="font-medium text-slate-800">${m.channel} → ${m.recipient}</div>
                  <div class="text-xs text-slate-500">
                    ${m.sentAt ? `sent ${formatTimeAgo(m.sentAt)}` : 'queued'}
                    ${m.providerMessageId
                      ? html` · <code class="text-xs text-slate-500">${m.providerMessageId}</code>`
                      : ''}
                  </div>
                  ${m.errorMessage
                    ? html`<div class="text-xs text-red-700">${m.errorMessage}</div>`
                    : ''}
                </div>
                <div>${outboundStatusBadge(m.status)}</div>
              </li>`,
            )}
          </ul>`}
      ${allFailed
        ? html`<div class="mt-3">
            <button
              class="pts-btn-secondary"
              data-testid="retry-dispatch-btn"
              hx-post="/leads/${lead.id}/dispatch-now"
              hx-target="#outbound-status-region"
              hx-swap="outerHTML"
            >Retry dispatch</button>
          </div>`
        : ''}
    </div>
  </div>`;
}

export function leadDetailPage({
  lead,
  auditEvents,
  sourceEvents,
  outboundMessages,
}: LeadDetailPageData) {
  return html`<section data-testid="lead-detail-page" data-lead-id="${lead.id}">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
      <div>
        <h1 class="text-xl font-semibold text-slate-900" data-testid="lead-detail-name">
          ${lead.customerName ?? '(unknown name)'}
        </h1>
        <p class="text-sm text-slate-500">
          ${formatPhone(lead.customerPhoneE164) || lead.customerPhoneE164 || 'No phone'} ·
          ${formatSource(lead.source)} ·
          received ${formatTimeAgo(lead.receivedAt)}
        </p>
      </div>
      <div class="flex gap-2">
        <a href="/dashboard" class="pts-btn-secondary">← Back to inbox</a>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${leadSummaryRegion(lead)}
      ${extractedDataRegion(lead)}
    </div>

    <div class="mt-4">
      ${responseRegion(lead)}
    </div>

    ${outboundStatusCard(lead, outboundMessages ?? [])}

    <details class="mt-4 pts-card" data-testid="audit-trail" open>
      <summary class="cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        Audit trail
        <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">${auditEvents.length}</span>
      </summary>
      <div class="mt-3">${auditTimeline(auditEvents)}</div>
    </details>

    <details class="mt-4 pts-card" data-testid="original-payload">
      <summary class="cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M4 8h16M8 4v16"/></svg>
        Original payload
        <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">${sourceEvents.length}</span>
      </summary>
      <div class="mt-3">${sourceEventList(sourceEvents)}</div>
    </details>
  </section>`;
}

export function notFoundPage(leadId: string) {
  return html`<section data-testid="lead-not-found" class="text-center py-12">
    <h1 class="text-xl font-semibold text-slate-900">Lead not found</h1>
    <p class="text-sm text-slate-500 mt-2">No lead exists with ID <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">${leadId}</code>.</p>
    <a href="/dashboard" class="pts-btn-secondary mt-4 inline-flex">← Back to inbox</a>
  </section>`;
}
