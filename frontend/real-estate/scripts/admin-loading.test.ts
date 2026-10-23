import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InFlightAdminRead } from '../src/app/admin/in-flight-admin-read.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('concurrent summary consumers share a request, but a completed result is never cached', async () => {
  const read = new InFlightAdminRead<number>();
  const pending = deferred<number>();
  let loads = 0;
  const load = () => { loads++; return pending.promise; };
  const first = read.run('session-a', load);
  assert.equal(read.run('session-a', load), first);
  assert.equal(loads, 1);
  pending.resolve(1);
  assert.equal(await first, 1);
  assert.equal(await read.run('session-a', async () => 2), 2);
});

test('a different bearer session never receives a previous session request', async () => {
  const read = new InFlightAdminRead<string>();
  const old = deferred<string>();
  const current = deferred<string>();
  const first = read.run('session-a', () => old.promise);
  const second = read.run('session-b', () => current.promise);
  assert.notEqual(first, second);
  old.resolve('old');
  await first;
  assert.equal(read.run('session-b', async () => 'unexpected'), second);
  current.resolve('current');
  assert.equal(await second, 'current');
});

test('a successful mutation invalidates pending reuse without letting old completion clear its replacement', async () => {
  const read = new InFlightAdminRead<number>();
  const old = deferred<number>();
  const fresh = deferred<number>();
  const first = read.run('session', () => old.promise);
  read.invalidate();
  const second = read.run('session', () => fresh.promise);
  old.resolve(1);
  await first;
  assert.equal(read.run('session', async () => 999), second);
  fresh.resolve(2);
  assert.equal(await second, 2);
});

test('failed summary requests release shared work and allow a real retry', async () => {
  const read = new InFlightAdminRead<number>();
  const pending = deferred<number>();
  const first = read.run('session', () => pending.promise);
  const second = read.run('session', async () => 999);
  pending.reject(new Error('offline'));
  await assert.rejects(first, /offline/);
  await assert.rejects(second, /offline/);
  assert.equal(await read.run('session', async () => 3), 3);
});
