import { html, raw } from 'hono/html';
import type { Lead, LeadStatus } from '../../db/schema.js';
import { emptyState } from '../partials/empty-state.html.js';
import { leadRow } from '../partials/lead-row.html.js';

export interface DashboardFilters {
  source: string | null;
  status: string | null;
  from: string | null;
  to: string | null;
}

export interface DashboardPageData {
  leads: Lead[];
  filters: DashboardFilters;
  total: number;
  page: number;
  pageSize: number;
}

const SOURCE_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'All sources' },
  { value: 'google_lsa_email', label: 'Google LSA' },
  { value: 'website_form', label: 'Website Form' },
  { value: 'answerforce_email', label: 'AnswerForce' },
];

const STATUS_OPTIONS: Array<{ value: LeadStatus | null; label: string }> = [
  { value: null, label: 'All statuses' },
  { value: 'auto_sent', label: 'Auto-sent' },
  { value: 'awaiting_review', label: 'Awaiting Review' },
  { value: 'manually_flagged', label: 'Manual Flag' },
  { value: 'manually_sent', label: 'Manually Sent' },
  { value: 'failed', label: 'Failed' },
];

function buildQs(filters: DashboardFilters, override: Partial<DashboardFilters>): string {
  const merged: DashboardFilters = { ...filters, ...override };
  const parts: string[] = [];
  if (merged.source) parts.push(`source=${encodeURIComponent(merged.source)}`);
  if (merged.status) parts.push(`status=${encodeURIComponent(merged.status)}`);
  if (merged.from) parts.push(`from=${encodeURIComponent(merged.from)}`);
  if (merged.to) parts.push(`to=${encodeURIComponent(merged.to)}`);
  return parts.length === 0 ? '' : `?${parts.join('&')}`;
}

function chip(label: string, isActive: boolean, qs: string, target: 'source' | 'status') {
  const base =
    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition';
  const palette = isActive
    ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-sm'
    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100';
  // Plain anchor — full page navigation re-renders chips so the active one updates.
  // (Avoids the htmx partial-swap pitfall where only the table refreshes and
  // the previously-active chip keeps its highlight.)
  return html`<a
      href="/dashboard${qs}"
      class="${base} ${palette}"
      data-testid="filter-chip-${target}"
      data-active="${isActive ? '1' : '0'}"
    >${label}</a>`;
}

export function leadsTablePartial(leads: Lead[]) {
  if (leads.length === 0) {
    return html`<div id="leads-table-container" data-testid="leads-table-container">
      ${emptyState({
        title: 'No leads in this view yet.',
        description: 'When new leads come in across LSA, the website form, or AnswerForce, they will appear here.',
        testId: 'empty-state-dashboard',
      })}
    </div>`;
  }

  return html`<div id="leads-table-container" data-testid="leads-table-container">
    <div class="hidden md:block overflow-x-auto">
      <table class="min-w-full divide-y divide-slate-200" data-testid="leads-table">
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
        <tbody class="divide-y divide-slate-100" data-testid="leads-table-body">
          ${leads.map((l) => leadRow(l))}
        </tbody>
      </table>
    </div>
    <div class="md:hidden flex flex-col gap-2" data-testid="leads-cards">
      ${leads.map(
        (l) => html`<a
          href="/leads/${l.id}"
          class="block pts-card hover:bg-slate-50"
          data-testid="lead-card"
          data-lead-id="${l.id}"
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-slate-900">${l.customerName ?? '(unknown)'}</span>
            <span class="text-xs text-slate-500">${l.source}</span>
          </div>
          <p class="mt-1 text-sm text-slate-600">${l.scopeSummary ?? l.scopeRaw}</p>
        </a>`,
      )}
    </div>
  </div>`;
}

export function dashboardPage(data: DashboardPageData) {
  const { filters, leads, total, page, pageSize } = data;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const headerSummary = total === 0 ? '0 leads' : `${total} lead${total === 1 ? '' : 's'}`;

  return html`<section data-testid="dashboard-page">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Lead Inbox</h1>
        <p class="text-sm text-slate-500" data-testid="dashboard-summary">${headerSummary}</p>
      </div>
      <div class="text-sm text-slate-500">
        Showing page ${page} of ${totalPages}
      </div>
    </div>

    <div class="pts-card mb-4">
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">Source</span>
        ${SOURCE_OPTIONS.map((opt) =>
          chip(
            opt.label,
            filters.source === opt.value || (opt.value === null && !filters.source),
            buildQs(filters, { source: opt.value }),
            'source',
          ),
        )}
      </div>
      <div class="flex flex-wrap gap-2 items-center mt-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-slate-500 mr-1">Status</span>
        ${STATUS_OPTIONS.map((opt) =>
          chip(
            opt.label,
            filters.status === opt.value || (opt.value === null && !filters.status),
            buildQs(filters, { status: opt.value }),
            'status',
          ),
        )}
      </div>
      <form
        class="flex flex-wrap items-end gap-2 mt-2"
        hx-get="/dashboard/leads-table"
        hx-target="#leads-table-container"
        hx-include="closest form"
        hx-push-url="true"
        data-testid="dashboard-date-form"
      >
        ${filters.source ? raw(`<input type="hidden" name="source" value="${escapeHtml(filters.source)}" />`) : ''}
        ${filters.status ? raw(`<input type="hidden" name="status" value="${escapeHtml(filters.status)}" />`) : ''}
        <label class="flex flex-col text-xs text-slate-600">
          From
          <input type="date" name="from" value="${filters.from ?? ''}" class="pts-input" />
        </label>
        <label class="flex flex-col text-xs text-slate-600">
          To
          <input type="date" name="to" value="${filters.to ?? ''}" class="pts-input" />
        </label>
        <button class="pts-btn-secondary" type="submit">Apply</button>
        <a href="/dashboard" class="pts-btn-secondary">Reset</a>
      </form>
    </div>

    ${leadsTablePartial(leads)}

    <nav class="flex items-center justify-between mt-4 text-sm text-slate-600" data-testid="pagination">
      <div>${total === 0 ? 'No leads' : `Showing ${leads.length} of ${total}`}</div>
      <div class="flex gap-2">
        ${page > 1
          ? html`<a class="pts-btn-secondary" href="/dashboard${appendPage(buildQs(filters, {}), page - 1)}">← Prev</a>`
          : html`<span class="pts-btn-secondary opacity-50 pointer-events-none">← Prev</span>`}
        ${page < totalPages
          ? html`<a class="pts-btn-secondary" href="/dashboard${appendPage(buildQs(filters, {}), page + 1)}">Next →</a>`
          : html`<span class="pts-btn-secondary opacity-50 pointer-events-none">Next →</span>`}
      </div>
    </nav>
  </section>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function appendPage(qs: string, page: number): string {
  if (qs.length === 0) return `?page=${page}`;
  return `${qs}&page=${page}`;
}
