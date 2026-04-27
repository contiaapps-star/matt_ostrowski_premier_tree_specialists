import { describe, expect, it } from 'vitest';
import { categorizeScope } from '../../app/services/scope-categorizer.service.js';

describe('categorizeScope', () => {
  it('matches removal on "remov"', () => {
    expect(categorizeScope('Need tree removal in front yard')).toBe('removal');
  });

  it('matches trimming on "trim"', () => {
    expect(categorizeScope('Trim my big oak tree')).toBe('trimming');
  });

  it('matches pruning on "prun" when no trim keyword present', () => {
    expect(categorizeScope('Pruning a maple branch')).toBe('pruning');
  });

  it('prefers trimming over removal when both keywords appear', () => {
    expect(categorizeScope('Trim and remove a few branches')).toBe('trimming');
  });

  it('matches stump_grinding on "stump"', () => {
    expect(categorizeScope('Three stumps need grinding')).toBe('stump_grinding');
  });

  it('matches emergency on storm/fell-on/fallen/emerg keywords', () => {
    expect(categorizeScope('emergency tree service')).toBe('emergency');
    expect(categorizeScope('large limb fell on roof')).toBe('emergency');
    expect(categorizeScope('storm took down two trees')).toBe('emergency');
    expect(categorizeScope('fallen tree blocking driveway')).toBe('emergency');
  });

  it('matches consultation on "arborist" or "consult"', () => {
    expect(categorizeScope('Need an ISA-certified arborist')).toBe('consultation');
    expect(categorizeScope('Looking for a consultation about my yard')).toBe('consultation');
  });

  it('matches plant_health on "plant health" / "sick" / "disease" / "fungus"', () => {
    expect(categorizeScope('Plant health care for sick maple')).toBe('plant_health');
    expect(categorizeScope('My oak looks diseased')).toBe('plant_health');
    expect(categorizeScope('There is fungus on the bark')).toBe('plant_health');
  });

  it('returns other for unknown text', () => {
    expect(categorizeScope('Quote please')).toBe('other');
    expect(categorizeScope('Hello there')).toBe('other');
  });

  it('returns other for empty / whitespace / null input', () => {
    expect(categorizeScope('')).toBe('other');
    expect(categorizeScope('   ')).toBe('other');
    expect(categorizeScope(null)).toBe('other');
    expect(categorizeScope(undefined)).toBe('other');
  });

  it('emergency wins over removal when both appear', () => {
    expect(categorizeScope('storm damage, need removal')).toBe('emergency');
  });

  it('stump_grinding wins over removal when both appear', () => {
    expect(categorizeScope('Stump removal please')).toBe('stump_grinding');
  });
});
