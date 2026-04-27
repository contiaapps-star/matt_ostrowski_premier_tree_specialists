import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

export type ViewBody = HtmlEscapedString | Promise<HtmlEscapedString> | string;

export interface BaseLayoutOptions {
  title: string;
  body: ViewBody;
  active?: 'dashboard' | 'queue' | 'stats' | null;
  bodyClass?: string;
  reviewQueueCount?: number;
  userDisplayName?: string | null;
  flashMessage?: { kind: 'success' | 'error' | 'info'; text: string } | null;
}

function navLink(href: string, label: string, isActive: boolean) {
  const classes = isActive
    ? 'text-brand-700 font-semibold border-b-2 border-brand-600 px-3 py-2'
    : 'text-slate-700 hover:text-brand-700 px-3 py-2';
  return html`<a href="${href}" class="${classes}">${label}</a>`;
}

function reviewBadge(count: number | undefined) {
  if (!count || count <= 0) return html``;
  return html`<a
      href="/queue"
      class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
      title="Leads awaiting review"
      data-testid="header-review-count"
    >
      <span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span>
      ${count} need${count === 1 ? 's' : ''} review
    </a>`;
}

function flashBanner(flash: BaseLayoutOptions['flashMessage']) {
  if (!flash) return html``;
  const palette =
    flash.kind === 'success'
      ? 'bg-green-50 border-green-200 text-green-900'
      : flash.kind === 'error'
        ? 'bg-red-50 border-red-200 text-red-900'
        : 'bg-slate-50 border-slate-200 text-slate-800';
  return html`<div
      class="${palette} border rounded-md px-4 py-3 text-sm"
      data-testid="flash-message"
    >${flash.text}</div>`;
}

export function baseLayout({
  title,
  body,
  active = null,
  bodyClass,
  reviewQueueCount,
  userDisplayName,
  flashMessage,
}: BaseLayoutOptions) {
  const userName = userDisplayName ?? 'matt@premiertreesllc.com';
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Premier Tree Specialists</title>
  <link rel="stylesheet" href="/styles.css" />
  <script src="https://unpkg.com/htmx.org@2.0.3" defer></script>
</head>
<body class="${bodyClass ?? 'bg-slate-50 text-slate-900 antialiased font-sans'}">
  <header class="bg-white border-b border-slate-200">
    <div class="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
      <a href="/dashboard" class="flex items-center gap-2">
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white font-bold">P</span>
        <span class="text-lg font-semibold text-slate-900">Premier Tree Specialists</span>
      </a>
      <nav class="hidden md:flex items-center gap-2 text-sm">
        ${navLink('/dashboard', 'Dashboard', active === 'dashboard')}
        ${navLink('/queue', 'Review Queue', active === 'queue')}
        ${navLink('/stats', 'Stats', active === 'stats')}
      </nav>
      <div class="flex items-center gap-3">
        ${reviewBadge(reviewQueueCount)}
        <span class="hidden md:inline text-sm text-slate-600" data-testid="header-user">${userName}</span>
      </div>
    </div>
  </header>
  <div id="flash-region" class="mx-auto max-w-7xl px-4 pt-3">${flashBanner(flashMessage ?? null)}</div>
  <main class="mx-auto max-w-7xl px-4 py-6">
    ${body}
  </main>
  ${raw('')}
</body>
</html>`;
}

export function flashOob(text: string, kind: 'success' | 'error' | 'info' = 'success') {
  const palette =
    kind === 'success'
      ? 'bg-green-50 border-green-200 text-green-900'
      : kind === 'error'
        ? 'bg-red-50 border-red-200 text-red-900'
        : 'bg-slate-50 border-slate-200 text-slate-800';
  return html`<div id="flash-region" hx-swap-oob="innerHTML" class="mx-auto max-w-7xl px-4 pt-3">
    <div class="${palette} border rounded-md px-4 py-3 text-sm" data-testid="flash-message">${text}</div>
  </div>`;
}
