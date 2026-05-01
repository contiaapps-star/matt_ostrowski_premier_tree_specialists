import { html } from 'hono/html';
import type { AgentMailMessageRow } from '../../db/schema.js';
import { formatDateET, formatTimeAgo } from '../../lib/format.js';
import type {
  ArchiveCounts,
  ArchiveListItem,
} from '../../services/agent-mail-archive.service.js';

function escapeAttr(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(s: string | null | undefined): string {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STATUS_BADGE: Record<string, string> = {
  parsed: 'bg-green-100 text-green-800 border-green-200',
  pending: 'bg-slate-100 text-slate-700 border-slate-200',
  unparseable: 'bg-amber-100 text-amber-800 border-amber-200',
  duplicate: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SOURCE_LABEL: Record<string, string> = {
  google_lsa_email: 'Google LSA',
  answerforce_email: 'AnswerForce',
  website_form_email: 'Website Form',
  unknown: 'Unknown',
};

const SOURCE_BADGE: Record<string, string> = {
  google_lsa_email: 'bg-[#e8f0fe] text-[#1967d2] border-[#aecbfa]',
  answerforce_email: 'bg-orange-100 text-orange-800 border-orange-200',
  website_form_email: 'bg-brand-100 text-brand-800 border-brand-200',
  unknown: 'bg-slate-100 text-slate-600 border-slate-200',
};

function statusBadge(status: string) {
  const cls = STATUS_BADGE[status] ?? 'bg-slate-100 text-slate-700 border-slate-200';
  return html`<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}" data-testid="status-${status}">${status}</span>`;
}

function sourceBadge(source: string | null) {
  const key = source ?? 'unknown';
  const cls = SOURCE_BADGE[key] ?? SOURCE_BADGE['unknown']!;
  const label = SOURCE_LABEL[key] ?? key;
  return html`<span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}">${label}</span>`;
}

export interface ArchiveListPageProps {
  items: ArchiveListItem[];
  counts: ArchiveCounts;
  filter: { parseStatus: string | null; detectedSource: string | null };
  agentMailAddress: string;
}

function statusFilters(filter: ArchiveListPageProps['filter'], counts: ArchiveCounts) {
  const items: Array<{ key: string | null; label: string; count: number }> = [
    { key: null, label: 'All', count: counts.total },
    { key: 'parsed', label: 'Parsed', count: counts.byStatus.parsed },
    { key: 'unparseable', label: 'Unparseable', count: counts.byStatus.unparseable },
    { key: 'pending', label: 'Pending', count: counts.byStatus.pending },
  ];
  return html`<div class="flex flex-wrap items-center gap-1.5" data-testid="archive-status-filters" role="tablist">
    ${items.map((it) => {
      const isActive = (filter.parseStatus ?? null) === it.key;
      const params = new URLSearchParams();
      if (it.key) params.set('status', it.key);
      if (filter.detectedSource) params.set('source', filter.detectedSource);
      const href = `/admin/agent-mail-archive${params.toString() ? `?${params.toString()}` : ''}`;
      const cls = isActive
        ? 'inline-flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800'
        : 'inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50';
      return html`<a href="${href}" class="${cls}" data-testid="archive-filter-${it.key ?? 'all'}" data-active="${isActive ? 'true' : 'false'}">
        ${it.label}
        <span class="inline-flex items-center justify-center rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold h-4 min-w-4 px-1">${it.count}</span>
      </a>`;
    })}
  </div>`;
}

export function archiveListPage(props: ArchiveListPageProps) {
  const { items, counts, filter, agentMailAddress } = props;
  return html`<div class="space-y-5" data-testid="archive-list-page">
    <header class="space-y-1">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-900">AgentMail archive</h1>
        <a href="/settings#inbound" class="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">← Back to settings</a>
      </div>
      <p class="text-sm text-slate-600">Every email forwarded to <code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">${escapeHtml(agentMailAddress || 'the agent inbox')}</code> is archived here — even when the parser can't extract a lead. Use this to spot misrouted senders or tune the parsers.</p>
    </header>

    ${statusFilters(filter, counts)}

    ${items.length === 0
      ? html`<div class="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500" data-testid="archive-empty">
          <p class="font-medium text-slate-700">No messages match this filter.</p>
          <p class="mt-1 text-xs">Forward an email to <code class="bg-slate-100 px-1 rounded">${escapeHtml(agentMailAddress || 'the agent inbox')}</code> and refresh — it'll show up here within seconds of the AgentMail webhook firing.</p>
        </div>`
      : html`<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table class="w-full text-sm" data-testid="archive-table">
            <thead class="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-4 py-2 text-left">Received</th>
                <th class="px-4 py-2 text-left">From</th>
                <th class="px-4 py-2 text-left">Subject</th>
                <th class="px-4 py-2 text-left">Source</th>
                <th class="px-4 py-2 text-left">Status</th>
                <th class="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item) => archiveRow(item))}
            </tbody>
          </table>
        </div>`}
  </div>`;
}

function archiveRow(item: ArchiveListItem) {
  const subject = item.subject && item.subject.trim().length > 0 ? item.subject : '(no subject)';
  const fromAddr = item.fromAddress ?? '(no sender)';
  return html`<tr class="border-t border-slate-100 hover:bg-slate-50" data-testid="archive-row" data-archive-id="${item.id}">
    <td class="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">
      <div>${formatDateET(item.receivedAt)}</div>
      <div class="text-[11px] text-slate-400">${formatTimeAgo(item.receivedAt)}</div>
    </td>
    <td class="px-4 py-2 text-xs text-slate-700 max-w-[220px] truncate" title="${escapeAttr(fromAddr)}">${escapeHtml(fromAddr)}</td>
    <td class="px-4 py-2 text-xs text-slate-900 max-w-[360px] truncate" title="${escapeAttr(subject)}">${escapeHtml(subject)}</td>
    <td class="px-4 py-2">${sourceBadge(item.detectedSource)}</td>
    <td class="px-4 py-2">${statusBadge(item.parseStatus)}</td>
    <td class="px-2 py-2 text-right">
      <a href="/admin/agent-mail-archive/${escapeAttr(item.id)}" class="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" data-testid="archive-view-link">
        View
        <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd"/></svg>
      </a>
    </td>
  </tr>`;
}

export interface ArchiveDetailPageProps {
  message: AgentMailMessageRow;
}

function field(label: string, value: string | null | undefined) {
  return html`<div>
    <div class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${label}</div>
    <div class="text-sm text-slate-900 mt-0.5 break-all">${value && value.trim().length > 0 ? escapeHtml(value) : html`<span class="text-slate-400 italic">—</span>`}</div>
  </div>`;
}

function prettyJson(json: string | null | undefined): string {
  if (!json) return '';
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function archiveDetailPage(props: ArchiveDetailPageProps) {
  const m = props.message;
  const toList = parseToAddresses(m.toAddresses);

  return html`<div class="space-y-5" data-testid="archive-detail-page" data-archive-id="${m.id}">
    <header class="space-y-1">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <h1 class="text-xl font-bold text-slate-900">Archived message</h1>
        <a href="/admin/agent-mail-archive" class="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">← Back to archive</a>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${statusBadge(m.parseStatus)}
        ${sourceBadge(m.detectedSource)}
        ${m.leadId
          ? html`<a href="/leads/${m.leadId}" class="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-semibold text-brand-800 hover:bg-brand-100" data-testid="archive-detail-lead-link">
              ↗ Open lead
            </a>`
          : html``}
      </div>
    </header>

    <section class="rounded-lg border border-slate-200 bg-white px-4 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="archive-detail-headers">
      ${field('From', m.fromAddress)}
      ${field('To', toList.join(', '))}
      ${field('Subject', m.subject)}
      ${field('Received', formatDateET(m.receivedAt))}
      ${field('AgentMail message id', m.agentmailMessageId)}
      ${field('Inbox id', m.inboxId)}
    </section>

    ${m.parseError
      ? html`<section class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" data-testid="archive-detail-parse-error">
          <div class="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Parse error</div>
          <div class="mt-0.5 font-mono text-xs">${escapeHtml(m.parseError)}</div>
        </section>`
      : html``}

    <section class="rounded-lg border border-slate-200 bg-white">
      <header class="border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Email body</h2>
        ${m.htmlBody ? html`<span class="text-[11px] text-slate-500">text shown — HTML version available below</span>` : html``}
      </header>
      <div class="px-4 py-4">
        <pre class="whitespace-pre-wrap break-words text-xs text-slate-800 font-mono" data-testid="archive-detail-text-body">${escapeHtml(m.textBody ?? '')}</pre>
      </div>
    </section>

    ${m.htmlBody
      ? html`<details class="rounded-lg border border-slate-200 bg-white">
          <summary class="cursor-pointer select-none px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">HTML body</summary>
          <div class="border-t border-slate-200 px-4 py-3">
            <pre class="whitespace-pre-wrap break-words text-xs text-slate-700 font-mono" data-testid="archive-detail-html-body">${escapeHtml(m.htmlBody)}</pre>
          </div>
        </details>`
      : html``}

    ${m.headersJson
      ? html`<details class="rounded-lg border border-slate-200 bg-white">
          <summary class="cursor-pointer select-none px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Headers</summary>
          <div class="border-t border-slate-200 px-4 py-3">
            <pre class="whitespace-pre-wrap break-words text-xs text-slate-700 font-mono" data-testid="archive-detail-headers-json">${escapeHtml(prettyJson(m.headersJson))}</pre>
          </div>
        </details>`
      : html``}

    <details class="rounded-lg border border-slate-200 bg-white">
      <summary class="cursor-pointer select-none px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Raw webhook payload</summary>
      <div class="border-t border-slate-200 px-4 py-3">
        <pre class="whitespace-pre-wrap break-words text-xs text-slate-700 font-mono" data-testid="archive-detail-raw">${escapeHtml(prettyJson(m.rawPayload))}</pre>
      </div>
    </details>
  </div>`;
}

function parseToAddresses(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
    return [];
  } catch {
    return [];
  }
}

export function archiveNotFoundPage(id: string) {
  return html`<div class="space-y-3" data-testid="archive-not-found">
    <header class="space-y-1">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-slate-900">Archived message</h1>
        <a href="/admin/agent-mail-archive" class="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">← Back to archive</a>
      </div>
    </header>
    <div class="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-600">
      <p class="font-semibold text-slate-800">Message not found.</p>
      <p class="mt-1 text-xs">No archive row with id <code class="bg-slate-100 px-1 rounded">${escapeHtml(id)}</code>.</p>
    </div>
  </div>`;
}
