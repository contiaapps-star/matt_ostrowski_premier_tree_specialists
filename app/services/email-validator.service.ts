import { resolveMx } from 'node:dns/promises';
import { config as appConfig, type Config } from '../config.js';
import { logger } from '../lib/logger.js';

export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const BLACKLIST = new Set<string>([
  'test@test.com',
  'no@email.com',
  'a@a.com',
  'noemail@noemail.com',
  'none@none.com',
  'test@example.com',
]);

interface CacheEntry {
  result: EmailValidationResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1_000;

interface ValidatorDeps {
  mxResolver?: (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;
  now?: () => number;
  /**
   * When true, skip the live DNS MX lookup. In stub INTEGRATION_MODE we don't
   * want test runs to depend on the network. Regex + blacklist still apply.
   */
  skipMxCheck?: boolean;
  cfg?: Config;
}

const cache = new Map<string, CacheEntry>();

export function resetEmailValidatorCache(): void {
  cache.clear();
}

export async function validateEmailDeliverable(
  email: string | null | undefined,
  deps: ValidatorDeps = {},
): Promise<EmailValidationResult> {
  const cfg = deps.cfg ?? appConfig;
  const skipMxCheck = deps.skipMxCheck ?? cfg.INTEGRATION_MODE === 'stub';
  const mxResolver = deps.mxResolver ?? resolveMx;
  const now = deps.now ?? (() => Date.now());

  if (typeof email !== 'string' || email.trim().length === 0) {
    return { valid: false, reason: 'empty' };
  }
  const normalized = email.trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalized)) {
    return { valid: false, reason: 'invalid_format' };
  }
  if (BLACKLIST.has(normalized)) {
    return { valid: false, reason: 'blacklisted' };
  }

  if (skipMxCheck) {
    return { valid: true };
  }

  const cached = cache.get(normalized);
  if (cached && cached.expiresAt > now()) {
    return cached.result;
  }

  const atIndex = normalized.lastIndexOf('@');
  const domain = normalized.slice(atIndex + 1);
  if (domain.length === 0) {
    const result = { valid: false, reason: 'no_domain' as const };
    cache.set(normalized, { result, expiresAt: now() + CACHE_TTL_MS });
    return result;
  }

  let result: EmailValidationResult;
  try {
    const records = await mxResolver(domain);
    if (Array.isArray(records) && records.length > 0) {
      result = { valid: true };
    } else {
      result = { valid: false, reason: 'no_mx_records' };
    }
  } catch (err) {
    logger.warn({ err, domain }, 'mx lookup failed');
    result = { valid: false, reason: 'mx_lookup_failed' };
  }

  cache.set(normalized, { result, expiresAt: now() + CACHE_TTL_MS });
  return result;
}

export const __testing = { EMAIL_REGEX, BLACKLIST, cache };
