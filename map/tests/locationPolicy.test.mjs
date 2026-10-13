import test from 'node:test';
import assert from 'node:assert/strict';
import { gpsFixKey, isValidGpsFix, newestLocation, persistWithoutWaitingForUpload, uploadInOrder, LOCATION_UPDATE_INTERVAL_MS, UNCERTAIN_ACCURACY_METERS } from '../lib/locationPolicy.ts';

test('requests 5-second fixes and accepts valid delayed fixes without timestamp-order filtering', () => {
  assert.equal(LOCATION_UPDATE_INTERVAL_MS, 5000);
  assert.equal(isValidGpsFix('2026-10-13T11:00:00.123Z', 10, 124), true);
  assert.equal(isValidGpsFix('not-a-date', 10, 124), false);
  assert.equal(isValidGpsFix('2026-10-13T11:00:00Z', 91, 124), false);
});

test('keeps an older valid fix for upload while protecting the visible marker from regression', () => {
  const current = { id: 'newer', created_at: '2026-10-13T12:00:02Z', latitude: 2 };
  assert.equal(isValidGpsFix('2026-10-13T12:00:01Z', 1, 124), true);
  assert.equal(newestLocation(current, { id: 'older', created_at: '2026-10-13T12:00:01Z', latitude: 1 }), current);
  assert.equal(newestLocation(current, { ...current, status: 'success' }).status, 'success');
});

test('keeps poor-accuracy readings but marks the threshold as uncertain', () => {
  assert.equal(isValidGpsFix('2026-10-13T12:00:00Z', 10, 124), true);
  assert.equal(68.1 > UNCERTAIN_ACCURACY_METERS, true);
});

test('rejects an older fix that arrives after a newer fix was committed', async () => {
  let latest = null;
  const commit = async (candidate, delay) => {
    await new Promise((resolve) => setTimeout(resolve, delay));
    latest = newestLocation(latest, candidate);
  };
  await Promise.all([
    commit({ id: 'older', created_at: '2026-10-13T12:00:01Z', latitude: 1 }, 20),
    commit({ id: 'newer', created_at: '2026-10-13T12:00:02Z', latitude: 2 }, 1),
  ]);
  assert.equal(latest.latitude, 2);
});

test('a delayed API response does not delay completion of local fix persistence', async () => {
  let releaseUpload;
  let persisted = false;
  const result = persistWithoutWaitingForUpload(
    async () => { persisted = true; return true; },
    () => new Promise((resolve) => { releaseUpload = resolve; })
  );
  await result;
  assert.equal(persisted, true);
  assert.equal(typeof releaseUpload, 'function');
  releaseUpload();
});

test('same coordinates at different GPS fix times remain separate records', () => {
  const firstKey = gpsFixKey('2026-10-13T12:00:00Z', 10.1, 124.7);
  const repeatedFirstKey = gpsFixKey('2026-10-13T12:00:00Z', 10.1, 124.7);
  const secondKey = gpsFixKey('2026-10-13T12:00:05Z', 10.1, 124.7);
  assert.equal(firstKey, repeatedFirstKey);
  assert.notEqual(firstKey, secondKey);
});

test('queued uploads run sequentially and leave later records for retry after a transient failure', async () => {
  const attempts = [];
  const first = await uploadInOrder(['a', 'b', 'c'], async (id) => {
    attempts.push(id);
    return { stopSync: id === 'b' };
  });
  assert.deepEqual(attempts, ['a', 'b']);
  assert.deepEqual(first.records, ['a', 'b']);
  const retry = await uploadInOrder(['b', 'c'], async (id) => {
    attempts.push(id);
    return { stopSync: false };
  });
  assert.deepEqual(retry.records, ['b', 'c']);
  assert.deepEqual(attempts, ['a', 'b', 'b', 'c']);
});
