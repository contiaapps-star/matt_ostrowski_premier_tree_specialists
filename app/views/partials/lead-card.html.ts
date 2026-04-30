import { html, raw } from 'hono/html';
import type { Lead, LeadSource } from '../../db/schema.js';
import {
  formatPhone,
  formatScopeCategory,
  formatTimeAgo,
  isHandled,
  truncate,
} from '../../lib/format.js';
import { sourceSquare } from './source-square.html.js';

function statusPill(lead: Lead) {
  if (isHandled(lead.status)) {
    return html`<span
        class="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800"
        data-testid="card-status-pill"
        data-state="handled"
      ><span class="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden="true"></span>Auto-Sent</span>`;
  }
  return html`<span
      class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
      data-testid="card-status-pill"
      data-state="needs-review"
    ><span class="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true"></span>Needs Review</span>`;
}

function urgentBadge() {
  return html`<span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-800" data-testid="urgent-badge">
      <svg class="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1l9 16H1L10 1zm0 6v4m0 2v.5" stroke="currentColor" stroke-width="1" fill="currentColor"/></svg>
      Urgent
    </span>`;
}

function outOfAreaBadge() {
  return html`<span class="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-700" title="Outside service area">Out of area</span>`;
}

function callButton(phoneE164: string | null) {
  if (!phoneE164) return html``;
  const display = formatPhone(phoneE164) || phoneE164;
  return html`<a
      href="tel:${phoneE164}"
      class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
      data-testid="card-call-btn"
      title="Call ${display}"
      onclick="event.stopPropagation();"
    >
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>
      Call
    </a>`;
}

function emailButton(email: string | null) {
  if (!email) {
    return html`<span
        class="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700"
        title="No email captured"
        data-testid="card-no-email"
      >
        <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 18A8 8 0 102 10a8 8 0 008 8zM8.94 7.94a1 1 0 011.41 0L10 8.59l.65-.65a1 1 0 011.41 1.41L11.41 10l.65.65a1 1 0 01-1.41 1.41L10 11.41l-.65.65a1 1 0 01-1.41-1.41L8.59 10l-.65-.65a1 1 0 010-1.41z"/></svg>
        No email
      </span>`;
  }
  return html`<a
      href="mailto:${email}"
      class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-brand-600 hover:text-brand-700"
      data-testid="card-email-btn"
      title="Email ${email}"
      onclick="event.stopPropagation();"
    >
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
      Email
    </a>`;
}

const SOURCE_EXTERNAL_URL: Record<LeadSource, string | null> = {
  google_lsa_email: 'https://ads.google.com/local-services-ads',
  answerforce_email: 'https://app.answerforce.com',
  website_form: null,
};

function sourceActionButton(lead: Lead) {
  const url = SOURCE_EXTERNAL_URL[lead.source as LeadSource] ?? null;
  if (!url) return html``;
  const labels: Record<LeadSource, string> = {
    google_lsa_email: 'Open in LSA',
    answerforce_email: 'Open in AnswerForce',
    website_form: 'Open',
  };
  const label = labels[lead.source as LeadSource] ?? 'Open';
  return html`<a
      href="${url}"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-600 hover:text-brand-700"
      data-testid="card-source-action"
      title="Open the original conversation"
      onclick="event.stopPropagation();"
    >
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11 3a1 1 0 100 2h2.586l-7.293 7.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 100-2H5z"/></svg>
      ${label}
    </a>`;
}

export interface LeadCardProps {
  lead: Lead;
  isActive?: boolean;
  isFirst?: boolean;
}

export function leadCard({ lead, isActive = false, isFirst = false }: LeadCardProps) {
  const customerName = lead.customerName ?? '(unknown)';
  const cityZip = [lead.customerCity, lead.customerZip].filter(Boolean).join(' ');
  const scopeText = truncate(lead.scopeSummary ?? lead.scopeRaw, 160);
  const scopeLabel = formatScopeCategory(lead.scopeCategory);
  const metaLine = [scopeLabel === '—' ? '' : scopeLabel, cityZip].filter(Boolean).join(' · ');
  const detailUrl = `/leads/${encodeURIComponent(lead.id)}`;
  const panelUrl = `/partials/lead-detail/${encodeURIComponent(lead.id)}`;
  const activeRing = isActive ? 'ring-2 ring-brand-600' : 'hover:ring-1 hover:ring-slate-300';
  const tourAttr = isFirst ? raw(' data-tour="first-card"') : raw('');
  return html`<article
      id="lead-card-${lead.id}"
      class="group relative cursor-pointer overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition ${activeRing}"
      data-testid="lead-card"
      data-lead-id="${lead.id}"
      data-source="${lead.source}"
      data-status="${lead.status}"
      hx-get="${panelUrl}"
      hx-target="#detail-panel"
      hx-swap="innerHTML"
      hx-push-url="${detailUrl}"
      ${tourAttr}
    >
      <div class="flex flex-col gap-2 px-4 py-3 pr-16">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-semibold text-slate-900 truncate">${customerName}</span>
              ${lead.escalationTriggered ? urgentBadge() : ''}
              ${lead.outOfServiceArea ? outOfAreaBadge() : ''}
            </div>
            ${metaLine
              ? html`<div class="mt-0.5 text-[12px] text-slate-600 truncate">${metaLine}</div>`
              : ''}
          </div>
          <span class="shrink-0 text-[11px] text-slate-500" title="Received">${formatTimeAgo(lead.receivedAt)}</span>
        </div>
        ${scopeText
          ? html`<p class="text-sm text-slate-700 leading-snug line-clamp-2" data-testid="card-scope-summary">${scopeText}</p>`
          : ''}
        <div class="flex flex-wrap items-center gap-1.5">
          ${callButton(lead.customerPhoneE164)}
          ${emailButton(lead.customerEmail)}
          ${sourceActionButton(lead)}
          <span class="ml-auto">${statusPill(lead)}</span>
        </div>
      </div>
      <span
        class="pointer-events-none absolute bottom-3 right-3"
        aria-hidden="false"
      >${sourceSquare({ source: lead.source as LeadSource, size: 'sm' })}</span>
    </article>`;
}

export function leadCardOob(lead: Lead) {
  return html`<article hx-swap-oob="afterbegin:#leads-list-region">${leadCard({ lead })}</article>`;
}
