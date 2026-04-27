/**
 * Pure escalation-keyword detector. Runs against scope_raw text to flag leads
 * that must always be human-reviewed regardless of LLM confidence (per
 * CLAUDE.md "Escalation Keywords").
 */

export interface EscalationResult {
  triggered: boolean;
  reason?: string;
  matchedKeywords: string[];
}

interface EscalationKeyword {
  display: string;
  pattern: RegExp;
}

const SINGLE_WORD_KEYWORDS = [
  'emergency',
  'lawsuit',
  'attorney',
  'lawyer',
  'complaint',
  'refund',
  'unhappy',
  'dissatisfied',
];

function flexPhrase(words: string[], maxBetween = 4): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = escaped.map((w) => `\\b${w}\\b`);
  const between = `(?:\\W+\\w+){0,${maxBetween}}\\W+`;
  return new RegExp(parts.join(between), 'i');
}

const PHRASE_KEYWORDS: EscalationKeyword[] = [
  { display: 'tree on house', pattern: flexPhrase(['tree', 'on', 'house'], 4) },
  { display: 'tree on car', pattern: flexPhrase(['tree', 'on', 'car'], 4) },
  { display: 'tree on roof', pattern: flexPhrase(['tree', 'on', 'roof'], 4) },
  { display: 'legal action', pattern: flexPhrase(['legal', 'action'], 1) },
  { display: 'bad experience', pattern: flexPhrase(['bad', 'experience'], 2) },
];

const KEYWORDS: EscalationKeyword[] = [
  ...SINGLE_WORD_KEYWORDS.map((word) => ({
    display: word,
    pattern: new RegExp(`\\b${word}\\b`, 'i'),
  })),
  ...PHRASE_KEYWORDS,
];

function detectUrgentTimeframe(text: string): boolean {
  if (!/\burgent\b/i.test(text)) return false;
  if (/\btoday\b/i.test(text)) return true;
  if (/\bwithin\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/i.test(text)) return true;
  if (/\bin\s+\d+\s*(?:hours?|hrs?|minutes?|mins?)\b/i.test(text)) return true;
  if (/\bnext\s+(?:few|couple\s+of?)\s+hours?\b/i.test(text)) return true;
  return false;
}

export function detectEscalation(scopeRaw: string | null | undefined): EscalationResult {
  if (typeof scopeRaw !== 'string' || scopeRaw.length === 0) {
    return { triggered: false, matchedKeywords: [] };
  }

  const matched: string[] = [];
  for (const kw of KEYWORDS) {
    if (kw.pattern.test(scopeRaw)) matched.push(kw.display);
  }
  if (detectUrgentTimeframe(scopeRaw)) {
    matched.push('urgent + timeframe');
  }

  if (matched.length === 0) {
    return { triggered: false, matchedKeywords: [] };
  }
  return {
    triggered: true,
    reason: `matched escalation keywords: ${matched.join(', ')}`,
    matchedKeywords: matched,
  };
}
