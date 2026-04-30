import { html } from 'hono/html';
import type { LeadSource } from '../../db/schema.js';

export type SourceSquareSize = 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<SourceSquareSize, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-base',
  lg: 'h-14 w-14 text-lg',
};

const SOURCE_SHELL: Record<LeadSource, string> = {
  google_lsa_email: 'bg-white border border-slate-300 text-[#4285F4]',
  website_form: 'bg-brand-50 border border-brand-600 text-brand-700',
  answerforce_email: 'bg-orange-50 border border-orange-500 text-orange-700',
};

const SOURCE_LABEL: Record<LeadSource, string> = {
  google_lsa_email: 'Google LSA',
  website_form: 'Premier website form',
  answerforce_email: 'AnswerForce',
};

function googleG() {
  // Multicolor Google "G" mark, simplified to inline paths so we don't depend
  // on an external asset.
  return html`<svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true">
    <path fill="#EA4335" d="M12 5.04c1.78 0 3.36.61 4.62 1.81l3.45-3.45C17.99 1.34 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.6l4.02 3.12C6.27 7.05 8.91 5.04 12 5.04z"/>
    <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.45c-.28 1.48-1.13 2.74-2.4 3.59l3.86 2.99c2.27-2.09 3.58-5.18 3.58-8.82z"/>
    <path fill="#FBBC05" d="M5.31 14.28a7.16 7.16 0 0 1 0-4.55L1.28 6.6A11.97 11.97 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l4.03-3.12z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.92-2.91l-3.86-2.99c-1.07.72-2.45 1.14-4.06 1.14-3.09 0-5.73-2.01-6.69-4.84L1.28 17.4C3.26 21.31 7.31 24 12 24z"/>
  </svg>`;
}

function websiteW() {
  return html`<span class="font-bold leading-none" aria-hidden="true">W</span>`;
}

function answerForceMark() {
  // Phone-with-headset glyph; communicates "answering service" without needing
  // the AnswerForce trademark asset.
  return html`<svg viewBox="0 0 24 24" class="h-5 w-5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M3 11a9 9 0 0 1 18 0"/>
    <path d="M21 11v3a2 2 0 0 1-2 2h-1v-5h3z"/>
    <path d="M3 11v3a2 2 0 0 0 2 2h1v-5H3z"/>
    <path d="M19 16v1a3 3 0 0 1-3 3h-3"/>
  </svg>`;
}

function glyph(source: LeadSource) {
  if (source === 'google_lsa_email') return googleG();
  if (source === 'website_form') return websiteW();
  return answerForceMark();
}

export interface SourceSquareProps {
  source: LeadSource;
  size?: SourceSquareSize;
  className?: string;
  withTitle?: boolean;
}

export function sourceSquare({
  source,
  size = 'sm',
  className = '',
  withTitle = true,
}: SourceSquareProps) {
  const shell = SOURCE_SHELL[source] ?? 'bg-slate-50 border border-slate-300 text-slate-600';
  const sizeCls = SIZE_CLASS[size];
  const titleAttr = withTitle ? `title="${SOURCE_LABEL[source] ?? source}"` : '';
  return html`<span
      class="inline-flex shrink-0 items-center justify-center rounded-md ${shell} ${sizeCls} ${className}"
      data-source="${source}"
      data-testid="source-square"
      ${titleAttr}
      aria-label="${SOURCE_LABEL[source] ?? source}"
    >${glyph(source)}</span>`;
}
