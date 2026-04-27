import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnswerforceEmail } from '../../app/services/answerforce-email-parser.service.js';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

describe('parseAnswerforceEmail', () => {
  it('parses answerforce-emergency.txt', () => {
    const parsed = parseAnswerforceEmail(fixture('answerforce-emergency.txt'));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Marilyn Hornig');
    expect(parsed!.phone).toBe('+14405550003');
    expect(parsed!.location).toBe('Rocky River, OH 44116');
    expect(parsed!.scope_raw).toContain('emergency tree removal');
    expect(parsed!.scope_raw).toContain('oak limb');
    expect(parsed!.scope_raw).not.toContain('Call outcome');
    expect(parsed!.raw_email_body.length).toBeGreaterThan(0);
  });

  it('parses answerforce-cleveland.txt', () => {
    const parsed = parseAnswerforceEmail(fixture('answerforce-cleveland.txt'));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('John Stepanek');
    expect(parsed!.phone).toBe('+12165550030');
    expect(parsed!.location).toBe('Cleveland, OH 44114');
    expect(parsed!.scope_raw).toContain('tree pruning');
  });

  it('returns null for an email that is not from AnswerForce', () => {
    const garbage = [
      'From: someone@example.com',
      'Subject: Hello',
      '',
      'Hi there.',
    ].join('\n');
    expect(parseAnswerforceEmail(garbage)).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseAnswerforceEmail('')).toBeNull();
    // @ts-expect-error testing runtime safety
    expect(parseAnswerforceEmail(null)).toBeNull();
  });
});
