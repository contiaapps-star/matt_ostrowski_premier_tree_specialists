import { describe, expect, it } from 'vitest';
import { formatForDisplay, normalizeToE164 } from '../../app/lib/e164.js';

describe('normalizeToE164', () => {
  it('handles a US number formatted with parentheses + dash', () => {
    expect(normalizeToE164('(216) 245-8908')).toBe('+12162458908');
  });

  it('handles a US number formatted with dashes', () => {
    expect(normalizeToE164('216-245-8908')).toBe('+12162458908');
  });

  it('handles 10 raw digits', () => {
    expect(normalizeToE164('2162458908')).toBe('+12162458908');
  });

  it('passes through a fully-qualified +1 number', () => {
    expect(normalizeToE164('+12162458908')).toBe('+12162458908');
  });

  it('handles a leading 1 + dashes (1-216-245-8908)', () => {
    expect(normalizeToE164('1-216-245-8908')).toBe('+12162458908');
  });

  it('handles a leading +1 with separators', () => {
    expect(normalizeToE164('+1 (216) 245-8908')).toBe('+12162458908');
  });

  it('strips arbitrary whitespace', () => {
    expect(normalizeToE164('  216 245 8908  ')).toBe('+12162458908');
  });

  it('returns null for short numbers', () => {
    expect(normalizeToE164('555-1212')).toBeNull();
    expect(normalizeToE164('1234')).toBeNull();
  });

  it('returns null for non-phone garbage', () => {
    expect(normalizeToE164('abc')).toBeNull();
    expect(normalizeToE164('not a number')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeToE164('')).toBeNull();
    expect(normalizeToE164('   ')).toBeNull();
  });

  it('returns null for null / undefined / non-string', () => {
    expect(normalizeToE164(null)).toBeNull();
    expect(normalizeToE164(undefined)).toBeNull();
    // @ts-expect-error testing runtime safety
    expect(normalizeToE164(2162458908)).toBeNull();
  });

  it('returns null for too-long inputs that are not US E.164', () => {
    expect(normalizeToE164('+442071234567')).toBeNull();
    expect(normalizeToE164('123456789012345')).toBeNull();
  });
});

describe('formatForDisplay', () => {
  it('formats a +1 E.164 number to (XXX) XXX-XXXX', () => {
    expect(formatForDisplay('+12162458908')).toBe('(216) 245-8908');
  });

  it('returns the input unchanged when not +1 (US)', () => {
    expect(formatForDisplay('+442071234567')).toBe('+442071234567');
  });

  it('returns empty string for null / undefined / non-string', () => {
    expect(formatForDisplay(null)).toBe('');
    expect(formatForDisplay(undefined)).toBe('');
  });

  it('returns the input unchanged for malformed +1 (wrong length)', () => {
    expect(formatForDisplay('+12162458')).toBe('+12162458');
  });
});
