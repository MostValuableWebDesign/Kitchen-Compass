import assert from 'node:assert/strict';
import test from 'node:test';
import { onlineFirstMealSearch } from '../lib/completeMealSearch';

test('complete meal search uses a suitable online dish without calling AI', async () => {
  const calls: string[] = [];
  const found = await onlineFirstMealSearch(
    async () => { calls.push('online'); return { title: 'Roast chicken' }; },
    async () => { calls.push('ai'); },
    () => false,
  );
  assert.deepEqual(calls, ['online']);
  assert.equal(found?.title, 'Roast chicken');
});

test('complete meal search creates an AI dish after no result or provider failure', async () => {
  for (const online of [async () => undefined, async () => { throw new Error('unavailable'); }]) {
    const calls: string[] = [];
    await onlineFirstMealSearch(
      async () => { calls.push('online'); return online(); },
      async () => { calls.push('ai'); },
      () => false,
    );
    assert.deepEqual(calls, ['online', 'ai']);
  }
});

test('cancelling during online search does not start AI', async () => {
  let cancelled = false;
  let aiCalls = 0;
  await onlineFirstMealSearch(
    async () => { cancelled = true; return undefined; },
    async () => { aiCalls += 1; },
    () => cancelled,
  );
  assert.equal(aiCalls, 0);
});
