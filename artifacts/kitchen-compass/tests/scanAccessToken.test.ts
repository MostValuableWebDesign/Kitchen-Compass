import assert from 'node:assert/strict';
import test from 'node:test';
import { createScanAccessTokenGetter, type ScanAccessTokenStorage } from '../lib/scanAccessToken';

function storageWith(initial: string | null): ScanAccessTokenStorage & { value: string | null; removed: number; writes: number } {
  return {
    value: initial,
    removed: 0,
    writes: 0,
    getItem: async function () { return this.value; },
    removeItem: async function () { this.value = null; this.removed += 1; },
    setItem: async function (_key, value) { this.value = value; this.writes += 1; },
  };
}

function token(expiresAt: number) {
  return `token.issued.${expiresAt}.signature`;
}

test('expired stored tokens are removed and replaced', async () => {
  const storage = storageWith(token(900));
  const getter = createScanAccessTokenGetter({
    storage,
    storageKey: 'scan',
    domain: 'example.test',
    now: () => 1_000,
    fetcher: async () => new Response(JSON.stringify({ accessToken: token(10_000) }), { status: 200 }),
  });

  assert.equal(await getter(), token(10_000));
  assert.equal(storage.removed, 1);
  assert.equal(storage.writes, 1);
});

test('failed acquisition is retryable and concurrent callers share one request', async () => {
  const storage = storageWith(null);
  let calls = 0;
  const getter = createScanAccessTokenGetter({
    storage,
    storageKey: 'scan',
    domain: 'example.test',
    now: () => 1_000,
    fetcher: async () => {
      calls += 1;
      if (calls === 1) throw new Error('network down');
      return new Response(JSON.stringify({ accessToken: token(10_000) }), { status: 200 });
    },
  });

  const first = await Promise.all([getter(), getter()]);
  assert.deepEqual(first, [null, null]);
  assert.equal(calls, 1);
  assert.equal(await getter(), token(10_000));
  assert.equal(calls, 2);
});

test('429 acquisition failures are retried on the next request', async () => {
  const storage = storageWith(null);
  let calls = 0;
  const getter = createScanAccessTokenGetter({
    storage,
    storageKey: 'scan',
    domain: 'example.test',
    now: () => 1_000,
    fetcher: async () => {
      calls += 1;
      return calls === 1
        ? new Response('{}', { status: 429 })
        : new Response(JSON.stringify({ accessToken: token(10_000) }), { status: 200 });
    },
  });

  assert.equal(await getter(), null);
  assert.equal(await getter(), token(10_000));
  assert.equal(calls, 2);
});