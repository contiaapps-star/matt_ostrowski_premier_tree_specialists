import type { ScopeCategory } from '../db/schema.js';

interface Rule {
  category: ScopeCategory;
  needles: string[];
}

const RULES: Rule[] = [
  { category: 'emergency', needles: ['emerg', 'fell on', 'storm', 'fallen'] },
  { category: 'stump_grinding', needles: ['stump'] },
  { category: 'plant_health', needles: ['plant health', 'sick', 'disease', 'fungus'] },
  { category: 'consultation', needles: ['consult', 'arborist'] },
  { category: 'trimming', needles: ['trim'] },
  { category: 'pruning', needles: ['prun'] },
  { category: 'removal', needles: ['remov'] },
];

export function categorizeScope(scopeRaw: string | null | undefined): ScopeCategory {
  if (typeof scopeRaw !== 'string' || scopeRaw.trim().length === 0) return 'other';
  const text = scopeRaw.toLowerCase();
  for (const rule of RULES) {
    for (const needle of rule.needles) {
      if (text.includes(needle)) return rule.category;
    }
  }
  return 'other';
}
