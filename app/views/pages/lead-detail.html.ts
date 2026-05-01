import { html, raw } from 'hono/html';
import type { AuditLogRow, Lead, LeadSource, LeadSourceEvent, OutboundMessage } from '../../db/schema.js';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatTimeAgo,
  isHandled,
  truncate,
} from '../../lib/format.js';
import { auditTimeline } from '../partials/audit-event.html.js';
import { sourceEventList } from '../partials/source-event.html.js';
import { sourceSquare } from '../partials/source-square.html.js';

export interface LeadDetailPageData {
  lead: Lead;
  auditEvents: AuditLogRow[];
  sourceEvents: LeadSourceEvent[];
  outboundMessages?: OutboundMessage[];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusMeta(lead: Lead): string {
  if (lead.status === 'auto_sent' && lead.responseSentAt) {
    return `Auto-sent · sent ${formatTimeAgo(lead.responseSentAt)}`;
  }
  if (lead.status === 'manually_sent' && lead.responseSentAt) {
    return `Manually sent · sent ${formatTimeAgo(lead.responseSentAt)}`;
  }
  if (lead.status === 'awaiting_review') {
    return `Needs review · received ${formatTimeAgo(lead.receivedAt)}`;
  }
  if (lead.status === 'manually_flagged') {
    return `Flagged · received ${formatTimeAgo(lead.receivedAt)}`;
  }
  if (lead.status === 'failed') {
    return `Pipeline failed · received ${formatTimeAgo(lead.receivedAt)}`;
  }
  return `Processing · received ${formatTimeAgo(lead.receivedAt)}`;
}

// ─── Lead summary (compact header + status meta) ──────────────────────────

export function leadSummaryRegion(lead: Lead) {
  return html`<div id="lead-summary-region">${leadSummaryCard(lead)}</div>`;
}

export function leadSummaryCard(lead: Lead) {
  const scopeCategory = formatScopeCategory(lead.scopeCategory);
  const cityZip = [lead.customerCity, lead.customerZip].filter(Boolean).join(' · ') || '—';
  return html`<div class="rounded-lg border border-slate-200 bg-white px-4 py-3" data-testid="lead-summary-card">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="text-sm font-semibold text-slate-800" data-testid="lead-status-meta">${statusMeta(lead)}</span>
      <span class="text-xs text-slate-500" data-testid="county-display">
        County: ${lead.serviceAreaCounty ?? '—'}
      </span>
    </div>
    <p class="mt-1 text-xs text-slate-500">
      ${scopeCategory === '—' ? 'Service' : scopeCategory} · ${cityZip}
    </p>
    ${lead.escalationTriggered
      ? html`<p class="mt-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800" data-testid="escalation-banner">
          ⚠ Escalation: ${lead.escalationReason ?? 'manual flag'}
        </p>`
      : ''}
    ${lead.outOfServiceArea
      ? html`<p class="mt-2 inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs text-slate-700" data-testid="out-of-area-badge">
          Out of service area
        </p>`
      : ''}
  </div>`;
}

// ─── What they asked ─────────────────────────────────────────────────────

function whatTheyAskedSection(lead: Lead) {
  const text = lead.scopeSummary || lead.scopeRaw;
  if (!text) return html``;
  return html`<section class="space-y-2" data-testid="what-they-asked">
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">What they asked</h3>
    <blockquote class="border-l-2 border-brand-300 bg-brand-50/40 px-3 py-2 text-sm italic text-slate-800">
      “${escapeHtml(truncate(text, 600))}”
    </blockquote>
  </section>`;
}

// ─── Contact (read-only or editable) ─────────────────────────────────────

function readOnlyContactSection(lead: Lead) {
  const phone = formatPhone(lead.customerPhoneE164);
  const email = lead.customerEmail;
  const address = [lead.customerAddress, lead.customerCity, lead.customerZip].filter(Boolean).join(', ');
  const serviceArea = lead.outOfServiceArea
    ? html`<span class="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700">⚠ Out of service area</span>`
    : html`<span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-800">✓ In service area${lead.serviceAreaCounty ? ` · ${lead.serviceAreaCounty}` : ''}</span>`;
  return html`<section class="space-y-2" data-testid="contact-readonly">
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact</h3>
    <div class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 space-y-1.5">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        ${phone
          ? html`<a href="tel:${lead.customerPhoneE164}" class="inline-flex items-center gap-1 text-slate-800 hover:text-brand-700" data-testid="contact-phone">
              <svg class="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
              ${phone}
            </a>`
          : html`<span class="text-rose-700">📞 No phone</span>`}
        ${email
          ? html`<a href="mailto:${email}" class="inline-flex items-center gap-1 text-slate-800 hover:text-brand-700" data-testid="contact-email">
              <svg class="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
              ${email}
            </a>`
          : html`<span class="text-rose-700">✉ No email</span>`}
      </div>
      ${address
        ? html`<div class="flex items-center gap-1 text-slate-700">
            <svg class="h-3.5 w-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a6 6 0 016 6c0 4.5-6 10-6 10S4 12.5 4 8a6 6 0 016-6zm0 8a2 2 0 100-4 2 2 0 000 4z"/></svg>
            ${address}
          </div>`
        : ''}
      <div>${serviceArea}</div>
    </div>
  </section>`;
}

function missingFieldsBanner(lead: Lead) {
  const hasPhone = !!lead.customerPhoneE164;
  const hasEmail = !!lead.customerEmail;
  if (!hasPhone && !hasEmail) {
    return html`<div class="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="missing-contact-banner">
      ⚠ Cannot send: missing both phone and email. Add at least one to enable approve &amp; send.
    </div>`;
  }
  if (!hasEmail) {
    return html`<div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="missing-email-banner">
      ℹ No email captured — outbound will go via SMS only.
    </div>`;
  }
  if (!hasPhone) {
    return html`<div class="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700" data-testid="missing-phone-banner">
      ℹ No phone captured — outbound will go via email only.
    </div>`;
  }
  return html``;
}

export function extractedDataCard(lead: Lead) {
  const inputCls = 'pts-autosave-input rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none';
  // Each <input> auto-saves on blur via hx-patch with hx-include="this" — the
  // input only sends its own field. The route handler is partial-update
  // tolerant so unrelated fields keep their values. The "Saved ✓" pulse is
  // driven by a CSS animation on the swapped-in element (see public/styles.css).
  const patchUrl = `/leads/${lead.id}/extracted-data`;
  const phoneDisplay = formatPhone(lead.customerPhoneE164) || lead.customerPhoneE164 || '';
  return html`<div class="space-y-2" data-testid="extracted-data-card">
    <div class="flex items-center justify-between">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Contact <span class="text-slate-400 font-normal normal-case">(edits save automatically)</span></h3>
    </div>
    ${missingFieldsBanner(lead)}
    <div class="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="extracted-data-form">
      <label class="flex flex-col gap-0.5">
        <span class="text-[11px] text-slate-500">Name</span>
        <input
          class="${inputCls}"
          name="customer_name"
          value="${lead.customerName ?? ''}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <label class="flex flex-col gap-0.5">
        <span class="text-[11px] text-slate-500">Phone</span>
        <input
          class="${inputCls}"
          name="customer_phone"
          value="${phoneDisplay}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <label class="flex flex-col gap-0.5 sm:col-span-2">
        <span class="text-[11px] text-slate-500">Email</span>
        <input
          class="${inputCls}"
          name="customer_email"
          type="email"
          value="${lead.customerEmail ?? ''}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <label class="flex flex-col gap-0.5 sm:col-span-2">
        <span class="text-[11px] text-slate-500">Address</span>
        <input
          class="${inputCls}"
          name="customer_address"
          value="${lead.customerAddress ?? ''}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <label class="flex flex-col gap-0.5">
        <span class="text-[11px] text-slate-500">City</span>
        <input
          class="${inputCls}"
          name="customer_city"
          value="${lead.customerCity ?? ''}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <label class="flex flex-col gap-0.5">
        <span class="text-[11px] text-slate-500">ZIP</span>
        <input
          class="${inputCls}"
          name="customer_zip"
          value="${lead.customerZip ?? ''}"
          hx-patch="${patchUrl}"
          hx-trigger="blur changed"
          hx-include="this"
          hx-target="#extracted-data-region"
          hx-swap="outerHTML"
        />
      </label>
      <div class="sm:col-span-2 pt-1 text-[11px]">
        ${lead.outOfServiceArea
          ? html`<span class="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-slate-700" data-testid="service-area-out">⚠ Out of service area</span>`
          : html`<span class="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-green-800" data-testid="service-area-in">✓ In service area${lead.serviceAreaCounty ? ` · ${lead.serviceAreaCounty}` : ''}</span>`}
      </div>
    </div>
  </div>`;
}

export function extractedDataRegion(lead: Lead) {
  return html`<div id="extracted-data-region">${extractedDataCard(lead)}</div>`;
}

// ─── Response (read-only "What we sent" or editable draft) ───────────────

function actionButtons(lead: Lead) {
  if (lead.status === 'awaiting_review') {
    return html`<div class="flex flex-wrap gap-2 mt-3" data-testid="response-actions">
      <button
        class="pts-btn-primary"
        data-testid="approve-btn"
        hx-post="/leads/${lead.id}/approve"
        hx-include="#response-text"
        hx-target="#response-region"
        hx-swap="outerHTML"
      >Approve &amp; Send</button>
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
    </div>`;
  }
  return html``;
}

function generatedFootnote() {
  return html`<p class="mt-2 text-[11px] text-slate-500" data-testid="response-source-hint">
    Generated using your system prompt — <a href="/settings" class="text-brand-700 hover:underline">edit in Settings</a>.
  </p>`;
}

function pendingResponseBlock(lead: Lead, headline: string, body: string) {
  return html`<div id="response-region" class="space-y-2" data-testid="response-card" data-status="${lead.status}" data-state="pending">
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Draft response</h3>
    <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center" data-testid="response-pending">
      <p class="text-sm font-medium text-slate-700">${headline}</p>
      <p class="mt-1 text-xs text-slate-500">${body}</p>
    </div>
    ${actionButtons(lead)}
  </div>`;
}

export function responseRegion(lead: Lead) {
  const text = lead.responseText ?? '';

  // 1) Already-sent leads: read-only "what we sent" block.
  if (isHandled(lead.status)) {
    return html`<div id="response-region" class="space-y-2" data-testid="response-card" data-status="${lead.status}">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">What we sent</h3>
      <div class="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 whitespace-pre-line" data-testid="response-readonly">
        ${text ? escapeHtml(text) : raw('<span class="text-slate-500 italic">(no body recorded)</span>')}
      </div>
      ${generatedFootnote()}
    </div>`;
  }

  // 2) Pre-extraction / mid-pipeline leads: render a passive info block. There
  // is nothing to write yet (no scope, no draft) and the actions surface
  // automatically once extraction finishes — showing an empty textarea here
  // misleads the user into thinking they need to fill something in.
  if (lead.status === 'ingested' || lead.status === 'extracting' || lead.status === 'responding') {
    const headline =
      lead.status === 'ingested'
        ? 'Waiting for extraction to start'
        : lead.status === 'extracting'
          ? 'Extracting customer data…'
          : 'Generating draft response…';
    return pendingResponseBlock(
      lead,
      headline,
      'The AI runs every minute. The draft will appear here automatically once it is ready.',
    );
  }

  // 3) Pipeline failed without a draft: passive "failed" block + regenerate.
  if (lead.status === 'failed' && !text) {
    return pendingResponseBlock(
      lead,
      'Pipeline failed before a draft was produced',
      'You can compose manually below, or try regenerating the response from scratch.',
    );
  }

  // 4) Editable cases (awaiting_review, manually_flagged, extracted, or
  // failed-with-text): textarea + action buttons.
  const placeholder = !text
    ? lead.escalationTriggered
      ? 'No draft generated — escalated for human review. Write a response from scratch.'
      : 'No draft yet — write a response or click Generate.'
    : '';
  return html`<div id="response-region" class="space-y-2" data-testid="response-card" data-status="${lead.status}">
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Draft response</h3>
    <textarea
      id="response-text"
      name="response_text"
      class="block w-full min-h-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:ring-1 focus:ring-brand-600 focus:outline-none font-sans"
      placeholder="${placeholder}"
      data-testid="response-textarea"
    >${escapeHtml(text)}</textarea>
    ${!text && lead.escalationTriggered
      ? html`<p class="text-xs text-rose-700" data-testid="escalation-no-draft">
          ⚠ Escalation detected${lead.escalationReason ? ` — ${lead.escalationReason}` : ''}. The LLM did not auto-generate a draft; a human must respond.
        </p>`
      : ''}
    ${generatedFootnote()}
    ${actionButtons(lead)}
  </div>`;
}

// ─── Outbound + ArboStar ─────────────────────────────────────────────────

function outboundIcon(channel: string) {
  if (channel === 'email') return '✉';
  return '📱';
}

function outboundStatusGlyph(status: string) {
  if (status === 'sent') return html`<span class="text-green-700" title="Sent">✓ sent</span>`;
  if (status === 'queued') return html`<span class="text-amber-700" title="Queued">⏳ queued</span>`;
  if (status === 'failed') return html`<span class="text-rose-700" title="Failed">✗ failed</span>`;
  return html`<span class="text-slate-500">${status}</span>`;
}

export function outboundStatusCard(lead: Lead, messages: OutboundMessage[]) {
  const showCard = isHandled(lead.status) || messages.length > 0;
  if (!showCard) {
    return html`<div id="outbound-status-region"></div>`;
  }
  const allFailed = messages.length > 0 && messages.every((m) => m.status === 'failed');
  return html`<div id="outbound-status-region">
    <section class="space-y-2" data-testid="outbound-status-card" data-lead-id="${lead.id}">
      <h3 class="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Outbound</h3>
      ${messages.length === 0
        ? html`<p class="text-xs text-slate-500" data-testid="outbound-empty">No outbound messages dispatched yet.</p>`
        : html`<ul class="space-y-1.5 text-sm" data-testid="outbound-messages">
            ${messages.map(
              (m) => html`<li
                class="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
                data-testid="outbound-message"
                data-channel="${m.channel}"
                data-status="${m.status}"
              >
                <div class="min-w-0">
                  <div class="text-sm text-slate-800 truncate">${outboundIcon(m.channel)} ${m.channel} → ${m.recipient}</div>
                  <div class="text-[11px] text-slate-500">
                    ${m.sentAt ? formatTimeAgo(m.sentAt) : 'queued'}
                    ${m.errorMessage ? html` · <span class="text-rose-700">${m.errorMessage}</span>` : ''}
                  </div>
                </div>
                <div class="text-xs">${outboundStatusGlyph(m.status)}</div>
              </li>`,
            )}
          </ul>`}
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
        ${lead.arbostarRequestId
          ? html`<span class="text-slate-700" data-testid="arbostar-request-id">
              🌲 ArboStar: <code class="bg-slate-100 px-1 rounded">${lead.arbostarRequestId}</code>
            </span>`
          : html`<span class="text-slate-500" data-testid="arbostar-not-synced">🌲 ArboStar: not synced</span>`}
        ${allFailed
          ? html`<button
              class="pts-btn-secondary"
              data-testid="retry-dispatch-btn"
              hx-post="/leads/${lead.id}/dispatch-now"
              hx-target="#outbound-status-region"
              hx-swap="outerHTML"
            >Retry dispatch</button>`
          : ''}
      </div>
    </section>
  </div>`;
}

// ─── Audit trail (collapsed by default) ──────────────────────────────────

export function auditTrailRegion(auditEvents: AuditLogRow[]) {
  return html`<details
      id="audit-trail-region"
      class="rounded-lg border border-slate-200 bg-white px-4 py-3"
      data-testid="audit-trail"
    >
      <summary class="cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        Audit trail
        <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">${auditEvents.length}</span>
      </summary>
      <div class="mt-3">${auditTimeline(auditEvents)}</div>
    </details>`;
}

// ─── Sections combined for a full-page lead view ─────────────────────────

export function leadDetailPage({
  lead,
  auditEvents,
  sourceEvents,
  outboundMessages,
}: LeadDetailPageData) {
  return html`<section class="space-y-4" data-testid="lead-detail-page" data-lead-id="${lead.id}">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
      <div class="flex items-center gap-3 min-w-0">
        ${sourceSquare({ source: lead.source as LeadSource, size: 'md' })}
        <div class="min-w-0">
          <h1 class="text-xl font-semibold text-slate-900 truncate" data-testid="lead-detail-name">
            ${lead.customerName ?? '(unknown name)'}
          </h1>
          <p class="text-xs text-slate-500 truncate" title="${formatDateET(lead.receivedAt)}">${statusMeta(lead)}</p>
        </div>
      </div>
      <div class="flex gap-2">
        <a href="/" class="pts-btn-secondary">← Back to inbox</a>
      </div>
    </div>

    ${leadSummaryRegion(lead)}

    ${whatTheyAskedSection(lead)}

    ${isHandled(lead.status) ? readOnlyContactSection(lead) : extractedDataRegion(lead)}

    ${responseRegion(lead)}

    ${outboundStatusCard(lead, outboundMessages ?? [])}

    ${auditTrailRegion(auditEvents)}

    <details class="rounded-lg border border-slate-200 bg-white px-4 py-3" data-testid="original-payload">
      <summary class="cursor-pointer text-sm font-semibold text-slate-700 flex items-center gap-2">
        <svg viewBox="0 0 24 24" class="h-4 w-4 text-slate-500" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M4 8h16M8 4v16"/></svg>
        Original payload
        <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-5 min-w-5 px-1.5">${sourceEvents.length}</span>
      </summary>
      <div class="mt-3">${sourceEventList(sourceEvents)}</div>
    </details>
  </section>`;
}

export { whatTheyAskedSection, readOnlyContactSection };

export function notFoundPage(leadId: string) {
  return html`<section data-testid="lead-not-found" class="text-center py-12">
    <h1 class="text-xl font-semibold text-slate-900">Lead not found</h1>
    <p class="text-sm text-slate-500 mt-2">No lead exists with ID <code class="text-xs bg-slate-100 px-1 py-0.5 rounded">${leadId}</code>.</p>
    <a href="/" class="pts-btn-secondary mt-4 inline-flex">← Back to inbox</a>
  </section>`;
}
