import { describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../../app/lib/uuid.js';

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateUuidV7', () => {
  it('produces a 36-char UUID with hyphens in the right positions', () => {
    const id = generateUuidV7();
    expect(id).toHaveLength(36);
    expect(id[8]).toBe('-');
    expect(id[13]).toBe('-');
    expect(id[18]).toBe('-');
    expect(id[23]).toBe('-');
  });

  it('matches the v7 format (version=7, variant=10xx)', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(generateUuidV7()).toMatch(UUID_V7_REGEX);
    }
  });

  it('1000 ids generated in time order are lexicographically sortable by time', () => {
    const ids: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      ids.push(generateUuidV7());
      // small busy-loop spin so timestamps advance even on fast machines
      const start = Date.now();
      while (Date.now() === start && i % 50 === 0) {
        // brief spin to bump ms
      }
    }

    const sorted = [...ids].sort();

    // Compare timestamp prefix (first 12 hex chars, the 48-bit ms field) instead
    // of the full string — the 12 random bits inside the same ms can re-order
    // ids that share a millisecond, but the timestamp prefix MUST be monotonic.
    const tsPrefix = (s: string) => s.replace(/-/g, '').slice(0, 12);
    const originalPrefixes = ids.map(tsPrefix);
    const sortedPrefixes = sorted.map(tsPrefix);

    for (let i = 1; i < originalPrefixes.length; i += 1) {
      expect(originalPrefixes[i]! >= originalPrefixes[i - 1]!).toBe(true);
    }
    expect(sortedPrefixes).toEqual(originalPrefixes);
  });

  it('generates unique ids across many calls', () => {
    const set = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      set.add(generateUuidV7());
    }
    expect(set.size).toBe(5000);
  });
});
