import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app/app.js';
import { getDb, setupFreshDb, teardownDb } from './_helpers.js';
import { insertLead } from './_seed-leads.js';

describe('GET /queue', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('renders only awaiting_review and manually_flagged leads', async () => {
    const db = getDb();
    insertLead(db, { customerName: 'Awaiting A', status: 'awaiting_review' });
    insertLead(db, { customerName: 'Awaiting B', status: 'awaiting_review' });
    insertLead(db, { customerName: 'Flagged C', status: 'manually_flagged' });
    insertLead(db, { customerName: 'Sent D', status: 'auto_sent' });
    insertLead(db, { customerName: 'Sent E', status: 'manually_sent' });

    const app = createApp();
    const res = await app.request('/queue');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="queue-page"');
    expect(html).toContain('Awaiting A');
    expect(html).toContain('Awaiting B');
    expect(html).toContain('Flagged C');
    expect(html).not.toContain('Sent D');
    expect(html).not.toContain('Sent E');
  });

  it('shows correct counts in the banner', async () => {
    const db = getDb();
    insertLead(db, { status: 'awaiting_review' });
    insertLead(db, { status: 'awaiting_review' });
    insertLead(db, { status: 'manually_flagged' });

    const app = createApp();
    const res = await app.request('/queue');
    const html = await res.text();
    expect(html).toContain('2 awaiting review');
    expect(html).toContain('1 manually flagged');
    expect(html).toMatch(/3 leads? need attention/);
  });

  it('shows empty state when nothing is in queue', async () => {
    const db = getDb();
    insertLead(db, { status: 'auto_sent' });
    const app = createApp();
    const res = await app.request('/queue');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="empty-state-queue"');
  });

  it('orders awaiting_review leads ASC by received_at', async () => {
    const db = getDb();
    const earlier = new Date(Date.UTC(2026, 3, 26, 9, 0, 0));
    const later = new Date(Date.UTC(2026, 3, 26, 14, 0, 0));
    insertLead(db, {
      customerName: 'Newer Lead',
      status: 'awaiting_review',
      receivedAt: later,
    });
    insertLead(db, {
      customerName: 'Older Lead',
      status: 'awaiting_review',
      receivedAt: earlier,
    });
    const app = createApp();
    const res = await app.request('/queue');
    const html = await res.text();
    const olderIdx = html.indexOf('Older Lead');
    const newerIdx = html.indexOf('Newer Lead');
    expect(olderIdx).toBeGreaterThan(-1);
    expect(newerIdx).toBeGreaterThan(-1);
    expect(olderIdx).toBeLessThan(newerIdx);
  });
});

describe('GET /stats (placeholder)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('renders the stats placeholder page', async () => {
    const app = createApp();
    const res = await app.request('/stats');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="stats-page"');
    expect(html).toContain('Stats coming in Phase 7');
  });
});

describe('end-to-end UI smoke (no browser)', () => {
  beforeEach(() => setupFreshDb());
  afterEach(() => teardownDb());

  it('seed → dashboard → patch extracted → approve → status final', async () => {
    const db = getDb();
    const id = insertLead(db, {
      customerName: 'Smoke Customer',
      status: 'awaiting_review',
      responseText: 'Draft hi from PTS.',
      customerZip: '44113',
      serviceAreaCounty: 'Cuyahoga',
    });
    const app = createApp();

    const dashRes = await app.request('/dashboard');
    expect(dashRes.status).toBe(200);
    expect(await dashRes.text()).toContain('Smoke Customer');

    const patchRes = await app.request(`/leads/${id}/extracted-data`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        customer_name: 'Smoke Customer Edited',
        customer_phone: '(216) 555-1234',
        customer_email: 'smoke@example.com',
        customer_address: '1 Maple',
        customer_city: 'Cleveland',
        customer_zip: '44113',
      }).toString(),
    });
    expect(patchRes.status).toBe(200);

    const approveRes = await app.request(`/leads/${id}/approve`, { method: 'POST' });
    expect(approveRes.status).toBe(200);

    const finalDetail = await app.request(`/leads/${id}`);
    expect(finalDetail.status).toBe(200);
    const html = await finalDetail.text();
    expect(html).toContain('Smoke Customer Edited');
    expect(html).toContain('data-status="manually_sent"');
  });
});
