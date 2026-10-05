import { fetchIss, FetchFailure, EXPLAIN, formatKst, compare, resetState, runFixture } from './lib/core.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const km = (v) => v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(d);
const badge = (node, text, cls) => { node.textContent = text; node.className = `badge ${cls || ''}`; };
const getJson = async (p) => { const r = await fetch(p, { cache: 'no-store' }); if (!r.ok) throw new Error(p); return r.json(); };

/* ---------- ① 실제 조회 ---------- */
let lastGoodLive = null; // { raw, reading } 마지막 정상 조회(이 화면에서)

function renderLive(reading, stale) {
  $('live-value').textContent = km(reading.normalized_value);
  $('live-unit').textContent = reading.unit;
  $('live-source-time').textContent = formatKst(reading.source_time) + ' (원천 timestamp)';
  $('live-fetched').textContent = formatKst(reading.fetched_at);
  stale ? badge($('live-badge'), '오래된 값 · 마지막 정상값', 'stale') : badge($('live-badge'), '정상 · fresh', 'fresh');
}

function showLiveError(code, detail) {
  const e = EXPLAIN[code];
  const box = $('live-error');
  box.hidden = false;
  box.replaceChildren(
    el('b', { textContent: `${e.title} (${code})` }),
    el('span', { textContent: `${e.why} ${e.next}${detail?.retry_after ? ` (Retry-After ${detail.retry_after}초)` : ''}` }),
  );
  $('live-btn').textContent = '다시 시도';
}

async function liveFetch() {
  const btn = $('live-btn');
  btn.disabled = true;
  try {
    const res = await fetchIss({ online: navigator.onLine });
    lastGoodLive = res;
    $('live-error').hidden = true;
    renderLive(res.reading, false);
    btn.textContent = '새로 조회';
  } catch (e) {
    const code = e instanceof FetchFailure ? e.code : 'schema_error';
    showLiveError(code, e.detail);
    if (lastGoodLive) renderLive(lastGoodLive.reading, true); // 마지막 정상값은 지우지 않는다
    else await fallbackToLastRecord();
  } finally { btn.disabled = false; }
}

let publicRows = [];
async function fallbackToLastRecord() {
  const last = publicRows[publicRows.length - 1];
  if (!last) { $('live-value').textContent = '—'; badge($('live-badge'), '값 없음 · 아직 정상 조회 없음', 'stale'); return; }
  renderLive({ normalized_value: last.normalized_value, unit: last.unit, source_time: last.source_time, fetched_at: last.last_fetched_at }, true);
  $('live-badge').textContent = `오래된 값 · ${last.record_date} 공개 기록`;
}

/* ---------- ② 공개 일별 기록 ---------- */
function renderRecords(doc) {
  publicRows = [...doc.rows].sort((a, b) => a.record_date.localeCompare(b.record_date));
  const body = $('rec-body');
  body.replaceChildren();
  for (const r of publicRows) {
    const stored = r.normalized_value, raw = r.raw?.altitude;
    const shown = km(stored);
    const hasRaw = typeof raw === 'number';
    const rawMatch = hasRaw && raw === stored && r.raw?.units === 'kilometers';
    const dispMatch = hasRaw && `${shown} ${r.unit}` === `${km(raw)} km`;
    const urlMatch = r.source_url === 'https://api.wheretheiss.at/v1/satellites/25544';
    const detail = el('details', {}, el('summary', { textContent: `원자료 ${rawMatch && dispMatch && urlMatch ? '✓ 일치' : '✗ 불일치'}` }),
      el('pre', { textContent:
        `출처 URL : ${r.source_url}\n원자료 altitude : ${hasRaw ? raw : '없음 (raw 필드 누락)'} (units=${r.raw?.units}, timestamp=${r.raw?.timestamp})\n` +
        `저장값 normalized_value : ${stored} ${r.unit}\n화면값 : ${shown} ${r.unit}\n` +
        `출처 시각(UTC) : ${r.source_time}\n조회 시각(UTC) : ${r.last_fetched_at}\n` +
        `KST 날짜 키 : ${r.record_date}  (조회 ${r.fetch_count || 1}회 → 이 날짜 1행)` }));
    body.append(el('tr', {},
      el('td', { textContent: r.record_date }),
      el('td', { textContent: `${shown} ${r.unit}` }),
      el('td', { textContent: formatKst(r.source_time) }),
      el('td', { textContent: formatKst(r.last_fetched_at) }),
      el('td', {}, detail)));
  }
  const dl = $('rec-delta');
  if (publicRows.length >= 2) {
    const last = publicRows[publicRows.length - 1];
    const c = compare(publicRows, last);
    const prev = publicRows.find((r) => r.record_date === c.from_date);
    dl.textContent = `${c.label}: ${sign(c.signed)} ${c.unit}  (${km(last.normalized_value)} − ${km(prev.normalized_value)}, 저장된 두 값으로 재계산 · ${c.from_date} → ${last.record_date})`;
    badge($('rec-badge'), `실제 ${publicRows.length}건`, publicRows.length === 2 ? 'fresh' : '');
    $('rec-note').textContent = `전체 소수점 원자료로 계산한 변화값: ${sign(c.signed, 6)} km. 화면은 소수 둘째 자리 반올림.`;
  } else {
    dl.textContent = publicRows.length ? '어제 대비: 두 번째 실제 날짜 기록을 기다리는 중입니다.' : '아직 실제 기록이 없습니다.';
    badge($('rec-badge'), `실제 ${publicRows.length}건 · 2건 필요`, 'stale');
    $('rec-note').textContent = '변화값은 서로 다른 KST 날짜의 실제 기록이 2건이 되어야 계산됩니다. 기록을 만들어 내거나 합성값으로 채우지 않습니다.';
  }
  if (doc.last_attempt?.outcome === 'error') {
    const e = EXPLAIN[doc.last_attempt.error_code];
    $('rec-note').textContent += ` 최근 자동 수집 실패: ${e ? e.title : doc.last_attempt.error_code} — 기존 기록은 그대로입니다.`;
  }
}

