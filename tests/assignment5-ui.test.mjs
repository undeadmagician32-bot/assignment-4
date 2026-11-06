// T05 B: 판정 결과가 ① 지금 값 화면 문구로 바르게 바뀌는지, 실제 조회 성공 경로에 연결됐는지 확인.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifySourceAge, describeSourceAge, formatAge } from '../lib/core.js';

const F = '2026-11-06T13:00:00.000Z';

test('T05-UI fresh: 300초 이내는 정상 · fresh 와 관측 나이', () => {
  const d = describeSourceAge(classifySourceAge('2026-11-06T12:58:00.000Z', F));
  assert.equal(d.cls, 'fresh');
  assert.equal(d.badge, '정상 · fresh');
  assert.match(d.note, /2분/);
});

test('T05-UI stale: 오래된 관측은 fresh 로 보이지 않고 나이를 함께 표시', () => {
  const d = describeSourceAge(classifySourceAge('2026-11-06T12:52:55.000Z', F));
  assert.equal(d.cls, 'stale');
  assert.doesNotMatch(d.badge, /fresh/);
  assert.match(d.badge, /오래된 원천 관측 · 7분 5초 전/);
});

test('T05-UI unknown: 시각 확인 불가를 설명하고 fresh 로 보이지 않음', () => {
  for (const s of [null, 'not-a-date', '2026-11-06T13:00:01.000Z']) {
    const d = describeSourceAge(classifySourceAge(s, F));
    assert.equal(d.cls, 'stale');
    assert.match(d.badge, /시각 확인 불가/);
    assert.doesNotMatch(d.badge, /fresh/);
  }
});

test('T05-UI formatAge', () => {
  assert.equal(formatAge(0), '0초');
  assert.equal(formatAge(300), '5분');
  assert.equal(formatAge(7325), '2시간 2분');
  assert.equal(formatAge(null), '알 수 없음');
});

test('T05-UI 연결: app.js 실제 조회 성공 경로가 classifySourceAge 결과로 화면을 그린다', () => {
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(src, /renderLive\(res\.reading, false, classifySourceAge\(res\.reading\.source_time, res\.reading\.fetched_at\)\)/);
  assert.doesNotMatch(src, /badge\(\$\('live-badge'\), '정상 · fresh', 'fresh'\)/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="live-age"/);
});
