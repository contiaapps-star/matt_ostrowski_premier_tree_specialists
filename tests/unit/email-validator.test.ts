import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetEmailValidatorCache,
  validateEmailDeliverable,
} from '../../app/services/email-validator.service.js';

describe('validateEmailDeliverable (regex / blacklist)', () => {
  beforeEach(() => resetEmailValidatorCache());

  it('rejects empty / whitespace / null input', async () => {
    expect(await validateEmailDeliverable('', { skipMxCheck: true })).toEqual({
      valid: false,
      reason: 'empty',
    });
    expect(await validateEmailDeliverable('   ', { skipMxCheck: true })).toEqual({
      valid: false,
      reason: 'empty',
    });
    expect(await validateEmailDeliverable(null, { skipMxCheck: true })).toEqual({
      valid: false,
      reason: 'empty',
    });
  });

  it('rejects malformed inputs', async () => {
    const cases = ['hello', 'foo@', '@bar.com', 'no-tld@host', 'spa ce@host.com'];
    for (const c of cases) {
      const result = await validateEmailDeliverable(c, { skipMxCheck: true });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_format');
    }
  });

  it('rejects blacklisted obviously-fake emails', async () => {
    const cases = ['test@test.com', 'no@email.com', 'a@a.com', 'TEST@TEST.COM'];
    for (const c of cases) {
      const result = await validateEmailDeliverable(c, { skipMxCheck: true });
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('blacklisted');
    }
  });

  it('accepts a normally-formatted address when skipMxCheck=true', async () => {
    const result = await validateEmailDeliverable('person@premiertreesllc.com', {
      skipMxCheck: true,
    });
    expect(result.valid).toBe(true);
  });
});

describe('validateEmailDeliverable (MX lookup)', () => {
  beforeEach(() => resetEmailValidatorCache());
  afterEach(() => resetEmailValidatorCache());

  it('marks valid when MX records are returned', async () => {
    const mxResolver = vi.fn(async (_domain: string) => [
      { exchange: 'mx.example.com', priority: 10 },
    ]);
    const result = await validateEmailDeliverable('user@premiertreesllc.com', {
      mxResolver,
      skipMxCheck: false,
    });
    expect(result.valid).toBe(true);
    expect(mxResolver).toHaveBeenCalledWith('premiertreesllc.com');
  });

  it('marks invalid when MX list is empty', async () => {
    const mxResolver = vi.fn(async (_domain: string) => []);
    const result = await validateEmailDeliverable('user@empty-mx.test', {
      mxResolver,
      skipMxCheck: false,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('no_mx_records');
  });

  it('marks invalid when MX lookup throws', async () => {
    const mxResolver = vi.fn(async (_domain: string) => {
      throw new Error('ENOTFOUND');
    });
    const result = await validateEmailDeliverable('user@nope-domain.test', {
      mxResolver,
      skipMxCheck: false,
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('mx_lookup_failed');
  });

  it('caches positive results for 1 hour and re-resolves after expiration', async () => {
    let calls = 0;
    const mxResolver = vi.fn(async (_domain: string) => {
      calls += 1;
      return [{ exchange: 'mx.example.com', priority: 10 }];
    });
    let nowMs = 1_000_000;
    const now = () => nowMs;

    const r1 = await validateEmailDeliverable('person@cached-domain.test', {
      mxResolver,
      now,
      skipMxCheck: false,
    });
    expect(r1.valid).toBe(true);
    expect(calls).toBe(1);

    nowMs += 30 * 60 * 1_000; // 30 min
    const r2 = await validateEmailDeliverable('person@cached-domain.test', {
      mxResolver,
      now,
      skipMxCheck: false,
    });
    expect(r2.valid).toBe(true);
    expect(calls).toBe(1);

    nowMs += 60 * 60 * 1_000; // 1.5h total > TTL
    const r3 = await validateEmailDeliverable('person@cached-domain.test', {
      mxResolver,
      now,
      skipMxCheck: false,
    });
    expect(r3.valid).toBe(true);
    expect(calls).toBe(2);
  });

  it('honors INTEGRATION_MODE=stub default by skipping MX', async () => {
    const mxResolver = vi.fn(async () => []);
    const result = await validateEmailDeliverable('person@premiertreesllc.com', {
      mxResolver,
      cfg: { INTEGRATION_MODE: 'stub' } as never,
    });
    expect(result.valid).toBe(true);
    expect(mxResolver).not.toHaveBeenCalled();
  });
});
