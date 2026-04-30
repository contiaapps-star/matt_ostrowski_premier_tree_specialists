import { html } from 'hono/html';

interface ErrorPageOptions {
  code: 404 | 403 | 500;
  title: string;
  message: string;
  detail?: string;
}

export function renderErrorPage({ code, title, message, detail }: ErrorPageOptions) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${code} ${title} — Premier Tree Specialists</title>
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" href="/public/images/premier-tree-logo.png" type="image/png" />
</head>
<body class="bg-slate-50 text-slate-900 antialiased font-sans min-h-screen flex items-center justify-center px-4">
  <main class="max-w-md w-full text-center" data-testid="error-page" data-error-code="${code}">
    <span class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white text-xl font-bold mb-4" aria-hidden="true">P</span>
    <h1 class="text-2xl font-semibold text-slate-900">${code} — ${title}</h1>
    <p class="mt-2 text-sm text-slate-600">${message}</p>
    ${detail
      ? html`<p class="mt-2 text-xs text-slate-500" data-testid="error-detail">${detail}</p>`
      : ''}
    <div class="mt-6">
      <a href="/dashboard" class="pts-btn-primary">← Back to dashboard</a>
    </div>
  </main>
</body>
</html>`;
}

export function notFoundPage(detail?: string) {
  return renderErrorPage({
    code: 404,
    title: 'Not found',
    message: 'The page you were looking for does not exist or was moved.',
    detail,
  });
}

export function forbiddenPage(detail?: string) {
  return renderErrorPage({
    code: 403,
    title: 'Forbidden',
    message: 'Your session does not allow this action. Please sign in again.',
    detail,
  });
}

export function serverErrorPage(detail?: string) {
  return renderErrorPage({
    code: 500,
    title: 'Something went wrong',
    message: 'The server hit an unexpected error. The team has been notified.',
    detail,
  });
}
