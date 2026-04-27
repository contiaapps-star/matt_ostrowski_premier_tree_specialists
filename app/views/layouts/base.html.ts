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
  csrfToken?: string;
}

function navLink(href: string, label: string, isActive: boolean) {
  const classes = isActive
    ? 'text-brand-700 font-semibold border-b-2 border-brand-600 px-3 py-2'
    : 'text-slate-700 hover:text-brand-700 px-3 py-2';
  return html`<a href="${href}" class="${classes}">${label}</a>`;
}

function reviewBadgeInner(count: number | undefined) {
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

function reviewBadge(count: number | undefined) {
  return html`<span id="header-review-region" data-testid="header-review-region">${reviewBadgeInner(count)}</span>`;
}

export function reviewBadgeOob(count: number) {
  return html`<span id="header-review-region" hx-swap-oob="true" data-testid="header-review-region">${reviewBadgeInner(count)}</span>`;
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
      role="status"
      aria-live="polite"
      data-testid="flash-message"
    >${flash.text}</div>`;
}

function logoutButton(csrfToken: string | undefined) {
  if (!csrfToken) return html``;
  return html`<form method="post" action="/logout" class="inline" data-testid="logout-form">
      <input type="hidden" name="_csrf" value="${csrfToken}" />
      <button
        type="submit"
        class="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
        data-testid="logout-btn"
      >Sign out</button>
    </form>`;
}

export function baseLayout({
  title,
  body,
  active = null,
  bodyClass,
  reviewQueueCount,
  userDisplayName,
  flashMessage,
  csrfToken,
}: BaseLayoutOptions) {
  const userName = userDisplayName ?? 'matt@premiertreesllc.com';
  const csrfMeta = csrfToken
    ? raw(`<meta name="csrf-token" content="${csrfToken.replace(/"/g, '&quot;')}" />`)
    : raw('');
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Premier Tree Specialists</title>
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" href="/public/favicon.svg" type="image/svg+xml" />
  ${csrfMeta}
  <script src="https://unpkg.com/htmx.org@2.0.3" defer></script>
  <script>
    document.addEventListener('htmx:configRequest', function (evt) {
      var meta = document.querySelector('meta[name="csrf-token"]');
      if (meta) {
        evt.detail.headers['X-CSRF-Token'] = meta.getAttribute('content') || '';
      }
    });
  </script>
</head>
<body class="${bodyClass ?? 'bg-slate-50 text-slate-900 antialiased font-sans'}" hx-indicator="#htmx-spinner">
  <header class="bg-white border-b border-slate-200">
    <div class="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
      <a href="/dashboard" class="flex items-center gap-2" aria-label="Premier Tree Specialists dashboard home">
        <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white font-bold" aria-hidden="true">P</span>
        <span class="text-lg font-semibold text-slate-900">Premier Tree Specialists</span>
      </a>
      <nav class="hidden md:flex items-center gap-2 text-sm" aria-label="Primary">
        ${navLink('/dashboard', 'Dashboard', active === 'dashboard')}
        ${navLink('/queue', 'Review Queue', active === 'queue')}
        ${navLink('/stats', 'Stats', active === 'stats')}
      </nav>
      <div class="flex items-center gap-3">
        ${reviewBadge(reviewQueueCount)}
        <span class="hidden md:inline text-sm text-slate-600" data-testid="header-user">${userName}</span>
        ${logoutButton(csrfToken)}
      </div>
    </div>
  </header>
  <div id="flash-region" class="mx-auto max-w-7xl px-4 pt-3">${flashBanner(flashMessage ?? null)}</div>
  <main class="mx-auto max-w-7xl px-4 py-6" id="main-content" tabindex="-1">
    ${body}
  </main>
  <div id="toasts" class="fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite" aria-atomic="true"></div>
  <div id="htmx-spinner" class="htmx-indicator pointer-events-none fixed top-2 right-2 z-50 inline-flex items-center gap-2 rounded-full bg-white/95 border border-slate-200 px-3 py-1 text-xs text-slate-700 shadow">
    <svg class="h-3 w-3 animate-spin text-brand-600" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="14 28" />
    </svg>
    Working…
  </div>
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
    <div class="${palette} border rounded-md px-4 py-3 text-sm" role="status" aria-live="polite" data-testid="flash-message">${text}</div>
  </div>`;
}
