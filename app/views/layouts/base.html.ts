import { html } from 'hono/html';

export interface BaseLayoutOptions {
  title: string;
  body: ReturnType<typeof html> | string;
  bodyClass?: string;
}

export function baseLayout({ title, body, bodyClass }: BaseLayoutOptions) {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Premier Tree Specialists</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/htmx.org@1.9.12"></script>
  <link rel="icon" href="/public/favicon.ico" type="image/x-icon" />
</head>
<body class="${bodyClass ?? 'bg-slate-50 text-slate-900 antialiased'}">
  <main class="min-h-screen">${body}</main>
</body>
</html>`;
}
