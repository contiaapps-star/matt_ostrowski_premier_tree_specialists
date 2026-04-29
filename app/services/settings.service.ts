import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { config as appConfig } from '../config.js';
import { getDb } from '../db/client.js';
import * as schema from '../db/schema.js';
import { appSettings } from '../db/schema.js';
import { logger } from '../lib/logger.js';

type DrizzleDb = BetterSQLite3Database<typeof schema>;

export interface OakSeasonRule {
  enabled: boolean;
  startMonth: number;
  endMonth: number;
  message: string;
}

export interface ServiceAreaRule {
  zipPrefixes: string[];
  description: string;
}

export interface BusinessRules {
  oakSeason: OakSeasonRule;
  escalationKeywords: string[];
  serviceArea: ServiceAreaRule;
}

export interface AiSettings {
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  extractionPrompt: string;
}

export interface AppSettings {
  businessRules: BusinessRules;
  ai: AiSettings;
}

const KEY_BUSINESS_RULES = 'business_rules';
const KEY_AI = 'ai';

const DEFAULT_OAK_MESSAGE =
  'Important: oak trimming season in Ohio is closed April–October to prevent oak wilt disease. We schedule oak trimming November–March only.';

const DEFAULT_ESCALATION_KEYWORDS: string[] = [
  'emergency',
  'tree on house',
  'tree on car',
  'tree on roof',
  'lawsuit',
  'attorney',
  'lawyer',
  'legal action',
  'complaint',
  'refund',
  'unhappy',
  'dissatisfied',
  'bad experience',
  'fallen',
  'collapse',
  'on my roof',
  'hit the roof',
  'through the roof',
];

const DEFAULT_SERVICE_AREA_PREFIXES = [
  '440',
  '441',
  '442',
  '443',
  '444',
  '445',
  '446',
  '447',
  '448',
  '449',
  '430',
  '431',
  '432',
  '433',
  '434',
  '435',
  '436',
  '437',
  '438',
  '439',
];

const DEFAULT_SERVICE_AREA_DESCRIPTION =
  'Northeast Ohio (Cuyahoga, Geauga, Lake, Lorain, Medina, Portage, Summit) and Central Ohio (Delaware, Fairfield, Franklin, Licking, Madison, Pickaway, Union).';

const DEFAULT_SYSTEM_PROMPT =
  'You are a warm, knowledgeable customer service representative for Premier Tree Specialists — an Ohio tree care company with ISA-certified arborists and 80+ years of combined experience.\n\nRULES:\n1. NEVER quote specific prices — always offer a free on-site estimate\n2. Oak trees cannot be trimmed April–October due to oak wilt disease risk — always mention this if oak trimming is requested\n3. Always address the customer by their first name\n4. Reference the correct office phone number based on their location\n5. Keep responses to 3–5 sentences — warm and professional, never salesy\n6. Do NOT use phrases like "Certainly!", "Absolutely!", "Great question!"\n7. Do NOT make promises you cannot keep\n8. Sign off every message with the company signature\n\nVariables available: {faq_context}, {office_phone}, {office_name}.';

const DEFAULT_EXTRACTION_PROMPT =
  'Extract the following fields from this customer message: name, phone, email, address, city, zip, service type (Tree Trimming / Tree Removal / Stump Grinding / Plant Health Care / Arborist Consultation / Emergency Service), urgency (standard / urgent), and a 1-sentence scope of work. Return as JSON.';

export const DEFAULT_BUSINESS_RULES: BusinessRules = {
  oakSeason: {
    enabled: true,
    startMonth: 4,
    endMonth: 10,
    message: DEFAULT_OAK_MESSAGE,
  },
  escalationKeywords: DEFAULT_ESCALATION_KEYWORDS,
  serviceArea: {
    zipPrefixes: DEFAULT_SERVICE_AREA_PREFIXES,
    description: DEFAULT_SERVICE_AREA_DESCRIPTION,
  },
};

export function defaultAiSettings(): AiSettings {
  return {
    model: appConfig.OPENROUTER_MODEL,
    maxTokens: 400,
    temperature: 0.4,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    extractionPrompt: DEFAULT_EXTRACTION_PROMPT,
  };
}

function readRow(db: DrizzleDb, key: string): unknown | null {
  try {
    const rows = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
    if (rows.length === 0) return null;
    return JSON.parse(rows[0]!.value) as unknown;
  } catch (err) {
    logger.warn({ err, key }, 'app_settings read failed; using defaults');
    return null;
  }
}

