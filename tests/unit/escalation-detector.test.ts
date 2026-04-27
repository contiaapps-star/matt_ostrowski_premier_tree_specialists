import { describe, expect, it } from 'vitest';
import { detectEscalation } from '../../app/services/escalation-detector.service.js';

describe('detectEscalation', () => {
  it('matches "tree on roof" via flex regex on "tree fell on my roof"', () => {
    const r = detectEscalation('A tree fell on my roof during the storm.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('tree on roof');
    expect(r.reason).toContain('tree on roof');
  });

  it('matches "tree on house" with words in between', () => {
    const r = detectEscalation('Last night a tree fell on the house and damaged the chimney.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('tree on house');
  });

  it('matches "lawsuit" on "I am filing a lawsuit"', () => {
    const r = detectEscalation("I'm filing a lawsuit against the previous arborist.");
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('lawsuit');
  });

  it('matches case-insensitively on EMERGENCY EMERGENCY', () => {
    const r = detectEscalation('EMERGENCY EMERGENCY please help');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('emergency');
  });

  it('does NOT trigger on a benign trim message', () => {
    const r = detectEscalation('I had a tree trimmed last year and would like another quote.');
    expect(r.triggered).toBe(false);
    expect(r.matchedKeywords).toEqual([]);
  });

  it('matches urgent + timeframe combo "urgent within 2 hours"', () => {
    const r = detectEscalation('This is urgent, within 2 hours please come.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('urgent + timeframe');
  });

  it('matches urgent + today combo', () => {
    const r = detectEscalation('Need help today, this is urgent.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('urgent + timeframe');
  });

  it('does NOT trigger on bare "urgent" with no timeframe', () => {
    const r = detectEscalation('Please respond urgent regards Jane.');
    expect(r.triggered).toBe(false);
    expect(r.matchedKeywords).toEqual([]);
  });

  it('matches "legal action"', () => {
    const r = detectEscalation('Will be considering legal action if not addressed.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('legal action');
  });

  it('matches "bad experience"', () => {
    const r = detectEscalation('Had a bad experience last visit, want a refund.');
    expect(r.triggered).toBe(true);
    expect(r.matchedKeywords).toContain('bad experience');
    expect(r.matchedKeywords).toContain('refund');
  });

  it('returns empty for null/undefined/empty', () => {
    expect(detectEscalation(null).triggered).toBe(false);
    expect(detectEscalation(undefined).triggered).toBe(false);
    expect(detectEscalation('').triggered).toBe(false);
  });

  it('does NOT match "tree on roof" when too many words separate them', () => {
    const r = detectEscalation('I have a tree near the back fence and would like an estimate on the price for the small roof of my shed.');
    expect(r.matchedKeywords).not.toContain('tree on roof');
  });

  it('emits a human-readable reason listing all matched keywords', () => {
    const r = detectEscalation('Emergency: tree on roof, please send your attorney references.');
    expect(r.triggered).toBe(true);
    expect(r.reason).toContain('emergency');
    expect(r.reason).toContain('tree on roof');
    expect(r.reason).toContain('attorney');
  });
});
