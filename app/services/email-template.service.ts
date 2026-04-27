import type { Lead } from '../db/schema.js';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const COMPANY_NAME = 'Premier Tree Specialists LLC';
const CLEVELAND_PHONE = '216-245-8908';
const COLUMBUS_PHONE = '614-526-2266';
const WEBSITE_URL = 'https://www.premiertreesllc.com';
const LOGO_PATH = '/public/logo-placeholder.png';
const CREDENTIALS_LINE =
  'ISA-Certified Arborists | 80+ years combined experience | Fully insured';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const trimmed = fullName.trim();
  if (trimmed.length === 0) return null;
  const piece = trimmed.split(/\s+/)[0];
  return piece && piece.length > 0 ? piece : null;
}

function paragraphsFromText(value: string): string[] {
  return value
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function renderLeadResponseEmail(lead: Lead, responseText: string): RenderedEmail {
  const subject = 'Re: Your inquiry — Premier Tree Specialists';
  const greetingName = firstName(lead.customerName);
  const greeting = greetingName ? `Hi ${greetingName},` : 'Hello,';

  const paragraphs = paragraphsFromText(responseText);
  const safeParagraphs = paragraphs.length > 0 ? paragraphs : [responseText.trim()];

  const htmlParagraphs = safeParagraphs
    .map((p) => `<p style="margin: 0 0 12px 0; line-height: 1.5;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color: #1f2937; background:#f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; padding: 24px; background:#ffffff;">
      <div style="text-align:left; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0;">
        <img src="${escapeHtml(LOGO_PATH)}" alt="Premier Tree Specialists" style="max-height: 48px;" />
        <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569;">${escapeHtml(COMPANY_NAME)}</p>
      </div>
      <div style="padding: 16px 0; font-size: 14px;">
        <p style="margin: 0 0 12px 0;">${escapeHtml(greeting)}</p>
        ${htmlParagraphs}
      </div>
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 12px; color: #475569;">
        <p style="margin: 0 0 4px 0;"><strong>${escapeHtml(COMPANY_NAME)}</strong></p>
        <p style="margin: 0 0 4px 0;">Cleveland: <a href="tel:${CLEVELAND_PHONE.replace(/-/g, '')}" style="color:#15803d;">${escapeHtml(CLEVELAND_PHONE)}</a> &nbsp;|&nbsp; Columbus: <a href="tel:${COLUMBUS_PHONE.replace(/-/g, '')}" style="color:#15803d;">${escapeHtml(COLUMBUS_PHONE)}</a></p>
        <p style="margin: 0 0 4px 0;">${escapeHtml(CREDENTIALS_LINE)}</p>
        <p style="margin: 0;"><a href="${escapeHtml(WEBSITE_URL)}" style="color:#15803d;">${escapeHtml(WEBSITE_URL)}</a></p>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    greeting,
    '',
    safeParagraphs.join('\n\n'),
    '',
    '—',
    COMPANY_NAME,
    `Cleveland: ${CLEVELAND_PHONE} | Columbus: ${COLUMBUS_PHONE}`,
    CREDENTIALS_LINE,
    WEBSITE_URL,
  ].join('\n');

  return { subject, html, text };
}

export const __testing = {
  COMPANY_NAME,
  CLEVELAND_PHONE,
  COLUMBUS_PHONE,
  WEBSITE_URL,
  LOGO_PATH,
  CREDENTIALS_LINE,
  firstName,
};
