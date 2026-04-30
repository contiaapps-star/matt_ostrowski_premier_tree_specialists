import { html } from 'hono/html';

export interface LoginPageData {
  csrfToken: string;
  email?: string;
  errorMessage?: string | null;
  rateLimitedUntilSeconds?: number | null;
  devCredentials?: { email: string; password: string } | null;
}

export function loginPage({
  csrfToken,
  email,
  errorMessage,
  rateLimitedUntilSeconds,
  devCredentials,
}: LoginPageData) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in — Premier Tree Specialists</title>
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" href="/public/images/premier-tree-logo.png" type="image/png" />
</head>
<body class="bg-slate-50 text-slate-900 antialiased font-sans min-h-screen flex items-center justify-center px-4">
  <main class="w-full max-w-sm" data-testid="login-page">
    <div class="text-center mb-6">
      <img
        src="/public/images/premier-tree-logo.png"
        alt="Premier Tree Specialists"
        class="mx-auto h-20 w-20 rounded-full ring-1 ring-slate-200 bg-white object-contain"
      />
      <h1 class="mt-3 text-xl font-bold text-brand-700">Premier Tree Specialists</h1>
      <p class="text-sm text-slate-500">Lead intake workspace</p>
    </div>
    ${devCredentials
      ? html`<div
          class="mb-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          data-testid="dev-credentials-box"
        >
          <div class="font-semibold uppercase tracking-wide text-xs text-amber-700 mb-2">
            Dev mode — seed credentials
          </div>
          <div class="space-y-1 font-mono text-sm">
            <div class="flex items-center justify-between gap-2">
              <span class="text-amber-700">email:</span>
              <code
                class="select-all bg-white border border-amber-200 rounded px-2 py-0.5"
                data-testid="dev-credentials-email"
              >${devCredentials.email}</code>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-amber-700">password:</span>
              <code
                class="select-all bg-white border border-amber-200 rounded px-2 py-0.5"
                data-testid="dev-credentials-password"
              >${devCredentials.password}</code>
            </div>
          </div>
          <p class="mt-2 text-xs text-amber-700">
            Visible in development only. Change this user's password before going live.
          </p>
        </div>`
      : ''}
    <div class="pts-card">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Sign in</h2>
      ${errorMessage
        ? html`<div
            class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
            data-testid="login-error"
          >${errorMessage}</div>`
        : ''}
      ${rateLimitedUntilSeconds
        ? html`<div
            class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
            data-testid="login-rate-limited"
          >Too many failed attempts. Please wait approximately ${rateLimitedUntilSeconds} second${rateLimitedUntilSeconds === 1 ? '' : 's'} before trying again.</div>`
        : ''}
      <form method="post" action="/login" class="flex flex-col gap-3" data-testid="login-form" autocomplete="on">
        <input type="hidden" name="_csrf" value="${csrfToken}" />
        <label class="flex flex-col text-xs text-slate-600">
          <span>Email</span>
          <input
            class="pts-input mt-1"
            type="email"
            name="email"
            value="${email ?? ''}"
            required
            autocomplete="username"
            autofocus
            data-testid="login-email"
          />
        </label>
        <label class="flex flex-col text-xs text-slate-600">
          <span>Password</span>
          <input
            class="pts-input mt-1"
            type="password"
            name="password"
            required
            autocomplete="current-password"
            data-testid="login-password"
          />
        </label>
        <button class="pts-btn-primary mt-1" type="submit" data-testid="login-submit">Sign in</button>
      </form>
    </div>
    <p class="mt-4 text-center text-xs text-slate-500">
      ISA-Certified Arborists · Cleveland · Columbus
    </p>
  </main>
</body>
</html>`;
}
