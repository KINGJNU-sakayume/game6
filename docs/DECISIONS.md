# 구현 결정 기록

설계 문서(`docs/design.md`)에 없거나, 구현 중 바꾼 사항을 적는다. 형식: 날짜 · 무엇을 · 왜.

## 2026-09-30

- **설계 v1.1 확정.** 사용자 요청("먼저 비판적으로 검토해서 수정")에 따라 v1.0을 검토하고 고쳤다. 근거는 `docs/REVIEW.md`.
- **계층 경계는 ESLint 대신 테스트로 강제.** `tests/arch.test.ts`가 `src/core`, `src/content`, `src/ui`, `src/sim`의 import 문을 검사한다. 도구 사슬을 줄이고 같은 규칙을 지키기 위해서다.
- **React 18.3 + 클래식 JSX.** 배포용 단일 HTML에서 React를 cdnjs UMD로 불러오기 위해 React 19 대신 18.3.1을 쓴다.