/* ---------- ③ 합성 수신 테스트 ---------- */
let lab = resetState();
let labNote = '아래 버튼을 눌러 합성 시험을 시작하세요.';
const fxCache = {};
const fx = async (name) => (fxCache[name] ??= await getJson(`fixtures/${name}.json`));
const FILES = { normal: ['normal-d1-a', 'normal-d1-b', 'normal-d2'], 'recover-d2': ['recover-d2'] };

async function play(files, fromReset) {
  if (fromReset) lab = resetState();
  for (const f of files) lab = runFixture(lab, await fx(f));
}

function renderLab() {
  const out = $('lab-out');
  const s = lab;
  if (!s.sequence) { out.replaceChildren(el('p', { textContent: labNote })); $('retry-btn').hidden = true; return; }
  const stale = s.status?.freshness === 'stale';
  const cell = (k, v) => el('div', { className: 'cell' }, el('small', { textContent: k }), el('b', { textContent: v }));
  const cmp = s.comparison.state === 'comparable' ? `${sign(s.comparison.signed, 0)} ${s.comparison.unit}` : '없음 (1건뿐)';
  const grid = el('div', { className: 'grid' },
    cell('마지막 정상값', s.current ? `${s.current.normalized_value} ${s.current.unit}` : '—'),
    cell('상태 freshness', stale ? 'stale · 오래된 값' : 'fresh'),
    cell('error_code', s.status.error_code),
    cell('일별 기록 수', `${s.rows.length}건`),
    cell('전일 대비', cmp),
    cell('마지막 재생', s.last_run?.fixture_id || '—'));
  const kids = [grid];
  if (stale) {
    const e = EXPLAIN[s.status.error_code];
    kids.push(el('div', { className: 'error' }, el('b', { textContent: `${e.title} (${s.status.error_code})` }),
      el('span', { textContent: `${e.why} ${e.next}${s.last_run.retry_after_seconds ? ` Retry-After: ${s.last_run.retry_after_seconds}초.` : ''}` }),
      el('div', { className: 'stale-note', textContent: `오래된 값: ${s.current.normalized_value} ${s.current.unit} 은(는) 마지막으로 성공한 값이며 지워지지 않았습니다.` })));
  } else kids.push(el('p', { textContent: labNote }));
  const tbl = el('table', {}, el('thead', {}, el('tr', {}, ...['날짜(가상 KST)', '값', '단위', '기록 ID'].map((t) => el('th', { textContent: t })))),
    el('tbody', {}, ...s.rows.map((r) => el('tr', {}, ...[r.record_date, r.normalized_value, r.unit, r.record_id].map((t) => el('td', { textContent: String(t) }))))));
  kids.push(el('div', { className: 'table-wrap' }, tbl));
  out.replaceChildren(...kids);
  $('retry-btn').hidden = !stale;
}

async function labClick(kind) {
  if (kind === 'reset') { lab = resetState(); labNote = '합성 상태를 초기화했습니다. 실제 기록에는 영향이 없습니다.'; }
  else if (kind === 'normal') { await play(FILES.normal, true); labNote = '정상 순서 완료: 가상 2일차에 새 행이 생기고 +15 pt 입니다.'; }
  else { await play(['normal-d1-a', 'normal-d1-b', kind], true); labNote = ''; }
  renderLab();
}

async function labRetry() {
  await play(FILES['recover-d2'], false);
  labNote = '재시도 성공: fresh / none 으로 돌아왔고 다음 날짜(2026-08-25) 기록이 정확히 1건 추가되었습니다 (120 pt, +15 pt).';
  renderLab();
}

/* ---------- ④ 자료 SHA-256 대조 ---------- */
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function verifyHashes() {
  const list = $('hash-list');
  try {
    const manifest = await getJson('contract/asset-manifest.json');
    $('pkg-id').textContent = manifest.package_id;
    let bad = 0, n = 0;
    for (const f of manifest.files.filter((x) => x.path.startsWith('fixtures/'))) {
      const buf = await (await fetch(f.path, { cache: 'no-store' })).arrayBuffer();
      const h = hex(await crypto.subtle.digest('SHA-256', buf));
      const ok = h === f.sha256; n++; if (!ok) bad++;
      list.append(el('li', { className: ok ? '' : 'bad', textContent: `${ok ? '✓' : '✗'} ${f.path} ${f.sha256}` }));
    }
    badge($('hash-badge'), bad ? `불일치 ${bad}` : `${n}개 일치`, bad ? 'stale' : 'fresh');
  } catch { badge($('hash-badge'), '확인 실패', 'stale'); }
}

async function sourceLink() {
  try {
    const b = await getJson('build-info.json');
    $('src-link').replaceChildren('소스: ', el('a', { href: `https://github.com/${b.repo}/tree/${b.commit}`, target: '_blank', rel: 'noopener', textContent: `${b.repo} @ ${b.commit.slice(0, 7)}` }));
  } catch { $('src-link').textContent = '소스: 배포 시 커밋 주소가 이곳에 표시됩니다.'; }
}

/* ---------- 시작 ---------- */
document.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => labClick(b.dataset.run)));
$('retry-btn').addEventListener('click', labRetry);
$('live-btn').addEventListener('click', liveFetch);
renderLab();
verifyHashes();
sourceLink();
getJson('data/records.json').then(renderRecords).catch(() => badge($('rec-badge'), '기록 파일 없음', 'stale')).then(liveFetch);
