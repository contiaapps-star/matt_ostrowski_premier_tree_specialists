import { html, raw } from 'hono/html';

export interface EmptyStateOptions {
  title: string;
  description?: string | null;
  testId?: string;
}

export function emptyState({ title, description, testId }: EmptyStateOptions) {
  const svg = raw(`
    <svg viewBox="0 0 64 64" class="h-20 w-20 text-brand-600" aria-hidden="true">
      <path fill="currentColor" d="M32 4 12 28h8L8 44h12v8l4 4h16l4-4v-8h12L44 28h8L32 4z" opacity="0.85" />
      <rect x="28" y="52" width="8" height="8" fill="currentColor" />
    </svg>
  `);
  return html`<div
      class="flex flex-col items-center justify-center gap-3 py-12 text-center"
      data-testid="${testId ?? 'empty-state'}"
    >
      ${svg}
      <p class="text-base font-medium text-slate-900">${title}</p>
      ${description ? html`<p class="text-sm text-slate-600">${description}</p>` : ''}
    </div>`;
}
