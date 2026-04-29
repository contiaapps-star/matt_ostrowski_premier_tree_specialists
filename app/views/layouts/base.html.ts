import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';

export type ViewBody = HtmlEscapedString | Promise<HtmlEscapedString> | string;

export interface BaseLayoutOptions {
  title: string;
  body: ViewBody;
  active?: 'workspace' | 'dashboard' | 'queue' | 'stats' | null;
  bodyClass?: string;
  reviewQueueCount?: number;
  userDisplayName?: string | null;
  flashMessage?: { kind: 'success' | 'error' | 'info'; text: string } | null;
  csrfToken?: string;
  showTourButton?: boolean;
  showSimulateButton?: boolean;
}

function reviewBadgeInner(count: number | undefined) {
  if (!count || count <= 0) return html``;
  return html`<a
      href="/?triage=needs_review"
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
  bodyClass,
  reviewQueueCount,
  userDisplayName,
  flashMessage,
  csrfToken,
  showTourButton = true,
  showSimulateButton = true,
}: BaseLayoutOptions) {
  const userName = userDisplayName ?? 'matt@premiertreesllc.com';
  const csrfMeta = csrfToken
    ? raw(`<meta name="csrf-token" content="${csrfToken.replace(/"/g, '&quot;')}" />`)
    : raw('');
  const tourBtn = showTourButton
    ? html`<button
        type="button"
        id="start-tour-btn"
        class="hidden md:inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        data-testid="start-tour-btn"
        data-tour="start-tour"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a8 8 0 100 16 8 8 0 000-16zm.5 4a.75.75 0 00-1.5 0v3.25H6.5a.75.75 0 000 1.5h2.5V14a.75.75 0 001.5 0v-3.25H13a.75.75 0 000-1.5h-2.5V6z"/></svg>
        Take a tour
      </button>`
    : html``;
  const simulateBtn = showSimulateButton && csrfToken
    ? html`<button
        type="button"
        id="simulate-lead-btn"
        class="inline-flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        hx-post="/api/simulate-lead"
        hx-headers='{"X-CSRF-Token":"${csrfToken.replace(/"/g, '&quot;')}"}'
        hx-target="#leads-list-region"
        hx-swap="afterbegin"
        data-testid="simulate-lead-btn"
        data-tour="simulate"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.78 1.625l-7 9A1 1 0 018 17v-5H4a1 1 0 01-.78-1.625l7-9a1 1 0 011.08-.33z"/></svg>
        Simulate Lead
      </button>`
    : html``;
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Premier Tree Specialists</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css" />
  <link rel="icon" href="/public/favicon.svg" type="image/svg+xml" />
  ${csrfMeta}
  <script src="https://unpkg.com/htmx.org@2.0.3" defer></script>
  <script src="https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js" defer></script>
  <script src="/public/tour.js" defer></script>
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
  <header class="bg-white border-b border-slate-200 sticky top-0 z-30">
    <div class="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
      <a href="/" class="flex items-center gap-2.5" aria-label="Premier Tree Specialists workspace home">
        <img src="/public/logo.svg" alt="" aria-hidden="true" class="h-9 w-9" />
        <span class="flex flex-col leading-tight">
          <span class="text-sm font-bold text-brand-700 tracking-tight">Premier Tree Specialists</span>
          <span class="text-[10px] font-medium uppercase tracking-wider text-slate-500">Lead Intake Workspace</span>
        </span>
      </a>
      <div class="flex items-center gap-2">
        <!-- <span class="hidden lg:inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
          <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10 2a6 6 0 016 6c0 4.5-6 10-6 10S4 12.5 4 8a6 6 0 016-6zm0 8a2 2 0 100-4 2 2 0 000 4z"/></svg>
          Cleveland · Columbus
        </span> -->
        ${reviewBadge(reviewQueueCount)}
        ${tourBtn}
        ${simulateBtn}
        <a
          href="/settings"
          class="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          data-testid="header-settings-link"
          title="Settings"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1 1 0 01-1.51.62c-1.37-.84-2.94.73-2.1 2.1a1 1 0 01-.62 1.51c-1.56.38-1.56 2.6 0 2.98a1 1 0 01.62 1.51c-.84 1.37.73 2.94 2.1 2.1a1 1 0 011.51.62c.38 1.56 2.6 1.56 2.98 0a1 1 0 011.51-.62c1.37.84 2.94-.73 2.1-2.1a1 1 0 01.62-1.51c1.56-.38 1.56-2.6 0-2.98a1 1 0 01-.62-1.51c.84-1.37-.73-2.94-2.1-2.1a1 1 0 01-1.51-.62zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/></svg>
          <span class="hidden sm:inline">Settings</span>
        </a>
        <span class="hidden md:inline text-xs text-slate-500" data-testid="header-user">${userName}</span>
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
