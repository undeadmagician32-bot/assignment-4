# 오늘의 ISS 고도 정보판

정적 사이트(빌드 없음). 원천: `https://api.wheretheiss.at/v1/satellites/25544` (키 불필요, CORS 허용) — 값 `altitude`(km).

- `lib/core.js` — 정규화·KST 날짜 키·upsert·전일 대비 재계산·실패 5종 분류·fixture 재생 (브라우저/Node 공용)
- `app.js`, `index.html`, `style.css` — 화면
- `data/records.json` — 실제 KST 일별 기록(원자료 `raw` 포함). 같은 날은 1행으로 갱신, 새 날짜는 새 행, 실패는 기존 행을 덮어쓰지 않음
- `scripts/collect.mjs` — 하루 1회 수집(임시 파일 + rename). 제출용 2건이 차면 고정
- `scripts/verify-assets.mjs`, `scripts/scan-secrets.mjs` — 과제 자료 SHA-256 대조 / 비밀값 패턴 검색
- `contract/`, `fixtures/` — 과제 공개 자료 원본(수정 금지)
- `tests/core.test.mjs` — `node --test`

로컬 확인: 아무 정적 서버로 이 폴더를 열면 됩니다 (`file://`은 fetch 제한으로 불가).
배포: GitHub Pages(Actions) — Settings → Pages → Source: GitHub Actions. Actions 탭에서 “Run workflow”(collect 체크)로 수동 수집.
