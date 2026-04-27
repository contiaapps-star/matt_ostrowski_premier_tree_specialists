import { normalizeToE164 } from '../lib/e164.js';

export interface LsaParsedLead {
  name: string | null;
  phone: string | null;
  location: string | null;
  scope_raw: string;
  raw_email_body: string;
}

const LSA_SUBJECT_HINTS = [
  'google local service',
  'local services ads',
  'new lead',
  'new message',
  'new customer',
];

interface ExtractedHeaders {
  subject: string;
  body: string;
}

function splitHeadersAndBody(raw: string): ExtractedHeaders {
  const normalized = raw.replace(/\r\n/g, '\n');
  const headerEnd = normalized.indexOf('\n\n');
  if (headerEnd === -1) {
    return { subject: '', body: normalized };
  }
  const headerBlock = normalized.slice(0, headerEnd);
  const body = normalized.slice(headerEnd + 2);

  const subjectMatch = /^Subject:\s*(.+)$/im.exec(headerBlock);
  const subject = subjectMatch ? subjectMatch[1]!.trim() : '';
  return { subject, body };
}

function looksLikeLsa(subject: string, body: string): boolean {
  const subjectLower = subject.toLowerCase();
  if (LSA_SUBJECT_HINTS.some((hint) => subjectLower.includes(hint))) return true;
  const bodyLower = body.toLowerCase();
  return (
    bodyLower.includes('local services ads') ||
    bodyLower.includes('google local service') ||
    bodyLower.includes('new customer message')
  );
}

function pickField(body: string, label: string): string | null {
  const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im');
  const m = re.exec(body);
  if (!m) return null;
  const value = m[1]!.trim();
  if (value.length === 0) return null;
  return value;
}

function extractMessageBlock(body: string): string | null {
  const re = /^\s*Message\s*:\s*\n?([\s\S]*?)(?=\n\s*(?:Reply|Respond|View|https?:\/\/)|$)/im;
  const m = re.exec(body);
  if (!m) return null;
  const value = m[1]!.trim();
  return value.length > 0 ? value : null;
}

export function parseLsaEmail(raw: string): LsaParsedLead | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const { subject, body } = splitHeadersAndBody(raw);
  if (!looksLikeLsa(subject, body)) return null;

  const customerLine = pickField(body, 'Customer');
  const fromHeading = /^You have a new message from\s+(.+)$/im.exec(body);
  const name = customerLine ?? (fromHeading ? fromHeading[1]!.trim() : null);

  const rawPhone = pickField(body, 'Phone');
  const phone = rawPhone ? normalizeToE164(rawPhone) : null;

  const location = pickField(body, 'Location');

  const message = extractMessageBlock(body);
  if (!message) return null;

  return {
    name,
    phone,
    location,
    scope_raw: message,
    raw_email_body: body.trim(),
  };
}
