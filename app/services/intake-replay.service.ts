import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { createApp } from '../app.js';

export interface ReplayResult {
  endpoint: string;
  status: number;
  body: unknown;
}

export const FIXTURES_DIR = resolve(process.cwd(), 'tests', 'fixtures', 'inbound');

interface FixtureSpec {
  endpoint: '/api/intake/lsa-email' | '/api/intake/answerforce-email' | '/api/intake/website-form';
  buildBody: (raw: string) => Record<string, unknown>;
  contentType: 'application/json';
  filename: string;
}

function detectFixture(name: string): FixtureSpec {
  const lower = name.toLowerCase();
  if (lower.startsWith('lsa-')) {
    return {
      endpoint: '/api/intake/lsa-email',
      buildBody: (raw) => ({ raw_email: raw }),
      contentType: 'application/json',
      filename: name.endsWith('.txt') ? name : `${name}.txt`,
    };
  }
  if (lower.startsWith('answerforce-')) {
    return {
      endpoint: '/api/intake/answerforce-email',
      buildBody: (raw) => ({ raw_email: raw }),
      contentType: 'application/json',
      filename: name.endsWith('.txt') ? name : `${name}.txt`,
    };
  }
  if (lower.startsWith('website-form')) {
    return {
      endpoint: '/api/intake/website-form',
      buildBody: (raw) => {
        const obj = JSON.parse(raw) as Record<string, unknown>;
        return { ...obj, secret: config.WEBSITE_FORM_WEBHOOK_SECRET };
      },
      contentType: 'application/json',
      filename: name.endsWith('.json') ? name : `${name}.json`,
    };
  }
  throw new Error(`unknown fixture: ${name} (must start with lsa-, answerforce-, or website-form)`);
}

export async function replayFixture(name: string): Promise<ReplayResult> {
  const spec = detectFixture(name);
  const path = resolve(FIXTURES_DIR, spec.filename);
  const raw = readFileSync(path, 'utf-8');
  const body = spec.buildBody(raw);

  const app = createApp();
  const res = await app.request(spec.endpoint, {
    method: 'POST',
    headers: { 'content-type': spec.contentType },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep as text
  }
  return { endpoint: spec.endpoint, status: res.status, body: parsed };
}
