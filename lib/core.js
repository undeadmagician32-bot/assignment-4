// 브라우저와 Node(수집 스크립트·테스트)가 함께 쓰는 순수 로직. 비밀값 없음.
export const SIGNAL_ID = 'iss-altitude';
export const SOURCE_URL = 'https://api.wheretheiss.at/v1/satellites/25544';
export const SOURCE_NAME = 'Where the ISS at? (wheretheiss.at)';
export const ERROR_CODES = ['timeout', 'auth', 'rate_limit', 'offline', 'schema_error'];
export const KEYS = ['signal_id', 'normalized_value', 'unit', 'source_name', 'source_url',
  'source_time', 'fetched_at', 'record_timezone', 'record_date'];

export function kstDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new TypeError('invalid date-time');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatKst(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} KST`;
}

export class FetchFailure extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; this.detail = detail; }
}

// 원본 응답 → 공통 정규화 형식. 형식이 다르면 schema_error.
export function normalizeIss(raw, fetchedAtIso) {
  const ok = raw && typeof raw === 'object' && typeof raw.altitude === 'number'
    && Number.isFinite(raw.altitude) && Number.isInteger(raw.timestamp) && raw.units === 'kilometers';
  if (!ok) throw new FetchFailure('schema_error');
  return {
    signal_id: SIGNAL_ID,
    normalized_value: raw.altitude,
    unit: 'km',
    source_name: SOURCE_NAME,
    source_url: SOURCE_URL,
    source_time: new Date(raw.timestamp * 1000).toISOString(),
    fetched_at: new Date(fetchedAtIso).toISOString(),
    record_timezone: 'Asia/Seoul',
    record_date: kstDate(fetchedAtIso),
  };
}

export function validateReading(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw new TypeError('not an object');
  const a = Object.keys(r).sort().join(), b = [...KEYS].sort().join();
  if (a !== b) throw new TypeError('keys mismatch');
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(r.signal_id)) throw new TypeError('signal_id');
  if (typeof r.normalized_value !== 'number' || !Number.isFinite(r.normalized_value)) throw new TypeError('value');
  for (const k of ['unit', 'source_name']) if (typeof r[k] !== 'string' || !r[k].trim()) throw new TypeError(k);
  if (new URL(r.source_url).protocol !== 'https:') throw new TypeError('source_url');
  if (r.source_time !== null && Number.isNaN(new Date(r.source_time).getTime())) throw new TypeError('source_time');
  if (r.record_timezone !== 'Asia/Seoul') throw new TypeError('tz');
  if (r.record_date !== kstDate(r.fetched_at)) throw new TypeError('record_date');
  return true;
}

export function resetState() {
  return { rows: [], current: null, status: null, comparison: compare([], null), last_run: null, sequence: 0 };
}

// 어제(=직전 기록) 대비: 저장된 두 값으로 매번 다시 계산한다.
export function compare(rows, row) {
  if (!row) return { state: 'insufficient' };
  const prev = rows.filter((r) => r.signal_id === row.signal_id && r.record_date < row.record_date)
    .sort((a, b) => b.record_date.localeCompare(a.record_date))[0];
  if (!prev) return { state: 'insufficient' };
  if (prev.unit !== row.unit) return { state: 'unit_mismatch' };
  const signed = row.normalized_value - prev.normalized_value;
  const gap = Math.round((Date.parse(row.record_date) - Date.parse(prev.record_date)) / 86400000);
  return {
    state: 'comparable', signed, direction: signed > 0 ? 'increase' : signed < 0 ? 'decrease' : 'unchanged',
    magnitude: Math.abs(signed), unit: row.unit, from_date: prev.record_date, gap_days: gap,
    label: gap === 1 ? '어제 대비' : '이전 기록 대비',
  };
}

// 같은 signal_id + record_date 는 한 행으로 합친다(갱신). 새 날짜는 새 행.
export function upsertRow(rows, reading, extra = {}) {
  validateReading(reading);
  const out = rows.map((r) => ({ ...r }));
  const i = out.findIndex((r) => r.signal_id === reading.signal_id && r.record_date === reading.record_date);
  const prev = i >= 0 ? out[i] : null;
  const row = {
    record_id: prev ? prev.record_id : `${reading.signal_id}-${reading.record_date}`,
    signal_id: reading.signal_id,
    record_date: reading.record_date,
    normalized_value: reading.normalized_value,
    unit: reading.unit,
    source_name: reading.source_name,
    source_url: reading.source_url,
    source_time: reading.source_time,
    first_fetched_at: prev ? prev.first_fetched_at : reading.fetched_at,
    last_fetched_at: reading.fetched_at,
    fetch_count: prev ? (prev.fetch_count || 1) + 1 : 1,
    ...extra,
  };
  if (i >= 0) out[i] = row; else out.push(row);
  out.sort((a, b) => a.record_date.localeCompare(b.record_date));
  return { rows: out, row };
}

export function applySuccess(state, reading, meta = {}) {
  const { rows, row } = upsertRow(state.rows, reading);
  return {
    rows, current: { ...reading }, status: { freshness: 'fresh', error_code: 'none' },
    comparison: compare(rows, row), sequence: state.sequence + 1,
    last_run: { fixture_id: meta.fixture_id ?? null, outcome: 'success', error_code: 'none', retry_after_seconds: null },
  };
}

// 실패는 마지막 정상값(current)·행을 건드리지 않고 상태만 stale 로 바꾼다.
export function applyError(state, code, meta = {}) {
  if (!ERROR_CODES.includes(code)) throw new TypeError(`bad error code ${code}`);
  return {
    ...state, status: { freshness: 'stale', error_code: code }, sequence: state.sequence + 1,
    last_run: { fixture_id: meta.fixture_id ?? null, outcome: 'error', error_code: code, retry_after_seconds: meta.retry_after_seconds ?? null },
  };
}

// 합성 fixture 재생: 전송 단계(시간초과/오프라인/HTTP 상태)를 먼저 분류하고, 2xx 일 때만 본문을 검사한다.
export function runFixture(state, fx) {
  const t = fx.transport;
  const meta = { fixture_id: fx.fixture_id, retry_after_seconds: t.headers?.['retry-after'] ? Number(t.headers['retry-after']) : null };
  if (t.mode === 'offline') return applyError(state, 'offline', meta);
  if (t.mode === 'timeout' || t.delay_ms > t.deadline_ms) return applyError(state, 'timeout', meta);
  if (t.status === 401 || t.status === 403) return applyError(state, 'auth', meta);
  if (t.status === 429) return applyError(state, 'rate_limit', meta);
  if (t.status >= 200 && t.status < 300) {
    try { return applySuccess(state, fx.payload, meta); } catch { return applyError(state, 'schema_error', meta); }
  }
  return applyError(state, 'schema_error', meta);
}

// HTTP 호출 결과를 5종 오류로 분류(실제 조회용). fetchImpl 주입으로 시험 가능.
export async function fetchIss({ fetchImpl = fetch, now = () => new Date(), deadlineMs = 8000, online = true } = {}) {
  if (!online) throw new FetchFailure('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), deadlineMs);
  let res;
  try { res = await fetchImpl(SOURCE_URL, { signal: ctl.signal, cache: 'no-store' }); }
  catch (e) { throw new FetchFailure(e && e.name === 'AbortError' ? 'timeout' : 'offline'); }
  finally { clearTimeout(timer); }
  if (res.status === 401 || res.status === 403) throw new FetchFailure('auth', { status: res.status });
  if (res.status === 429) throw new FetchFailure('rate_limit', { retry_after: Number(res.headers.get('retry-after')) || null });
  if (!res.ok) throw new FetchFailure('schema_error', { status: res.status });
  const fetchedAt = now().toISOString();
  let raw;
  try { raw = await res.json(); } catch { throw new FetchFailure('schema_error'); }
  return { raw, reading: normalizeIss(raw, fetchedAt) };
}

export const EXPLAIN = {
  timeout: { title: '응답이 너무 느립니다', why: '외부 원천이 제한 시간(1.5초) 안에 답하지 않았습니다.', next: '잠시 뒤 다시 시도하세요. 값은 그대로 두고 상태만 오래된 값으로 바뀝니다.' },
  auth: { title: '외부 원천이 접근을 거절했습니다 (401/403)', why: '내 앱의 로그인 문제가 아니라 원천이 요청을 거절했습니다.', next: '원천의 공개 정책을 확인하세요. 다시 시도해도 같은 결과일 수 있습니다.' },
  rate_limit: { title: '호출 제한에 걸렸습니다 (429)', why: '짧은 시간에 너무 많이 요청했습니다.', next: 'Retry-After 안내만큼 기다린 뒤 한 번만 다시 시도하세요.' },
  offline: { title: '네트워크 연결이 없습니다', why: '원천에 닿지 못했습니다. 원천의 잘못인지는 알 수 없습니다.', next: '연결을 확인한 뒤 다시 시도하세요.' },
  schema_error: { title: '응답 형식이 바뀌었습니다', why: '응답은 왔지만 필수 필드 이름·타입이 약속과 다릅니다.', next: '값을 믿지 않고 버립니다. 원천 형식 변경을 확인해야 하며, 재시도만으로는 해결되지 않을 수 있습니다.' },
};
