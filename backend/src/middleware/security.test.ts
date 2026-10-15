import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { env } from '../config/env.js';
import { configuredOrigins, corsPolicy } from './security.js';

describe('CORS policy', () => {
  const app = express();
  app.use(corsPolicy);
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  let url = '';

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert(address && typeof address === 'object');
    url = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  it('allows the configured website origin', async () => {
    const origin = new URL(env.siteUrl).origin;
    const response = await fetch(url, { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  });

  it('does not trust arbitrary deployment-looking origins', async () => {
    const origin = 'https://real-estate-attacker-hobby213123213.vercel.app';
    assert.equal(configuredOrigins.has(origin), false);
    const response = await fetch(url, { headers: { Origin: origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  });
});
