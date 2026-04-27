import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../app/config.js';

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  PORT: '5000',
  SESSION_SECRET: 'test-secret-at-least-16-chars',
  INTEGRATION_MODE: 'stub',
  DATABASE_PATH: ':memory:',
};

describe('loadConfig', () => {
  it('parses minimal env successfully and applies defaults', () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.PORT).toBe(5000);
    expect(cfg.INTEGRATION_MODE).toBe('stub');
    expect(cfg.CONFIDENCE_AUTO_SEND_THRESHOLD).toBeCloseTo(0.8);
    expect(cfg.CONFIDENCE_DRAFT_THRESHOLD).toBeCloseTo(0.5);
    expect(cfg.SMS_PROVIDER).toBe('agent_phone');
    expect(cfg.ENABLE_IMESSAGE).toBe(true);
    expect(cfg.OPENROUTER_BASE_URL).toBe('https://openrouter.ai/api/v1');
  });

  it('respects overridden confidence thresholds', () => {
    const cfg = loadConfig({
      ...baseEnv,
      CONFIDENCE_AUTO_SEND_THRESHOLD: '0.9',
      CONFIDENCE_DRAFT_THRESHOLD: '0.4',
    });
    expect(cfg.CONFIDENCE_AUTO_SEND_THRESHOLD).toBeCloseTo(0.9);
    expect(cfg.CONFIDENCE_DRAFT_THRESHOLD).toBeCloseTo(0.4);
  });

  it('coerces ENABLE_IMESSAGE strings to boolean', () => {
    expect(loadConfig({ ...baseEnv, ENABLE_IMESSAGE: 'false' }).ENABLE_IMESSAGE).toBe(false);
    expect(loadConfig({ ...baseEnv, ENABLE_IMESSAGE: '0' }).ENABLE_IMESSAGE).toBe(false);
    expect(loadConfig({ ...baseEnv, ENABLE_IMESSAGE: 'true' }).ENABLE_IMESSAGE).toBe(true);
    expect(loadConfig({ ...baseEnv, ENABLE_IMESSAGE: 'yes' }).ENABLE_IMESSAGE).toBe(true);
  });

  it('throws when SESSION_SECRET is missing in production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SESSION_SECRET: undefined,
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('throws when SESSION_SECRET is too short in production', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        NODE_ENV: 'production',
        SESSION_SECRET: 'short',
      }),
    ).toThrow(/SESSION_SECRET/);
  });

  it('rejects invalid INTEGRATION_MODE', () => {
    expect(() =>
      loadConfig({
        ...baseEnv,
        INTEGRATION_MODE: 'banana',
      }),
    ).toThrow(/INTEGRATION_MODE/);
  });

  it('rejects out-of-range confidence thresholds', () => {
    expect(() =>
      loadConfig({ ...baseEnv, CONFIDENCE_AUTO_SEND_THRESHOLD: '1.5' }),
    ).toThrow(/CONFIDENCE_AUTO_SEND_THRESHOLD/);
  });
});
