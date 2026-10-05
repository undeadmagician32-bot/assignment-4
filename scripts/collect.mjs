// 실제 ISS 값을 한 번 조회해 data/records.json 의 KST 일별 행에 기록한다. API 키 없음.
// 실패하면 기존 정상 행을 건드리지 않고 last_attempt 만 기록한 뒤 비정상 종료한다.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fetchIss, upsertRow, FetchFailure, SIGNAL_ID, kstDate } from '../lib/core.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'records.json');
const MAX_ROWS = Number(process.env.ISS_MAX_ROWS || 2); // 제출용 실제 기록은 서로 다른 날짜 2건에서 고정

async function load() {
  try { return JSON.parse(await readFile(FILE, 'utf8')); }
  catch { return { schema: 'iss-daily-v1', signal_id: SIGNAL_ID, last_attempt: null, rows: [] }; }
}
async function save(doc) {
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  await rename(tmp, FILE);
}

const doc = await load();
const today = kstDate(new Date().toISOString());
const frozen = doc.rows.length >= MAX_ROWS && !doc.rows.some((r) => r.record_date === today);
if (frozen) {
  console.log(`rows=${doc.rows.length} >= ${MAX_ROWS}: 제출 기록 고정, 새 날짜 행을 만들지 않음`);
  process.exit(0);
}

try {
  let result, lastErr;
  for (let i = 0; i < 3 && !result; i++) {           // 일시 오류만 짧게 재시도
    try { result = await fetchIss(); }
    catch (e) { lastErr = e; if (!(e instanceof FetchFailure) || ['auth', 'schema_error'].includes(e.code)) break; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
  if (!result) throw lastErr;
  const { rows } = upsertRow(doc.rows, result.reading, { raw: result.raw });
  doc.rows = rows;
  doc.last_attempt = { at: result.reading.fetched_at, outcome: 'success', error_code: 'none' };
  await save(doc);
  console.log(`saved ${result.reading.record_date} ${result.reading.normalized_value} ${result.reading.unit}; rows=${rows.length}`);
} catch (e) {
  doc.last_attempt = { at: new Date().toISOString(), outcome: 'error', error_code: e instanceof FetchFailure ? e.code : 'schema_error' };
  await save(doc);
  console.error('collect failed:', doc.last_attempt.error_code);
  process.exit(1);
}
