import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarizeLocations } from '../lib/usage.ts';

process.env.TZ = 'Asia/Singapore';

const record = (created_at, total_bytes, status = 'success') => ({
  created_at,
  total_bytes,
  upload_bytes: Math.round(total_bytes * 0.6),
  download_bytes: total_bytes - Math.round(total_bytes * 0.6),
  status,
});

test('daily and monthly totals use the device local calendar', () => {
  const rows = [
    record('2026-10-10T00:30:00+08:00', 100, 'success'),
    record('2026-10-10T11:00:00+08:00', 200, 'failed'),
    record('2026-10-09T23:59:00+08:00', 300, 'pending'),
    record('2026-09-30T23:59:00+08:00', 400, 'success'),
  ];
  const summary = summarizeLocations(rows, new Date('2026-10-10T12:00:00+08:00'));

  assert.equal(summary.today, 300);
  assert.equal(summary.month, 600);
  assert.equal(summary.average, 250);
  assert.equal(summary.upload, 600);
  assert.equal(summary.download, 400);
  assert.equal(summary.successful, 2);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.daily, [
    { day: '2026-09-30', bytes: 400 },
    { day: '2026-10-09', bytes: 300 },
    { day: '2026-10-10', bytes: 300 },
  ]);
});

test('empty usage history returns zero totals', () => {
  const summary = summarizeLocations([], new Date('2026-10-10T12:00:00+08:00'));
  assert.equal(summary.today, 0);
  assert.equal(summary.month, 0);
  assert.equal(summary.average, 0);
  assert.equal(summary.latest, null);
  assert.deepEqual(summary.daily, []);
});
