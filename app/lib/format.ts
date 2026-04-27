import { formatForDisplay } from './e164.js';

export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return formatForDisplay(phone);
}

const ET_DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateET(input: string | Date | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else {
    date = new Date(input);
  }
  if (Number.isNaN(date.getTime())) return '';
  return ET_DATE_FORMAT.format(date) + ' ET';
}

export function formatTimeAgo(
  input: string | Date | number | null | undefined,
  now: Date = new Date(),
): string {
  if (input === null || input === undefined) return '';
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === 'number') {
    date = new Date(input);
  } else {
    date = new Date(input);
  }
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) {
    return formatTimeAgo(now, date)
      .replace(' ago', ' from now')
      .replace('just now', 'in a moment');
  }

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? 'month' : 'months'} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? 'year' : 'years'} ago`;
}

export function truncate(str: string | null | undefined, n: number): string {
  if (!str) return '';
  if (n <= 0) return '';
  if (str.length <= n) return str;
  if (n <= 1) return str.slice(0, n);
  return str.slice(0, Math.max(0, n - 1)) + '…';
}

const SOURCE_LABELS: Record<string, string> = {
  google_lsa_email: 'Google LSA',
  website_form: 'Website Form',
  answerforce_email: 'AnswerForce',
};

export function formatSource(source: string | null | undefined): string {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? source;
}

const SCOPE_LABELS: Record<string, string> = {
  trimming: 'Trimming',
  pruning: 'Pruning',
  removal: 'Removal',
  stump_grinding: 'Stump grinding',
  emergency: 'Emergency',
  consultation: 'Consultation',
  plant_health: 'Plant health',
  other: 'Other',
};

export function formatScopeCategory(scope: string | null | undefined): string {
  if (!scope) return '—';
  return SCOPE_LABELS[scope] ?? scope;
}
