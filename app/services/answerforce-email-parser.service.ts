import { normalizeToE164 } from '../lib/e164.js';

export interface AnswerforceParsedLead {
  name: string | null;
  phone: string | null;
  location: string | null;
  scope_raw: string;
  raw_email_body: string;
}

const ANSWERFORCE_SUBJECT_HINTS = [
  'answerforce',
  'after-hours call',
  'after hours call',
  'call summary',
  'message taken',
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

function looksLikeAnswerforce(subject: string, body: string): boolean {
  const subjectLower = subject.toLowerCase();
  if (ANSWERFORCE_SUBJECT_HINTS.some((hint) => subjectLower.includes(hint))) return true;
  const bodyLower = body.toLowerCase();
  return bodyLower.includes('answerforce') || bodyLower.includes('message taken');
}

function pickField(body: string, label: string): string | null {
  const re = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, 'im');
  const m = re.exec(body);
  if (!m) return null;
  const value = m[1]!.trim();
  return value.length > 0 ? value : null;
}

function extractMessageBlock(body: string): string | null {
  const re = /^\s*Message\s*Taken\s*:\s*\n?([\s\S]*?)(?=\n\s*(?:Call outcome|Outcome|Recording|Transcript|https?:\/\/)|$)/im;
  const m = re.exec(body);
  if (!m) return null;
  const value = m[1]!.trim();
  return value.length > 0 ? value : null;
}

export function parseAnswerforceEmail(raw: string): AnswerforceParsedLead | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  const { subject, body } = splitHeadersAndBody(raw);
  if (!looksLikeAnswerforce(subject, body)) return null;

  const name = pickField(body, 'Customer name') ?? pickField(body, 'Caller');
  const rawPhone = pickField(body, 'From') ?? pickField(body, 'Phone');
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
