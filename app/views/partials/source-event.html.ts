import { html } from 'hono/html';
import type { LeadSourceEvent } from '../../db/schema.js';
import { formatDateET, formatSource } from '../../lib/format.js';

function tryParseJson(text: string | null | undefined): unknown {
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

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function detailKeyLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ParsedEmail {
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  body: string;
}

/**
 * Parse a raw RFC822-ish email string. Handles the simple intake fixture format
 * where headers (From: / To: / Subject: / Date:) precede a blank-line-separated body.
 */
function parseRawEmail(rawEmail: string): ParsedEmail {
  const result: ParsedEmail = { from: null, to: null, subject: null, date: null, body: '' };
  const lines = rawEmail.split(/\r?\n/);
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const m = /^([A-Za-z\-]+):\s*(.*)$/.exec(line);
    if (!m) {
      bodyStart = i;
      break;
    }
    const [, key, value] = m;
    const lower = (key ?? '').toLowerCase();
    if (lower === 'from') result.from = value ?? null;
    else if (lower === 'to') result.to = value ?? null;
    else if (lower === 'subject') result.subject = value ?? null;
    else if (lower === 'date') result.date = value ?? null;
  }
  result.body = lines.slice(bodyStart).join('\n').trim();
  return result;
}

function emailHeaderRow(label: string, value: string | null) {
  if (!value) return html``;
  return html`<div class="flex gap-2 text-xs">
    <span class="w-14 shrink-0 font-semibold text-slate-500">${label}</span>
    <span class="text-slate-800 break-words">${value}</span>
  </div>`;
}

function emailCard(parsed: ParsedEmail) {
  return html`<div class="rounded-md border border-slate-200 bg-white" data-testid="payload-email-card">
    <div class="border-b border-slate-200 bg-slate-50 px-3 py-2 space-y-1">
      ${emailHeaderRow('From', parsed.from)}
      ${emailHeaderRow('To', parsed.to)}
      ${emailHeaderRow('Subject', parsed.subject)}
      ${emailHeaderRow('Date', parsed.date)}
    </div>
    <div class="px-3 py-3">
      ${parsed.body
        ? html`<pre class="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">${parsed.body}</pre>`
        : html`<p class="text-sm text-slate-500 italic">(empty body)</p>`}
    </div>
  </div>`;
}

function parsedSummaryCard(parsed: Record<string, unknown>) {
  const entries = Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return html``;
  return html`<details class="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
    <summary class="cursor-pointer text-xs font-semibold text-slate-600">Parsed fields (${entries.length})</summary>
    <dl class="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
      ${entries.map(
        ([k, v]) => html`<div class="flex flex-col">
            <dt class="text-slate-500">${detailKeyLabel(k)}</dt>
            <dd class="text-slate-800 break-words">${typeof v === 'string' ? v : JSON.stringify(v)}</dd>
          </div>`,
      )}
    </dl>
  </details>`;
}

function formCard(payload: Record<string, unknown>) {
  const fieldMap: Array<{ key: string; label: string }> = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'zip', label: 'ZIP' },
    { key: 'service_type', label: 'Service Type' },
    { key: 'message', label: 'Message' },
    { key: 'form', label: 'Form ID' },
  ];
  const known = fieldMap
    .map((f) => ({ ...f, value: payload[f.key] }))
    .filter((f) => f.value !== null && f.value !== undefined && f.value !== '');
  const otherEntries = Object.entries(payload).filter(
    ([k, v]) => !fieldMap.some((f) => f.key === k) && v !== null && v !== undefined && v !== '' && k !== 'secret',
  );
  return html`<div class="rounded-md border border-slate-200 bg-white" data-testid="payload-form-card">
    <div class="border-b border-slate-200 bg-slate-50 px-3 py-2">
      <span class="text-xs font-semibold text-slate-600">Website form submission</span>
    </div>
    <dl class="px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
      ${known.map(
        (f) => html`<div class="flex flex-col">
            <dt class="text-xs text-slate-500">${f.label}</dt>
            <dd class="text-slate-900 break-words">${typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}</dd>
          </div>`,
      )}
      ${otherEntries.length > 0
        ? html`<div class="sm:col-span-2 mt-1 pt-2 border-t border-slate-100">
            <div class="text-xs text-slate-500 mb-1">Other fields</div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
              ${otherEntries.map(
                ([k, v]) => html`<div class="flex flex-col">
                    <dt class="text-slate-500">${detailKeyLabel(k)}</dt>
                    <dd class="text-slate-800 break-words">${typeof v === 'string' ? v : JSON.stringify(v)}</dd>
                  </div>`,
              )}
            </dl>
          </div>`
        : ''}
    </dl>
  </div>`;
}

function rawJsonFallback(rawPayload: string) {
  let pretty = rawPayload;
  try {
    pretty = JSON.stringify(JSON.parse(rawPayload), null, 2);
  } catch {
    /* keep raw */
  }
  // hono/html auto-escapes string interpolations, so we hand it the plain
  // string. Pre-escaping with our own escapeHtml() caused double-escaping
  // (`&quot;` was re-encoded to `&amp;quot;`).
  return html`<pre class="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">${pretty}</pre>`;
}

function sourceBadge(source: string) {
  const palette =
    source === 'google_lsa_email'
      ? 'bg-amber-100 text-amber-800'
      : source === 'website_form'
        ? 'bg-blue-100 text-blue-800'
        : source === 'answerforce_email'
          ? 'bg-purple-100 text-purple-800'
          : 'bg-slate-100 text-slate-700';
  return html`<span class="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${palette}">${formatSource(source)}</span>`;
}

export function sourceEventCard(event: LeadSourceEvent) {
  const parsed = tryParseJson(event.rawPayload);
  let body: ReturnType<typeof html>;

  if (isPlainObject(parsed)) {
    const rawEmail = pickString(parsed, 'raw_email');
    if (rawEmail) {
      const email = parseRawEmail(rawEmail);
      const innerParsed = isPlainObject(parsed.parsed) ? (parsed.parsed as Record<string, unknown>) : null;
      body = html`${emailCard(email)}${innerParsed ? parsedSummaryCard(innerParsed) : ''}`;
    } else if (event.source === 'website_form') {
      body = formCard(parsed);
    } else if (typeof parsed.body === 'string' || typeof parsed.subject === 'string' || typeof parsed.from === 'string') {
      const synthetic: ParsedEmail = {
        from: typeof parsed.from === 'string' ? parsed.from : null,
        to: typeof parsed.to === 'string' ? parsed.to : null,
        subject: typeof parsed.subject === 'string' ? parsed.subject : null,
        date: typeof parsed.date === 'string' ? parsed.date : null,
        body: typeof parsed.body === 'string' ? parsed.body : '',
      };
      body = emailCard(synthetic);
    } else {
      body = rawJsonFallback(event.rawPayload);
    }
  } else {
    body = rawJsonFallback(event.rawPayload);
  }

  return html`<div class="space-y-2" data-testid="source-event" data-source="${event.source}">
    <div class="flex items-center gap-2 text-xs text-slate-500">
      ${sourceBadge(event.source)}
      <span title="${formatDateET(event.receivedAt)}">${formatDateET(event.receivedAt)}</span>
    </div>
    ${body}
  </div>`;
}

export function sourceEventList(events: LeadSourceEvent[]) {
  if (events.length === 0) {
    return html`<p class="text-sm text-slate-500" data-testid="payload-empty">No source events recorded.</p>`;
  }
  return html`<div class="space-y-4">${events.map((e) => sourceEventCard(e))}</div>`;
}
