import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { clearStatsCache, computeStats } from '../../app/services/stats.service.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('stats — service & route', () => {
  beforeEach(() => {
    setupFreshDb();
    clearStatsCache();
  });
  afterEach(() => teardownDb());

  it('computes auto-send rate correctly from seeded leads', () => {
    const db = getDb();
    const now = Date.now();
    const recent = (offsetMin: number) => new Date(now - offsetMin * 60_000);

    insertLead(db, {
      status: 'auto_sent',
      receivedAt: recent(60),
      confidenceScore: 0.9,
    });
    insertLead(db, {
      status: 'auto_sent',
      receivedAt: recent(120),
      confidenceScore: 0.85,
    });
    insertLead(db, {
      status: 'manually_sent',
      receivedAt: recent(180),
      confidenceScore: 0.7,
    });
    insertLead(db, {
      status: 'awaiting_review',
      receivedAt: recent(240),
      confidenceScore: 0.6,
    });
    insertLead(db, {
      status: 'manually_flagged',
      receivedAt: recent(300),
      confidenceScore: 0.4,
    });

    const snap = computeStats(new Date(now));
    expect(snap.autoSendRate.totalProcessed).toBe(5);
    expect(snap.autoSendRate.autoSent).toBe(2);
    expect(snap.autoSendRate.ratePct).toBeCloseTo(40, 1);
  });

  it('computes out-of-service-area count and rate', () => {
    const db = getDb();
    const now = Date.now();
    insertLead(db, { receivedAt: new Date(now - 60_000), outOfServiceArea: false });
    insertLead(db, { receivedAt: new Date(now - 120_000), outOfServiceArea: true });
    insertLead(db, { receivedAt: new Date(now - 180_000), outOfServiceArea: true });
    insertLead(db, { receivedAt: new Date(now - 240_000), outOfServiceArea: false });

    const snap = computeStats(new Date(now));
    expect(snap.outOfServiceArea.count).toBe(2);
    expect(snap.outOfServiceArea.ratePct).toBeCloseTo(50, 1);
  });

  it('computes manual_flag_count grouped by reason', async () => {
    const db = getDb();
    const now = Date.now();
    insertLead(db, {
      status: 'manually_flagged',
      receivedAt: new Date(now - 60_000),
      confidenceScore: 0.2, // low_confidence
    });
    const missingId = insertLead(db, {
      status: 'manually_flagged',
      receivedAt: new Date(now - 120_000),
      confidenceScore: 0.7,
    });
    // Force the missing-data fields to NULL so the stats service classifies
    // this row as "missing_data" rather than "other".
    const { leads } = await import('../../app/db/schema.js');
    const { eq } = await import('drizzle-orm');
    db.update(leads)
      .set({ customerName: null, customerPhoneE164: null, customerEmail: null })
      .where(eq(leads.id, missingId))
      .run();

    const snap = computeStats(new Date(now));
    expect(snap.manualFlagCount.total).toBe(2);
    const reasons = snap.manualFlagCount.byReason.map((r) => r.reason).sort();
    expect(reasons).toContain('low_confidence');
    expect(reasons).toContain('missing_data');
  });

  it('computes volume per source for last 7 days with daily buckets', () => {
    const db = getDb();
    const now = Date.now();
    insertLead(db, { source: 'google_lsa_email', receivedAt: new Date(now - 60_000) });
    insertLead(db, { source: 'google_lsa_email', receivedAt: new Date(now - 120_000) });
    insertLead(db, { source: 'website_form', receivedAt: new Date(now - 180_000) });

    const snap = computeStats(new Date(now));
    const lsa = snap.volumePerSource.find((s) => s.source === 'google_lsa_email')!;
    const wf = snap.volumePerSource.find((s) => s.source === 'website_form')!;
    const af = snap.volumePerSource.find((s) => s.source === 'answerforce_email')!;
    expect(lsa.total).toBe(2);
    expect(wf.total).toBe(1);
    expect(af.total).toBe(0);
    expect(lsa.daily.length).toBe(7);
  });

  it('workspace KPI strip renders auto-send rate from computed stats', async () => {
    const db = getDb();
    const now = Date.now();
    insertLead(db, { status: 'auto_sent', receivedAt: new Date(now - 60_000), confidenceScore: 0.9 });
    insertLead(db, { status: 'awaiting_review', receivedAt: new Date(now - 120_000), confidenceScore: 0.6 });
    clearStatsCache();
    const app = createApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="kpi-strip"');
    expect(html).toContain('data-testid="kpi-automation-rate"');
    expect(html).toContain('data-testid="kpi-auto-sent"');
    expect(html).toContain('data-testid="kpi-needs-review"');
    expect(html).toContain('50%'); // 1 auto-sent of 2 processed
  });

  it('caches stats for 60 seconds', () => {
    const db = getDb();
    const now = Date.now();
    insertLead(db, { status: 'auto_sent', receivedAt: new Date(now - 60_000), confidenceScore: 0.9 });
    const t0 = new Date(now);
    const a = computeStats(t0);
    insertLead(db, { status: 'auto_sent', receivedAt: new Date(now - 30_000), confidenceScore: 0.95 });
    const b = computeStats(t0);
    // Inside cache window — same snapshot returned
    expect(b.autoSendRate.autoSent).toBe(a.autoSendRate.autoSent);
    // After cache eviction, fresh snapshot reflects new lead
    clearStatsCache();
    const c = computeStats(t0);
    expect(c.autoSendRate.autoSent).toBe(2);
  });
});
