import { html, raw } from 'hono/html';
import type { Lead, LeadSource, LeadStatus } from '../../db/schema.js';
import type { TimeRangeKey } from '../../lib/time-range.js';
import { TIME_RANGES, TIME_RANGE_KEYS } from '../../lib/time-range.js';
import type { StatsSnapshot } from '../../services/stats.service.js';
import { kpiStrip } from '../partials/kpi-strip.html.js';
import { leadCard } from '../partials/lead-card.html.js';
import { detailPanel, detailPanelEmpty } from '../partials/detail-panel.html.js';
import type { AuditLogRow, LeadSourceEvent, OutboundMessage } from '../../db/schema.js';

export const TRIAGE_KEYS = ['all', 'auto', 'needs_review', 'flagged'] as const;
export type TriageKey = (typeof TRIAGE_KEYS)[number];

const TRIAGE_LABELS: Record<TriageKey, string> = {
  all: 'All',
  auto: 'Auto-triaged',
  needs_review: 'Needs Manual',
  flagged: 'Flagged',
};

export interface WorkspaceFilters {
  range: TimeRangeKey;
  source: LeadSource | null;
  triage: TriageKey;
}

export interface WorkspaceProps {
  filters: WorkspaceFilters;
  leads: Lead[];
  total: number;
  triageCounts: Record<TriageKey, number>;
  snapshot: StatsSnapshot;
  activeLead: {
    lead: Lead;
    auditEvents: AuditLogRow[];
    sourceEvents: LeadSourceEvent[];
    outboundMessages: OutboundMessage[];
  } | null;
}

function buildFilterQs(f: WorkspaceFilters, overrides: Partial<WorkspaceFilters> = {}): string {
  const merged: WorkspaceFilters = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.range !== '24h') params.set('range', merged.range);
  if (merged.source) params.set('source', merged.source);
  if (merged.triage !== 'all') params.set('triage', merged.triage);
  const s = params.toString();
  return s ? `?${s}` : '';
}

function timeRangeChips(filters: WorkspaceFilters) {
  return html`<div
      class="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs"
      role="tablist"
      aria-label="Time range"
      data-tour="time-range"
      data-testid="time-range-chips"
    >
      ${TIME_RANGE_KEYS.map((key) => {
        const isActive = filters.range === key;
        const href = `/${buildFilterQs(filters, { range: key })}`;
        const cls = isActive
          ? 'rounded-full bg-brand-600 px-3 py-1 font-semibold text-white'
          : 'rounded-full px-3 py-1 font-medium text-slate-600 hover:bg-slate-100';
        return html`<a
            href="${href}"
            class="${cls}"
            role="tab"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-testid="range-chip-${key}"
            data-active="${isActive ? 'true' : 'false'}"
          >${TIME_RANGES[key].shortLabel}</a>`;
      })}
    </div>`;
}

function sourceChips(filters: WorkspaceFilters) {
  const sources: Array<{ key: LeadSource | null; label: string; dot?: string }> = [
    { key: null, label: 'All sources' },
    { key: 'google_lsa_email', label: 'Google LSA', dot: 'bg-[#4285F4]' },
    { key: 'website_form', label: 'Website Form', dot: 'bg-brand-600' },
    { key: 'answerforce_email', label: 'AnswerForce', dot: 'bg-orange-500' },
  ];
  return html`<div
      class="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Source filter"
      data-tour="source-filter"
      data-testid="source-chips"
    >
      ${sources.map((s) => {
        const isActive = filters.source === s.key;
        const href = `/${buildFilterQs(filters, { source: s.key })}`;
        const cls = isActive
          ? 'inline-flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800'
          : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50';
        return html`<a
            href="${href}"
            class="${cls}"
            role="tab"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-testid="source-chip-${s.key ?? 'all'}"
            data-active="${isActive ? 'true' : 'false'}"
          >
            ${s.dot ? html`<span class="inline-block h-2 w-2 rounded-full ${s.dot}" aria-hidden="true"></span>` : ''}
            ${s.label}
          </a>`;
      })}
    </div>`;
}

