import { html, raw } from 'hono/html';
import type { AuditLogRow } from '../../db/schema.js';
import { formatDateET, formatTimeAgo } from '../../lib/format.js';

type Category =
  | 'intake'
  | 'ai'
  | 'escalation'
  | 'success'
  | 'failure'
  | 'edit'
  | 'human-action'
  | 'reject'
  | 'retry'
  | 'dispatch'
  | 'arbostar'
  | 'other';

interface ActionInfo {
  label: string;
  category: Category;
  icon: string;
}

function humanize(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function nameFromActionSuffix(action: string, prefix: string): string {
  const tail = action.slice(prefix.length);
  return tail.length > 0 ? tail : 'someone';
}

function describeAction(action: string): ActionInfo {
  if (action === 'ingested') return { label: 'Lead ingested', category: 'intake', icon: 'inbox' };
  if (action === 'extracted') return { label: 'Data extracted by LLM', category: 'ai', icon: 'sparkles' };
  if (action === 'extracted_no_phone')
    return { label: 'Extraction completed (no phone found)', category: 'ai', icon: 'sparkles' };
  if (action === 'extraction_failed')
    return { label: 'Extraction failed', category: 'failure', icon: 'x' };

  if (action === 'response_generated')
    return { label: 'Response drafted by LLM', category: 'ai', icon: 'sparkles' };
  if (action === 'response_generation_failed')
    return { label: 'Response generation failed', category: 'failure', icon: 'x' };

  if (action === 'routed_auto_sent')
    return { label: 'Routed to auto-send (high confidence)', category: 'success', icon: 'check' };
  if (action === 'routed_awaiting_review')
    return { label: 'Routed to review queue', category: 'ai', icon: 'flag' };
  if (action === 'routed_manually_flagged')
    return { label: 'Routed to manual flag', category: 'escalation', icon: 'flag' };

  if (action === 'escalation_detected')
    return { label: 'Escalation detected', category: 'escalation', icon: 'alert' };

  if (action.startsWith('approved_by_'))
    return {
      label: `Approved by ${nameFromActionSuffix(action, 'approved_by_')}`,
      category: 'human-action',
      icon: 'thumbs-up',
    };
  if (action.startsWith('edited_and_sent_by_'))
    return {
      label: `Edited & sent by ${nameFromActionSuffix(action, 'edited_and_sent_by_')}`,
      category: 'human-action',
      icon: 'pencil',
    };
  if (action.startsWith('rejected_by_'))
    return {
      label: `Rejected by ${nameFromActionSuffix(action, 'rejected_by_')}`,
      category: 'reject',
      icon: 'x',
    };
  if (action === 'manually_edited_extracted_data')
    return { label: 'Extracted data edited manually', category: 'edit', icon: 'pencil' };
  if (action === 'regenerate_requested')
    return { label: 'Regenerate requested', category: 'retry', icon: 'refresh' };

  if (action.startsWith('dispatch_') && action.endsWith('_succeeded'))
    return { label: humanize(action), category: 'success', icon: 'send' };
  if (action.startsWith('dispatch_') && action.endsWith('_failed'))
    return { label: humanize(action), category: 'failure', icon: 'send' };
  if (action.startsWith('dispatch_'))
    return { label: humanize(action), category: 'dispatch', icon: 'send' };

  if (action.startsWith('arbostar_synced'))
    return { label: 'Pushed to ArboStar', category: 'success', icon: 'crm' };
  if (action.startsWith('arbostar_'))
    return {
      label: humanize(action),
      category: action.includes('failed') ? 'failure' : 'arbostar',
      icon: 'crm',
    };

  if (action.includes('failed') || action === 'failed')
    return { label: humanize(action), category: 'failure', icon: 'x' };

  return { label: humanize(action), category: 'other', icon: 'dot' };
}

function categoryPalette(category: Category): { dotBg: string; dotRing: string; chipBg: string; chipText: string } {
  switch (category) {
    case 'intake':
      return {
        dotBg: 'bg-slate-400',
        dotRing: 'ring-slate-200',
        chipBg: 'bg-slate-100',
        chipText: 'text-slate-700',
      };
    case 'ai':
      return {
        dotBg: 'bg-indigo-500',
        dotRing: 'ring-indigo-200',
        chipBg: 'bg-indigo-100',
        chipText: 'text-indigo-800',
      };
    case 'escalation':
      return {
        dotBg: 'bg-red-500',
        dotRing: 'ring-red-200',
        chipBg: 'bg-red-100',
        chipText: 'text-red-800',
      };
    case 'success':
      return {
        dotBg: 'bg-green-600',
        dotRing: 'ring-green-200',
        chipBg: 'bg-green-100',
        chipText: 'text-green-800',
      };
    case 'failure':
      return {
        dotBg: 'bg-red-600',
        dotRing: 'ring-red-200',
        chipBg: 'bg-red-100',
        chipText: 'text-red-800',
      };
    case 'edit':
      return {
        dotBg: 'bg-amber-500',
        dotRing: 'ring-amber-200',
        chipBg: 'bg-amber-100',
        chipText: 'text-amber-800',
      };
    case 'human-action':
      return {
        dotBg: 'bg-emerald-600',
        dotRing: 'ring-emerald-200',
        chipBg: 'bg-emerald-100',
        chipText: 'text-emerald-800',
      };
    case 'reject':
      return {
        dotBg: 'bg-red-600',
        dotRing: 'ring-red-200',
        chipBg: 'bg-red-100',
        chipText: 'text-red-800',
      };
    case 'retry':
      return {
        dotBg: 'bg-slate-500',
        dotRing: 'ring-slate-200',
        chipBg: 'bg-slate-100',
        chipText: 'text-slate-700',
      };
    case 'dispatch':
      return {
        dotBg: 'bg-blue-500',
        dotRing: 'ring-blue-200',
        chipBg: 'bg-blue-100',
        chipText: 'text-blue-800',
      };
    case 'arbostar':
      return {
        dotBg: 'bg-purple-500',
        dotRing: 'ring-purple-200',
        chipBg: 'bg-purple-100',
        chipText: 'text-purple-800',
      };
    default:
      return {
        dotBg: 'bg-slate-400',
        dotRing: 'ring-slate-200',
        chipBg: 'bg-slate-100',
        chipText: 'text-slate-700',
      };
  }
}

function iconSvg(name: string): ReturnType<typeof raw> {
  // Inline single-color SVGs (currentColor). 12x12 viewbox kept simple.
  const stroke = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"';
  const wrap = (svg: string) =>
    raw(`<svg viewBox="0 0 24 24" class="h-3 w-3 text-white" aria-hidden="true">${svg}</svg>`);
  switch (name) {
    case 'inbox':
      return wrap(`<path ${stroke} d="M3 13l3-8h12l3 8M3 13v6h18v-6M3 13h5l1 2h6l1-2h5"/>`);
    case 'sparkles':
      return wrap(`<path ${stroke} d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>`);
    case 'flag':
      return wrap(`<path ${stroke} d="M5 21V4M5 4h11l-2 4 2 4H5"/>`);
    case 'alert':
      return wrap(`<path ${stroke} d="M12 4l9 16H3L12 4zM12 10v4M12 17v.01"/>`);
    case 'check':
      return wrap(`<path ${stroke} d="M5 12l5 5L20 7"/>`);
    case 'x':
      return wrap(`<path ${stroke} d="M6 6l12 12M18 6L6 18"/>`);
    case 'thumbs-up':
      return wrap(`<path ${stroke} d="M7 10v11M14 4l-2 6h7l-2 8H7V10l4-6 3 0z"/>`);
    case 'pencil':
      return wrap(`<path ${stroke} d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/>`);
    case 'refresh':
      return wrap(`<path ${stroke} d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M4 4v5h5M20 20v-5h-5"/>`);
    case 'send':
      return wrap(`<path ${stroke} d="M4 12L20 4l-3 16-5-5-8-3z"/>`);
    case 'crm':
      return wrap(`<path ${stroke} d="M4 7h16M4 12h16M4 17h10"/>`);
    default:
      return wrap(`<circle cx="12" cy="12" r="3" ${stroke}/>`);
  }
}

function actorIconAndLabel(actor: string) {
  if (actor === 'system' || actor === 'auto') {
    return html`<span class="inline-flex items-center gap-1 text-slate-500">
      <svg viewBox="0 0 24 24" class="h-3 w-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M12 7V3M9 12h.01M15 12h.01M9 16h6"/></svg>
      <span>system</span>
    </span>`;
  }
  return html`<span class="inline-flex items-center gap-1 text-slate-600">
    <svg viewBox="0 0 24 24" class="h-3 w-3" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></svg>
    <span>${actor}</span>
  </span>`;
}

function tryParseJson(text: string | null): unknown | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

function detailKeyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderDetails(parsed: unknown) {
  if (parsed === null || parsed === undefined) return html``;
  if (isPlainObject(parsed)) {
    const entries = Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return html``;
    return html`<dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      ${entries.map(
        ([k, v]) => html`<div class="flex flex-col">
            <dt class="text-slate-500">${detailKeyLabel(k)}</dt>
            <dd class="text-slate-800 break-words">${formatDetailValue(v)}</dd>
          </div>`,
      )}
    </dl>`;
  }
  return html`<p class="mt-2 text-xs text-slate-700 break-words">${formatDetailValue(parsed)}</p>`;
}

export function auditEventItem(event: AuditLogRow) {
  const info = describeAction(event.action);
  const palette = categoryPalette(info.category);
  const parsedDetails = tryParseJson(event.details ?? null);
  return html`<li class="relative pl-10 pb-4 last:pb-0" data-testid="audit-event" data-action="${event.action}">
    <span
      class="absolute left-2 top-1 inline-flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${palette.dotBg}"
      aria-hidden="true"
    >${iconSvg(info.icon)}</span>
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-medium text-slate-900 text-sm" data-testid="audit-event-label">${info.label}</span>
      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${palette.chipBg} ${palette.chipText}">${info.category}</span>
    </div>
    <div class="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
      ${actorIconAndLabel(event.actor)}
      <span aria-hidden="true">·</span>
      <span title="${formatDateET(event.createdAt)}">${formatTimeAgo(event.createdAt)}</span>
    </div>
    ${renderDetails(parsedDetails)}
  </li>`;
}

export function auditTimeline(events: AuditLogRow[]) {
  if (events.length === 0) {
    return html`<p class="text-sm text-slate-500" data-testid="audit-empty">No audit events yet.</p>`;
  }
  return html`<ol class="relative" data-testid="audit-timeline">
    <span class="absolute top-1 left-[1.10rem] bottom-3 w-px bg-slate-200" aria-hidden="true"></span>
    ${events.map((e) => auditEventItem(e))}
  </ol>`;
}
