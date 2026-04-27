import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLsaEmail } from '../../app/services/lsa-email-parser.service.js';

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests', 'fixtures', 'inbound', name), 'utf-8');
}

describe('parseLsaEmail', () => {
  it('parses lsa-oak-trim.txt', () => {
    const parsed = parseLsaEmail(fixture('lsa-oak-trim.txt'));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Diane Owens');
    expect(parsed!.phone).toBe('+12165550001');
    expect(parsed!.location).toBe('Cleveland, OH 44113');
    expect(parsed!.scope_raw).toContain('big oak tree');
    expect(parsed!.scope_raw).toContain('quote');
    expect(parsed!.scope_raw).not.toContain('Reply to this customer');
    expect(parsed!.raw_email_body.length).toBeGreaterThan(0);
  });

  it('parses lsa-removal-large-tree.txt', () => {
    const parsed = parseLsaEmail(fixture('lsa-removal-large-tree.txt'));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Patricia Smith');
    expect(parsed!.phone).toBe('+14405550020');
    expect(parsed!.location).toBe('Solon, OH 44139');
    expect(parsed!.scope_raw).toContain('dead maple');
    expect(parsed!.scope_raw).toContain('60 feet');
  });

  it('parses lsa-no-phone.txt and returns null phone (not parseable)', () => {
    const parsed = parseLsaEmail(fixture('lsa-no-phone.txt'));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Robert Johnson');
    expect(parsed!.phone).toBeNull();
    expect(parsed!.location).toBe('Akron, OH 44301');
    expect(parsed!.scope_raw).toContain('three stumps');
  });

  it('returns null for an email that does not look like LSA', () => {
    const garbage = [
      'From: random@example.com',
      'Subject: Hello there',
      '',
      'Just saying hi.',
    ].join('\n');
    expect(parseLsaEmail(garbage)).toBeNull();
  });

  it('returns null for empty / non-string input', () => {
    expect(parseLsaEmail('')).toBeNull();
    expect(parseLsaEmail('   ')).toBeNull();
    // @ts-expect-error testing runtime safety
    expect(parseLsaEmail(null)).toBeNull();
  });
});