function triageTabs(filters: WorkspaceFilters, counts: Record<TriageKey, number>) {
  return html`<div
      class="flex flex-wrap items-center gap-1 border-b border-slate-200"
      role="tablist"
      aria-label="Triage tabs"
      data-tour="tabs"
      data-testid="triage-tabs"
    >
      ${TRIAGE_KEYS.map((key) => {
        const isActive = filters.triage === key;
        const href = `/${buildFilterQs(filters, { triage: key })}`;
        const cls = isActive
          ? 'border-b-2 border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700'
          : 'border-b-2 border-transparent px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-800';
        const count = counts[key];
        return html`<a
            href="${href}"
            class="${cls}"
            role="tab"
            aria-selected="${isActive ? 'true' : 'false'}"
            data-testid="triage-tab-${key}"
            data-active="${isActive ? 'true' : 'false'}"
          >
            ${TRIAGE_LABELS[key]}
            <span class="ml-1.5 inline-flex items-center justify-center rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-700">${count}</span>
          </a>`;
      })}
    </div>`;
}

export function leadsListRegion(leads: Lead[], filters: WorkspaceFilters, total: number, activeLeadId: string | null) {
  const pollUrl = `/partials/leads-list${buildFilterQs(filters)}`;
  return html`<section
      id="leads-list-region"
      class="flex flex-col gap-2"
      data-testid="leads-list-region"
      hx-get="${pollUrl}"
      hx-trigger="every 15s[document.visibilityState==='visible']"
      hx-swap="outerHTML"
    >
      <div class="flex items-center justify-between text-xs text-slate-500">
        <span data-testid="leads-list-count">${total} ${total === 1 ? 'lead' : 'leads'} ${TIME_RANGES[filters.range].label.toLowerCase()}</span>
      </div>
      ${leads.length === 0
        ? html`<div class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500" data-testid="leads-empty">
            <p class="font-medium text-slate-700">No leads in this view yet.</p>
            <p class="mt-1 text-xs">Try a wider range, or click <strong>Simulate Lead</strong> to see the pipeline run.</p>
          </div>`
        : leads.map((lead, index) =>
            leadCard({ lead, isActive: lead.id === activeLeadId, isFirst: index === 0 }),
          )}
    </section>`;
}

function helpHint() {
  return html`<div class="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
      <p class="font-semibold text-slate-700 mb-1">Tip</p>
      <p>Click any card to load it on the right. Use <strong>Simulate Lead</strong> in the header to demo the full pipeline.</p>
    </div>`;
}

export function workspacePage(props: WorkspaceProps) {
  const { filters, leads, total, triageCounts, snapshot, activeLead } = props;
  const kpiPollUrl = `/partials/kpi-strip${buildFilterQs(filters)}`;
  const tourBootstrap = raw(`<script>
    (function() {
      function ready(fn){ if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
      ready(function() {
        try {
          var done = localStorage.getItem('pts_tour_done');
          if (!done && location.pathname === '/' && window.startTour) {
            setTimeout(function(){ window.startTour({ auto: true }); }, 800);
          }
        } catch(e) {}
        var btn = document.getElementById('start-tour-btn');
        if (btn && !btn._wired) {
          btn._wired = true;
          btn.addEventListener('click', function() {
            if (window.startTour) window.startTour({ auto: false });
          });
        }
      });
    })();
  </script>`);
  return html`<div class="space-y-4" data-testid="workspace-page">
      ${kpiStrip({ snapshot, range: filters.range, pollUrl: kpiPollUrl })}
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        ${timeRangeChips(filters)}
        ${sourceChips(filters)}
      </div>
      ${triageTabs(filters, triageCounts)}
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,640px)]">
        <div class="space-y-3">
          ${leadsListRegion(leads, filters, total, activeLead?.lead.id ?? null)}
          ${helpHint()}
        </div>
        <aside
          id="detail-panel"
          class="rounded-lg border border-slate-200 bg-white shadow-sm lg:sticky lg:top-[88px] lg:h-[calc(100vh-110px)] lg:overflow-hidden"
          data-testid="detail-panel-host"
        >
          ${activeLead
            ? detailPanel({
                lead: activeLead.lead,
                auditEvents: activeLead.auditEvents,
                sourceEvents: activeLead.sourceEvents,
                outboundMessages: activeLead.outboundMessages,
              })
            : detailPanelEmpty()}
        </aside>
      </div>
      ${tourBootstrap}
    </div>`;
}
