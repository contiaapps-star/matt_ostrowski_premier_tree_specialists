import { html, raw } from 'hono/html';
import type { Lead, LeadSource } from '../../db/schema.js';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatSource,
  formatTimeAgo,
  truncate,
} from '../../lib/format.js';

const SOURCE_STRIPE: Record<LeadSource, string> = {
  google_lsa_email: 'bg-[#4285F4]',
  website_form: 'bg-brand-600',
  answerforce_email: 'bg-orange-500',
};

const SOURCE_PILL: Record<LeadSource, string> = {
  google_lsa_email: 'bg-blue-50 text-blue-800 border-blue-200',
  website_form: 'bg-brand-50 text-brand-800 border-brand-200',
  answerforce_email: 'bg-orange-50 text-orange-800 border-orange-200',
};

function statusPill(status: string) {
  const palettes: Record<string, { palette: string; label: string }> = {
    auto_sent: { palette: 'bg-accent-100 text-accent-800 border-accent-200', label: 'Auto-Sent' },
    manually_sent: { palette: 'bg-accent-50 text-accent-700 border-accent-200', label: 'Sent' },
    awaiting_review: { palette: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Needs Review' },
    manually_flagged: { palette: 'bg-rose-100 text-rose-800 border-rose-200', label: 'Flagged' },
    failed: { palette: 'bg-red-200 text-red-900 border-red-300', label: 'Failed' },
    extracted: { palette: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Ready' },
    extracting: { palette: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Processing' },
    responding: { palette: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Generating' },
    ingested: { palette: 'bg-slate-100 text-slate-700 border-slate-200', label: 'Ingested' },
  };
  const { palette, label } = palettes[status] ?? palettes.ingested!;
  return html`<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${palette}" data-testid="card-status-pill">${label}</span>`;
}

function confidenceRing(score: number | null | undefined) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return html`<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-400" title="Not yet scored">n/a</div>`;
  }
  const pct = Math.round(score * 100);
  const ringColor =
    score >= 0.8 ? 'border-accent-500 text-accent-700 bg-accent-50' : score >= 0.5 ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-rose-400 text-rose-700 bg-rose-50';
  return html`<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${ringColor} text-[11px] font-bold" title="Confidence ${pct}%">${pct}</div>`;
}

function emailIcon(email: string | null) {
  if (!email) {
    return html`<span class="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700" title="No email captured">
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 18A8 8 0 102 10a8 8 0 008 8zM8.94 7.94a1 1 0 011.41 0L10 8.59l.65-.65a1 1 0 011.41 1.41L11.41 10l.65.65a1 1 0 01-1.41 1.41L10 11.41l-.65.65a1 1 0 01-1.41-1.41L8.59 10l-.65-.65a1 1 0 010-1.41z"/></svg>
      No email
    </span>`;
  }
  return html`<span class="inline-flex items-center gap-1 text-[11px] font-medium text-accent-700" title="Email: ${email}">
      <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/><path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/></svg>
      ${truncate(email, 22)}
    </span>`;
}

function urgentBadge() {
  return html`<span class="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-800" data-testid="urgent-badge">
      <svg class="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 1l9 16H1L10 1zm0 6v4m0 2v.5" stroke="currentColor" stroke-width="1" fill="currentColor"/></svg>
      Urgent
    </span>`;
}

function outOfAreaBadge() {
  return html`<span class="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-700" title="Outside service area">Out of area</span>`;
}

export interface LeadCardProps {
  lead: Lead;
  isActive?: boolean;
  isFirst?: boolean;
}

export function leadCard({ lead, isActive = false, isFirst = false }: LeadCardProps) {
  const customerName = lead.customerName ?? '(unknown)';
  const phone = formatPhone(lead.customerPhoneE164);
  const cityZip = [lead.customerCity, lead.customerZip].filter(Boolean).join(' · ');
  const scopeText = truncate(lead.scopeSummary ?? lead.scopeRaw, 110);
  const stripeClass = SOURCE_STRIPE[lead.source as LeadSource] ?? 'bg-slate-300';
  const sourcePillClass = SOURCE_PILL[lead.source as LeadSource] ?? 'bg-slate-50 text-slate-700 border-slate-200';
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
      <span aria-hidden="true" class="absolute left-0 top-0 h-full w-1.5 ${stripeClass}"></span>
      <div class="flex flex-col gap-2 pl-5 pr-4 py-3">
        <div class="flex items-start gap-3">
          ${confidenceRing(lead.confidenceScore)}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              <span class="font-semibold text-slate-900 truncate">${customerName}</span>
              ${lead.escalationTriggered ? urgentBadge() : ''}
              ${lead.outOfServiceArea ? outOfAreaBadge() : ''}
            </div>
            <div class="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span title="${formatDateET(lead.receivedAt)}">${formatTimeAgo(lead.receivedAt)}</span>
              <span aria-hidden="true">·</span>
              ${statusPill(lead.status)}
            </div>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${sourcePillClass}">${formatSource(lead.source)}</span>
          <span class="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-medium text-slate-700">${formatScopeCategory(lead.scopeCategory)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
          ${phone ? html`<span class="inline-flex items-center gap-1"><svg class="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/></svg>${phone}</span>` : ''}
          ${emailIcon(lead.customerEmail)}
          ${cityZip ? html`<span class="inline-flex items-center gap-1"><svg class="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a6 6 0 016 6c0 4.5-6 10-6 10S4 12.5 4 8a6 6 0 016-6zm0 8a2 2 0 100-4 2 2 0 000 4z"/></svg>${cityZip}</span>` : ''}
        </div>
        ${scopeText ? html`<p class="text-xs text-slate-600 leading-snug line-clamp-2">${scopeText}</p>` : ''}
      </div>
    </article>`;
}

export function leadCardOob(lead: Lead) {
  return html`<article hx-swap-oob="afterbegin:#leads-list-region">${leadCard({ lead })}</article>`;
}