function writeRow(db: DrizzleDb, key: string, value: unknown): void {
  const json = JSON.stringify(value);
  const now = new Date();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).all();
  if (existing.length === 0) {
    db.insert(appSettings).values({ key, value: json, updatedAt: now }).run();
  } else {
    db.update(appSettings).set({ value: json, updatedAt: now }).where(eq(appSettings.key, key)).run();
  }
}

function clampMonth(n: unknown, fallback: number): number {
  const parsed = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  const i = Math.round(parsed);
  if (i < 1) return 1;
  if (i > 12) return 12;
  return i;
}

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  const i = Math.round(parsed);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function clampFloat(n: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function asString(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  return fallback;
}

function asStringArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim().length > 0) out.push(item.trim());
  }
  return out.length > 0 ? out : fallback;
}

function normalizeBusinessRules(raw: unknown): BusinessRules {
  const r = (raw ?? {}) as Record<string, unknown>;
  const oakRaw = (r.oakSeason ?? {}) as Record<string, unknown>;
  const saRaw = (r.serviceArea ?? {}) as Record<string, unknown>;

  return {
    oakSeason: {
      enabled: typeof oakRaw.enabled === 'boolean' ? oakRaw.enabled : DEFAULT_BUSINESS_RULES.oakSeason.enabled,
      startMonth: clampMonth(oakRaw.startMonth, DEFAULT_BUSINESS_RULES.oakSeason.startMonth),
      endMonth: clampMonth(oakRaw.endMonth, DEFAULT_BUSINESS_RULES.oakSeason.endMonth),
      message: asString(oakRaw.message, DEFAULT_BUSINESS_RULES.oakSeason.message),
    },
    escalationKeywords: asStringArray(r.escalationKeywords, DEFAULT_BUSINESS_RULES.escalationKeywords),
    serviceArea: {
      zipPrefixes: asStringArray(saRaw.zipPrefixes, DEFAULT_BUSINESS_RULES.serviceArea.zipPrefixes)
        .map((p) => p.replace(/\D/g, '').slice(0, 3))
        .filter((p) => p.length === 3),
      description: asString(saRaw.description, DEFAULT_BUSINESS_RULES.serviceArea.description),
    },
  };
}

function normalizeAi(raw: unknown): AiSettings {
  const defaults = defaultAiSettings();
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    model: asString(r.model, defaults.model),
    maxTokens: clampInt(r.maxTokens, defaults.maxTokens, 50, 4000),
    temperature: clampFloat(r.temperature, defaults.temperature, 0, 1),
    systemPrompt: asString(r.systemPrompt, defaults.systemPrompt),
    extractionPrompt: asString(r.extractionPrompt, defaults.extractionPrompt),
  };
}

export interface SettingsDeps {
  db?: DrizzleDb;
}

export function getBusinessRules(deps: SettingsDeps = {}): BusinessRules {
  const db = deps.db ?? getDb();
  const raw = readRow(db, KEY_BUSINESS_RULES);
  if (raw === null) return DEFAULT_BUSINESS_RULES;
  return normalizeBusinessRules(raw);
}

export function getAiSettings(deps: SettingsDeps = {}): AiSettings {
  const db = deps.db ?? getDb();
  const raw = readRow(db, KEY_AI);
  if (raw === null) return defaultAiSettings();
  return normalizeAi(raw);
}

export function getAllSettings(deps: SettingsDeps = {}): AppSettings {
  return {
    businessRules: getBusinessRules(deps),
    ai: getAiSettings(deps),
  };
}

export function updateBusinessRules(input: BusinessRules, deps: SettingsDeps = {}): BusinessRules {
  const db = deps.db ?? getDb();
  const normalized = normalizeBusinessRules(input);
  writeRow(db, KEY_BUSINESS_RULES, normalized);
  return normalized;
}

export function updateAiSettings(input: AiSettings, deps: SettingsDeps = {}): AiSettings {
  const db = deps.db ?? getDb();
  const normalized = normalizeAi(input);
  writeRow(db, KEY_AI, normalized);
  return normalized;
}

export function parseCommaList(value: string | null | undefined): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function isInOakSeason(date: Date, rule: OakSeasonRule): boolean {
  if (!rule.enabled) return false;
  const month = date.getMonth() + 1;
  if (rule.startMonth <= rule.endMonth) {
    return month >= rule.startMonth && month <= rule.endMonth;
  }
  // wraparound (e.g. Nov-Feb)
  return month >= rule.startMonth || month <= rule.endMonth;
}

export function zipMatchesServiceArea(zip: string | null | undefined, prefixes: string[]): boolean {
  if (typeof zip !== 'string') return false;
  const trimmed = zip.trim().slice(0, 5);
  if (!/^\d{3,5}$/.test(trimmed)) return false;
  const prefix = trimmed.slice(0, 3);
  return prefixes.includes(prefix);
}
