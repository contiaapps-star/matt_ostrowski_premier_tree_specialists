import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer, type StartedServer } from '../../app/server.js';

describe('server boot', () => {
  let started: StartedServer;

  beforeAll(async () => {
    // PORT=0 lets the OS assign an ephemeral free port.
    started = await startServer(0);
  });

  afterAll(async () => {
    await started.close();
  });

  it('listens on a real port without throwing', () => {
    expect(started.port).toBeGreaterThan(0);
  });

  it('responds to /health over HTTP once listening', async () => {
    const res = await fetch(`http://127.0.0.1:${started.port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe('ok');
  });
});
