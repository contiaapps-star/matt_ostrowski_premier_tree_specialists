import { html, raw } from 'hono/html';
import type { AuditLogRow, Lead, LeadSourceEvent } from '../../db/schema.js';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatSource,
  formatTimeAgo,
} from '../../lib/format.js';
import { confidenceBadge } from '../partials/confidence-badge.html.js';
import { statusBadge } from '../partials/status-badge.html.js';

export interface LeadDetailPageData {
  lead: Lead;
  auditEvents: AuditLogRow[];
  sourceEvents: LeadSourceEvent[];
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

export function leadDetailPage({ lead, auditEvents, sourceEvents }: LeadDetailPageData) {
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

    <details class="mt-4 pts-card" data-testid="audit-trail">
      <summary class="cursor-pointer text-sm font-semibold text-slate-700">Audit trail (${auditEvents.length})</summary>
      <ol class="mt-3 space-y-2 text-sm">
        ${auditEvents.length === 0
          ? html`<li class="text-slate-500">No audit events yet.</li>`
          : auditEvents.map(
              (e) => html`<li class="border-l-2 border-slate-200 pl-3" data-testid="audit-event">
                <div class="flex items-center justify-between">
                  <span class="font-medium text-slate-800">${e.action}</span>
                  <span class="text-xs text-slate-500">${formatDateET(e.createdAt)}</span>
                </div>
                <div class="text-xs text-slate-500">actor: ${e.actor}</div>
                ${e.details
                  ? html`<pre class="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">${escapeHtml(e.details)}</pre>`
                  : ''}
              </li>`,
            )}
      </ol>
    </details>

    <details class="mt-4 pts-card" data-testid="original-payload">
      <summary class="cursor-pointer text-sm font-semibold text-slate-700">Original payload (${sourceEvents.length})</summary>
      <div class="mt-3 space-y-3">
        ${sourceEvents.length === 0
          ? html`<p class="text-sm text-slate-500">No source events recorded.</p>`
          : sourceEvents.map(
              (s) => html`<div data-testid="source-event">
                <div class="text-xs text-slate-500">${s.source} · ${formatDateET(s.receivedAt)}</div>
                <pre class="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-700">${escapeHtml(s.rawPayload)}</pre>
              </div>`,
            )}
      </div>
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
