// contract/asset-manifest.json 의 파일 SHA-256 을 실제 파일과 대조하고, fixtures/ 사본이 원본과 같은지 확인한다.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (b) => createHash('sha256').update(b).digest('hex');
const manifest = JSON.parse(await readFile(path.join(root, 'contract', 'asset-manifest.json'), 'utf8'));
let bad = 0;
for (const f of manifest.files) {
  const buf = await readFile(path.join(root, 'contract', f.path));
  const ok = sha(buf) === f.sha256 && buf.length === f.bytes;
  if (!ok) { bad++; console.error('MISMATCH', f.path); }
  if (f.path.startsWith('fixtures/')) {
    const copy = await readFile(path.join(root, f.path));
    if (sha(copy) !== f.sha256) { bad++; console.error('DEPLOYED FIXTURE DIFFERS', f.path); }
  }
}
console.log(`package=${manifest.package_id} checked=${manifest.files.length} mismatches=${bad}`);
process.exit(bad ? 1 : 0);
