import { describe, expect, it } from 'vitest';
import {
  formatDateET,
  formatPhone,
  formatScopeCategory,
  formatSource,
  formatTimeAgo,
  truncate,
} from '../../app/lib/format.js';

describe('formatPhone', () => {
  it('formats E.164 US numbers as (XXX) XXX-XXXX', () => {
    expect(formatPhone('+12162458908')).toBe('(216) 245-8908');
  });
  it('returns empty string for null/undefined', () => {
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
  });
  it('returns the original string when it cannot be formatted', () => {
    expect(formatPhone('+44123')).toBe('+44123');
  });
});

describe('formatDateET', () => {
  it('formats an ISO timestamp in America/New_York and appends ET', () => {
    const out = formatDateET('2026-04-26T12:00:00Z');
    expect(out).toMatch(/Apr 26, 2026/);
    expect(out).toMatch(/ET$/);
    expect(out).toMatch(/08:00/); // EDT offset
  });
  it('returns empty string for null/undefined/invalid', () => {
    expect(formatDateET(null)).toBe('');
    expect(formatDateET(undefined)).toBe('');
    expect(formatDateET('not-a-date')).toBe('');
  });
});

describe('formatTimeAgo', () => {
  const now = new Date('2026-04-26T12:00:00Z');
  it('returns "just now" for very recent times', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 5_000), now)).toBe('just now');
  });
  it('returns minutes ago for sub-hour spans', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 3 * 60_000), now)).toBe('3 minutes ago');
    expect(formatTimeAgo(new Date(now.getTime() - 60_000), now)).toBe('1 minute ago');
  });
  it('returns hours ago for sub-day spans', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 5 * 3_600_000), now)).toBe('5 hours ago');
  });
  it('returns days ago for sub-month spans', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 3 * 86_400_000), now)).toBe('3 days ago');
  });
  it('returns months ago for sub-year spans', () => {
    expect(formatTimeAgo(new Date(now.getTime() - 90 * 86_400_000), now)).toBe('3 months ago');
  });
  it('returns empty string for null/undefined', () => {
    expect(formatTimeAgo(null, now)).toBe('');
    expect(formatTimeAgo(undefined, now)).toBe('');
  });
});

describe('truncate', () => {
  it('returns the original string when shorter than n', () => {
    expect(truncate('short', 20)).toBe('short');
  });
  it('truncates with an ellipsis when over n', () => {
    expect(truncate('this is a long string of text', 10)).toBe('this is a…');
    expect(truncate('this is a long string', 10).length).toBeLessThanOrEqual(10);
  });
  it('handles null/undefined gracefully', () => {
    expect(truncate(null, 5)).toBe('');
    expect(truncate(undefined, 5)).toBe('');
  });
  it('returns empty string when n <= 0', () => {
    expect(truncate('hello', 0)).toBe('');
  });
});

describe('formatSource', () => {
  it('maps known source codes to display labels', () => {
    expect(formatSource('google_lsa_email')).toBe('Google LSA');
    expect(formatSource('website_form')).toBe('Website Form');
    expect(formatSource('answerforce_email')).toBe('AnswerForce');
  });
  it('returns the original string for unknown codes', () => {
    expect(formatSource('hacker_news')).toBe('hacker_news');
  });
  it('returns empty string for null/undefined', () => {
    expect(formatSource(null)).toBe('');
    expect(formatSource(undefined)).toBe('');
  });
});

describe('formatScopeCategory', () => {
  it('maps known scope codes', () => {
    expect(formatScopeCategory('trimming')).toBe('Trimming');
    expect(formatScopeCategory('stump_grinding')).toBe('Stump grinding');
  });
  it('returns em dash for null', () => {
    expect(formatScopeCategory(null)).toBe('—');
    expect(formatScopeCategory(undefined)).toBe('—');
  });
});
