// 저장소 파일(.git 제외)과 .git 내부 텍스트에서 흔한 비밀값 패턴을 찾는다. 모든 형식을 보장하지는 않는다.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AKIA[0-9A-Z]{16}/,
  /sk-[A-Za-z0-9]{32,}/, /AIza[0-9A-Za-z_-]{35}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(api[_-]?key|secret|token|password)["']?\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i,
];
const SKIP = new Set(['node_modules', 'dist']);
let hits = 0, files = 0;
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP.has(e.name)) await walk(p); continue; }
    if (/\.(png|jpg|gif|ico|zip|pack|idx)$/i.test(e.name) || p.endsWith('scan-secrets.mjs')) continue;
    const text = (await readFile(p)).toString('latin1');
    files++;
    for (const re of PATTERNS) if (re.test(text)) { hits++; console.error('SECRET-LIKE', path.relative(root, p), re); }
  }
}
await walk(root);
console.log(`scanned=${files} hits=${hits}`);
process.exit(hits ? 1 : 0);
