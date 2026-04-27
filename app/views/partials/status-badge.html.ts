import { html } from 'hono/html';
import type { LeadStatus } from '../../db/schema.js';

const STATUS_LABELS: Record<LeadStatus, string> = {
  ingested: 'Ingested',
  extracting: 'Extracting',
  extracted: 'Extracted',
  responding: 'Generating',
  awaiting_review: 'Awaiting Review',
  auto_sent: 'Auto-sent',
  manually_sent: 'Manually sent',
  manually_flagged: 'Manual Flag',
  failed: 'Failed',
};

const STATUS_PALETTE: Record<LeadStatus, string> = {
  ingested: 'bg-slate-100 text-slate-700 border-slate-200',
  extracting: 'bg-slate-100 text-slate-700 border-slate-200',
  extracted: 'bg-blue-100 text-blue-800 border-blue-200',
  responding: 'bg-slate-100 text-slate-700 border-slate-200',
  awaiting_review: 'bg-amber-100 text-amber-800 border-amber-200',
  auto_sent: 'bg-green-100 text-green-800 border-green-200',
  manually_sent: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  manually_flagged: 'bg-red-100 text-red-800 border-red-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
};

export function statusBadge(status: string) {
  const safeStatus = (Object.hasOwn(STATUS_LABELS, status) ? status : 'ingested') as LeadStatus;
  const label = STATUS_LABELS[safeStatus];
  const palette = STATUS_PALETTE[safeStatus];
  return html`<span
      class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${palette}"
      data-testid="status-badge"
      data-status="${safeStatus}"
    >${label}</span>`;
}
