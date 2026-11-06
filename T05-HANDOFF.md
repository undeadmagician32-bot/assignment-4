# AI A 인수인계

## 목표

ISS 원천 관측 시각이 조회 성공 시각보다 오래되면 최신 정상 관측으로 오인하지 않도록 나이를 분류한다. 기본 신선도 한계는 300초다.

## 현재 상태

`lib/core.js`에 `classifySourceAge(sourceTime, fetchedAt, maxAgeSeconds = 300)`을 추가했다. 결과는 `{ state: 'fresh' | 'stale', age_seconds: 정수 }` 또는 `{ state: 'unknown', age_seconds: null }`이다. 미래 시각·잘못된 시각·음수/비수치 한계는 unknown이다. 나이는 정수 초 내림으로 보고하고, 경계 판정은 밀리초로 한다. AI A 코드 스냅샷: `db106a80aa2d1941176466453d19e15667ea2a27`.

## 실행 명령

검증 환경: Node.js v24.22.1. `node:test` 지원 런타임 필요; 의존성 설치 불필요.

```powershell
node --test
```

새 복제 폴더에서 확인한 저장소 경로: `work/assignment-4-a-repro`. 복제본 HEAD와 AI A 코드 스냅샷은 위 버전 ID로 일치한다.

## 통과 검사

사전 고정한 `T05-AGE-CASES.json`의 `T05-AGE-01`부터 `T05-AGE-10`까지 10/10 PASS. 기존 프로젝트 검사도 11/11 PASS. 새 복제 폴더에서 같은 명령을 실행해 21/21 PASS.

## 남은 문제

판정 함수는 구현했지만 화면에는 아직 연결하지 않았다. 따라서 현재 UI는 오래된 원천 관측을 HTTP 조회 성공만으로 fresh처럼 표시할 수 있다. 수신 테스트/가상 fixture 동작은 이번 작업 범위에서 변경하지 않았다.

## 다음 행동

`app.js`의 실제 조회 성공 경로에서 `classifySourceAge(res.reading.source_time, res.reading.fetched_at)`를 호출한다. 결과가 stale이면 현재값은 보여 주되 `live-badge`와 설명 문구에 관측 나이와 오래된 관측 상태를 명확히 표시한다. unknown이면 정상 fresh로 표시하지 말고 시각 확인 불가를 설명한다. 고정 검사 10개를 변경 없이 다시 실행한다.

## 건드리지 말 것

- `T05-AGE-CASES.json`의 검사 ID·입력·기대값 및 API 규칙
- `contract/`, `fixtures/`, `data/records.json`의 제출 근거 원본과 실제 데이터
- 비밀값 검사 및 공개 개인정보/비밀값 정책
- 이번 개선과 무관한 조회·기록·합성 수신 동작

## 인수인계 동일성

AI B에 제공할 문서는 이 파일 그대로다. 대화 전문은 제공하지 않는다. A 단계 종료 시점에는 아직 AI B를 시작하지 않았다.
