import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { invalidateCaches, TtlCache } from './cache.js';

describe('TtlCache', () => {
  it('shares one load between concurrent requests for a key', async () => {
    const cache = new TtlCache<number>(1_000);
    const load = mock.fn(async () => 42);
    const results = await Promise.all([cache.get('a', load), cache.get('a', load), cache.get('a', load)]);
    assert.deepEqual(results, [42, 42, 42]);
    assert.equal(load.mock.callCount(), 1);
  });

  it('loads again once the entry expires', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 0 });
    const cache = new TtlCache<number>(1_000);
    const load = mock.fn(async () => load.mock.callCount());
    assert.equal(await cache.get('a', load), 0);
    t.mock.timers.tick(999);
    assert.equal(await cache.get('a', load), 0);
    t.mock.timers.tick(1);
    assert.equal(await cache.get('a', load), 1);
  });

  it('does not keep failed loads', async () => {
    const cache = new TtlCache<string>(1_000);
    await assert.rejects(cache.get('a', async () => Promise.reject(new Error('down'))));
    assert.equal(await cache.get('a', async () => 'up'), 'up');
  });

  it('is emptied by invalidateCaches', async () => {
    const cache = new TtlCache<number>(60_000);
    await cache.get('a', async () => 1);
    invalidateCaches();
    assert.equal(await cache.get('a', async () => 2), 2);
  });

  it('evicts the oldest key beyond its size', async () => {
    const cache = new TtlCache<string>(60_000, 2);
    await cache.get('a', async () => 'a1');
    await cache.get('b', async () => 'b1');
    await cache.get('c', async () => 'c1');
    assert.equal(await cache.get('a', async () => 'a2'), 'a2');
    assert.equal(await cache.get('c', async () => 'c2'), 'c1');
  });
});
