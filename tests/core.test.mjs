import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resetState, runFixture, upsertRow, compare, kstDate, fetchIss, normalizeIss, FetchFailure } from '../lib/core.js';

const fx = async (n) => JSON.parse(await readFile(new URL(`../fixtures/${n}.json`, import.meta.url), 'utf8'));
const seq = async (...names) => { let s = resetState(); for (const n of names) s = runFixture(s, await fx(n)); return s; };

test('같은 날 재실행은 1행, 다음 날은 새 행 + 전일 대비 +15', async () => {
  const a = await seq('normal-d1-a');
  const b = await seq('normal-d1-a', 'normal-d1-b');
  const c = await seq('normal-d1-a', 'normal-d1-b', 'normal-d2');
  assert.equal(a.rows.length, 1);
  assert.equal(b.rows.length, 1);
  assert.equal(b.rows[0].normalized_value, 105);
  assert.equal(b.rows[0].record_id, a.rows[0].record_id);
  assert.equal(c.rows.length, 2);
  assert.equal(c.comparison.signed, 15);
  assert.equal(c.comparison.label, '어제 대비');
});

for (const [name, code] of [['timeout', 'timeout'], ['auth-401', 'auth'], ['rate-429', 'rate_limit'], ['offline', 'offline'], ['schema-break', 'schema_error']]) {
  test(`${name}: 마지막 정상값 105 보존 + stale/${code}`, async () => {
    const s = await seq('normal-d1-a', 'normal-d1-b', name);
    assert.deepEqual(s.status, { freshness: 'stale', error_code: code });
    assert.equal(s.current.normalized_value, 105);
    assert.equal(s.rows.length, 1);
    assert.equal(s.rows[0].normalized_value, 105);
  });
}

test('rate-429 는 Retry-After 60 을 기록', async () => {
  assert.equal((await seq('normal-d1-a', 'normal-d1-b', 'rate-429')).last_run.retry_after_seconds, 60);
});

test('실패 뒤 recover-d2: fresh/none, 2행, 120, 새 날짜 1건만 추가, 재실행해도 2행', async () => {
  let s = await seq('normal-d1-a', 'normal-d1-b', 'timeout');
  assert.equal(s.status.error_code, 'timeout');
  s = runFixture(s, await fx('recover-d2'));
  assert.deepEqual(s.status, { freshness: 'fresh', error_code: 'none' });
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[1].record_date, '2026-08-25');
  assert.equal(s.current.normalized_value, 120);
  assert.equal(s.comparison.signed, 15);
  assert.equal(runFixture(s, await fx('recover-d2')).rows.length, 2);
});

test('KST 자정 경계: UTC 14:59:59 → 당일, 15:00:00 → 다음 날', () => {
  assert.equal(kstDate('2026-08-24T14:59:59Z'), '2026-08-24');
  assert.equal(kstDate('2026-08-24T15:00:00Z'), '2026-08-25');
});

test('같은 날 세 번 + 다음 날 한 번 = 2행', () => {
  const mk = (iso, v) => ({ signal_id: 'x', normalized_value: v, unit: 'km', source_name: 'n', source_url: 'https://e.test/x', source_time: null, fetched_at: iso, record_timezone: 'Asia/Seoul', record_date: kstDate(iso) });
  let rows = [];
  for (const [t, v] of [['2026-10-05T01:00:00Z', 1], ['2026-10-05T05:00:00Z', 2], ['2026-10-05T14:59:00Z', 3], ['2026-10-05T15:00:00Z', 4]]) rows = upsertRow(rows, mk(t, v)).rows;
  assert.deepEqual(rows.map((r) => [r.record_date, r.normalized_value]), [['2026-10-05', 3], ['2026-10-06', 4]]);
  assert.equal(compare(rows, rows[1]).signed, 1);
});

test('실제 조회 분류: 401/403/429/오프라인/시간초과/형식 변경', async () => {
  const res = (status, body, headers = {}) => async () => ({ status, ok: status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body });
  const code = async (opts) => { try { await fetchIss(opts); return 'ok'; } catch (e) { assert.ok(e instanceof FetchFailure); return e.code; } };
  assert.equal(await code({ fetchImpl: res(401, {}) }), 'auth');
  assert.equal(await code({ fetchImpl: res(403, {}) }), 'auth');
  assert.equal(await code({ fetchImpl: res(429, {}, { 'retry-after': '30' }) }), 'rate_limit');
  assert.equal(await code({ fetchImpl: res(200, { altitude: '420' }) }), 'schema_error');
  assert.equal(await code({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }), 'offline');
  assert.equal(await code({ online: false }), 'offline');
  assert.equal(await code({ deadlineMs: 5, fetchImpl: (u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' })))) }), 'timeout');
  const ok = await fetchIss({ fetchImpl: res(200, { altitude: 420.5, timestamp: 1791180199, units: 'kilometers' }), now: () => new Date('2026-10-05T06:03:18Z') });
  assert.equal(ok.reading.normalized_value, 420.5);
  assert.equal(ok.reading.record_date, '2026-10-05');
  assert.throws(() => normalizeIss({ altitude: 1 }, '2026-10-05T00:00:00Z'));
});
