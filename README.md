# 오더 세트 (Order Set)

[![CI](https://github.com/KINGJNU-sakayume/game6/actions/workflows/ci.yml/badge.svg)](https://github.com/KINGJNU-sakayume/game6/actions/workflows/ci.yml)

한 환자의 입원 경과를 끝까지 책임지는 의학 덱빌딩 로그라이크. 응급실 → 병동 → 중환자실의 임상 경로표를 따라가며, 진단 카드로 질병을 밝히고, 적응증·항생제 감수성·약물 상호작용을 따져 처방한다.

- 플레이(claude.ai 아티팩트): https://claude.ai/artifact/FYXQoyS9M8JZLScsfH7CjE (소유자에게 공유받은 사람만 열 수 있다)
- 플레이(GitHub Pages): https://kingjnu-sakayume.github.io/game6/ (아래 "GitHub Actions"의 Pages 설정을 켠 뒤부터)
- 오락용 게임이다. 수치와 효과는 실제 임상 판단의 근거가 아니다.

## 실행

```
npm install
npm run dev              # http://localhost:5173
npm test                 # 단위·시나리오·결정론·퍼즈·콘텐츠·구조 테스트
npm run build:artifact   # 배포용 단일 HTML → dist-artifact/order-set.html
```

그 밖의 명령(시뮬레이터, 재생 검증, 스크린숏)은 `docs/design.md` §7에 있다.

## GitHub Actions

`.github/workflows/ci.yml` 하나가 푸시·PR마다 돈다.

| 작업 | 내용 |
|---|---|
| 타입 검사 · 테스트 · 빌드 | `npm run typecheck`, `npm test`, 긴 퍼즈(무작위 봇 200판), 웹 빌드, 아티팩트용 단일 HTML. 단일 HTML은 실행 결과의 `order-set-html`로 받을 수 있다 |
| 브라우저 검사 | 러너의 Google Chrome으로 웹 빌드와 단일 HTML을 실제 클릭으로 한 판씩 진행하고(`scripts/ui-smoke.ts`), 모든 화면의 스크린숏을 찍는다(`scripts/screenshots.ts`). 페이지 오류가 나거나 전투에서 한 번도 못 이기면 실패한다. 스크린숏은 `screenshots`로 받는다 |
| GitHub Pages 배포 | 기본 브랜치에서 위 검사가 모두 통과하면 `dist/`를 Pages에 올린다 |

Pages 배포는 한 번 켜 줘야 한다: 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꾼 뒤, Actions 탭에서 CI를 다시 실행하거나 새로 푸시한다. 켜기 전에는 배포 작업이 안내만 남기고 건너뛴다(실패로 표시되지 않는다).

## 구조

| 폴더 | 내용 |
|---|---|
| `src/core` | 결정론적 규칙 엔진. `step(state, action) → { state, events }`. DOM·난수·시간에 기대지 않는다 |
| `src/content` | 카드 64장, 질병 27종, 상호작용 규칙, 유물, 이벤트 등 데이터 |
| `src/ui` | React 화면. 병원 서식·환자 모니터·판독 라이트박스를 시각 언어로 쓴다 |
| `src/sim` | 무작위·탐욕 봇, 밸런스 시뮬레이터, 재생 검증 |
| `tests` | 테스트. `tests/arch.test.ts`가 계층 경계를 검사한다 |
| `scripts` | 아티팩트 빌드, 스크린숏, 클릭 연기 검사, 문서용 표 생성 |

## 문서

- `docs/REVIEW.md` — 원 설계서(v1.0) 비판적 검토 40항목
- `docs/design.md` — 수정 설계서 v1.1 (규칙, 아키텍처, 콘텐츠 전체 목록)
- `docs/DECISIONS.md` — 구현하며 바꾸거나 새로 정한 것
- `docs/PROGRESS.md` — 마일스톤별 확인 결과
