# 오더 세트 (Order Set, 가제) — 설계 문서 v1.0

> 의학 테마 덱빌딩 로그라이크. 개인 비상업 프로젝트.
> 이 문서는 구현 세션(AI 코딩 에이전트)이 **이 문서 하나만 보고** 구현을 시작할 수 있도록 작성되었다.

---

## 0. 구현 세션 작업 규칙

1. **이 문서가 단일 기준이다.** 설계를 바꿔야 할 이유가 생기면 바로 구현하지 않는다. `docs/DECISIONS.md`에 "제안: 무엇을, 왜"를 기록하고 사용자 확인을 받는다. 문서에 없는 세부 사항은 가장 단순한 쪽으로 정하고 같은 파일에 기록한다.
2. **마일스톤 순서를 지킨다** (§8). 마일스톤은 "테스트 통과 + 실행 확인 항목 전부 충족"일 때만 끝난다.
3. **core 금지 사항**: `Math.random`, `Date.now`/`new Date`, 게임 수치의 소수 연산(모든 게임 수치는 정수, 배율은 백분율 정수), DOM(Document Object Model, 문서 객체 모델) 접근, `ui/`·`sim/` import.
4. **의학 데이터 규칙**: 약물·질병·상호작용·부작용 정의에는 `medical` 필드가 필수다(§2 D1). 의학 사실이 확실하지 않으면 추측으로 채우지 말고 `fidelity: "unverified"`로 둔다. `npm run content:report`가 이 목록을 출력하고, 사용자(의대생)가 검증한다.
5. 코드 식별자는 영어, 화면 텍스트는 한국어를 쓴다. 약물·질병은 영문명을 함께 표시한다.
6. 커밋은 마일스톤 내 작업 단위로 한다. 각 마일스톤이 끝나면 `docs/PROGRESS.md`에 확인 결과를 적는다.

---

## 1. 게임 개요

- **한 런 = 한 환자.** 환자의 **활력**이 플레이어 체력이다. 질병이 적이다.
- **3막 구조**
  - 1막 응급실: 8층, 보스는 당뇨병성 케톤산증(DKA, Diabetic Ketoacidosis)
  - 2막 병동: 10층, 관문 정예는 대량 상부위장관 출혈
  - 3막 중환자실(ICU, Intensive Care Unit): 10층, 최종 보스는 패혈성 쇼크
  - v1의 보스 목표는 2종이다. 그래서 2막 끝은 보스 대신 "관문 정예"로 둔다. v2에서 병동 보스를 추가한다.
- **카드 4종**
  - 처치: 시술과 행위
  - 약물: 강력하다. 투여 중 상태와 상호작용, 부작용 카드가 따른다.
  - 진단: 숨겨진 정보를 공개하고 표적 치료를 연다.
  - 부작용: 저주·상태 카드 역할이다. 보상 풀에는 나오지 않는다.
- **핵심 긴장**
  1. 경험적 치료(지금 바로, 비효율적) vs 진단 후 표적 치료(템포 소모, 고효율)
  2. 약물의 힘 vs 부작용 카드와 위험 상호작용
  3. 같은 계열을 반복하면 쌓이는 획득 내성 vs 약물 계열 순환

---

## 2. 확정된 설계 결정 (D1–D8)

### D1. 의학 정확성 수준

| 선택지 | 장점 | 단점 |
|---|---|---|
| A. 재미 우선 (이름만 의학) | 설계가 자유롭다 | 테마가 얇다. 의학 지식이 플레이에 도움이 안 된다 |
| B. 정확성 우선 (시뮬레이터) | 교육적이다 | 수치가 복잡하다. 카드 게임의 명료함이 깨진다 |
| **C. 방향은 정확, 크기는 게임적** | 의학 지식이 곧 실력이 된다. 수치는 자유롭다 | 경계 판단이 필요하다 → `fidelity` 태그로 해결 |

**결정: C.** 규칙은 다음과 같다.

1. **방향은 정확하게 맞춘다.** 효과의 방향(개선/악화), 적응증과 질병의 관계, 대표 부작용, 상호작용이 존재하는지 여부는 실제와 일치시킨다.
2. **크기는 추상화한다.** 용량, 시간, 확률은 게임 수치로 둔다. 화면에 실제 용량 단위(mg, mEq 등)를 표시하지 않는다. 임상 참고 자료처럼 보이면 안 된다.
3. **단순화와 과장은 허용하고, 반대 방향은 금지한다.** 예를 들어 "인슐린이 칼륨을 올린다"처럼 방향이 틀린 효과는 금지다. 반감기를 턴 수로 압축하는 과장은 허용한다.
4. 모든 의학 데이터에 다음 필드를 둔다.
   ```ts
   medical: { fidelity: "accurate" | "simplified" | "stylized" | "unverified"; note: string }
   ```
   - `accurate`: 방향과 관계가 실제와 같다
   - `simplified`: 예외나 조건을 생략했다
   - `stylized`: 게임을 위해 의도적으로 비틀었다. `note`에 무엇을 비틀었는지 쓴다
   - `unverified`: 사용자 검증 대기
5. 타이틀 화면에 고지한다: "오락용 게임입니다. 수치와 효과는 실제 임상 판단의 근거가 아닙니다."

---

### D2. 핵심 자원

| 자원 | 소유 | 범위 | 규칙 |
|---|---|---|---|
| **활력** (Vitality) | 환자 | 런 전체 | 플레이어 체력. 시작값·최대값 70. 0이 되면 사망하고 런이 끝난다 |
| **안정화** (Stability) | 환자·적 | 한 턴 | 방어도. 들어오는 피해를 먼저 흡수한다. 소유자의 턴이 시작될 때 0이 된다 |
| **오더** (Orders) | 환자 | 한 턴 | 에너지. 매 플레이어 턴 3. 쓰지 않은 오더는 사라진다 |
| **중증도** (Severity) | 질병 | 전투 | 적 체력. 0이 되면 "치료" 처리된다. 질병의 "진행" 행동으로 회복하지만 최대치를 넘지 않는다 |
| **진단 포인트** | 질병별 | 전투 | 누적되면 지식 단계가 오른다 (D3) |
| **획득 내성** (Acquired Resistance) | 질병별·태그별 | 전투 | 같은 약물 계열로 반복 공격받으면 쌓인다 (아래 식) |

- 상태 효과(버프·디버프)는 별도 시스템이다 (§5.6).
- 드로우는 턴당 5장, 손패 최대 10장.

**기각한 안: 환자 측 "약물 부담" 게이지.**
약물 사용의 환자 측 비용은 이미 부작용 카드가 표현한다. 같은 행동에 비용을 두 번 매기면 약물 덱이 이중으로 처벌받고, 화면 정보량만 늘어난다. 초안의 "내성 누적치"는 질병 측 **획득 내성**으로 구현한다.

#### 획득 내성 배율 유도

기호 정의:
- `n` = 대상 질병이 이 카드의 내성 태그에 대해 쌓은 내성 스택 수 (카드가 내성 태그를 여러 개 가지면 그중 최댓값)
- `r(n)` = 내성 배율 (백분율 정수)

1단계. 스택 하나당 효과를 20%p씩 깎는다: `100 − 20n`
2단계. 완전히 무력화되지 않도록 하한을 40으로 둔다: `r(n) = max(40, 100 − 20n)`
3단계. 값을 확인한다: n=0 → 100, n=1 → 80, n=2 → 60, n≥3 → 40

- 내성은 질병 정의의 `acquiredResistance.tags`에 있는 태그에만 쌓인다. 주로 감염 질환의 항생제 계열 태그(`beta_lactam`, `carbapenem`, `fluoroquinolone` 등)이다.
- 공격이 적중해 피해가 1 이상 들어가면, 해당 태그마다 스택이 +1 된다. 기본 증가량 1이고, 유물로 조절한다.
- 결과: 같은 계열만 반복하면 약해진다. 계열 순환과 표적 치료가 보상받는다.

---

### D3. 은닉 정보와 진단

**원칙: "물리 법칙은 항상 적용되고, 정보만 숨겨진다."** 질병의 약점과 저항은 진단 여부와 상관없이 실제로 작동한다. 진단은 (1) 그 정보를 보여 주고 (2) `표적` 키워드 카드의 보너스를 연다.

#### 지식 단계

| 단계 | 조건 | 화면에 보이는 것 |
|---|---|---|
| 0 미진단 | 시작 상태 | **증상 가명**(예: "발열과 기침"), 중증도, 이번 턴 의도(종류와 수치), 합병증 카운트다운의 남은 턴(내용은 "?") |
| 1 감별 | 진단 포인트 ≥ `partialAt` | 질병 **분류**(감염/대사/심혈관/혈전/호흡/신경/출혈), **효과 표**(약점·저항·무효·유해 태그), 합병증 카운트다운의 내용 |
| 2 확진 | 진단 포인트 ≥ `confirmAt` | **실제 질병명**, 패시브, **다음 턴 의도까지 2개**, 숨겨진 변이(예: 원인균), `표적` 보너스 활성화 |

- 기본 임계값은 `partialAt = 2`, `confirmAt = 4`이다. 비전형 질병은 +1~2.
- **표적 키워드**: 확진된 대상에게 이 카드의 피해 배율 `t = 150`. 그 외에는 `t = 100`.
- **지연 진단**: 배양 검사처럼 결과가 늦게 나오는 카드는 `delay` 명령으로 N턴 뒤 진단 포인트를 준다.
- **증례집**: 한 런에서 확진한 질병을 다시 만나면 1단계(감별)에서 시작한다. 메타 진행(런을 넘는 영구 해금)은 v1에 없다.
- **오진의 대가**: 무효 태그로 공격하면 피해는 0이고 부작용 카드는 그대로 생긴다. 유해 태그로 공격하면 질병이 회복된다(§4.3). 미진단 상태의 경험적 치료가 도박이 되는 이유다.

#### 진단 카드 가치 기준
진단 포인트 1 = 2V (가치 단위, D4 참조). 진단 카드는 대부분 소량의 안정화나 드로우를 함께 줘서 "세금 카드"가 되지 않게 한다.

---

### D4. 부작용 카드 규칙

**결정: 약물별 고정 부작용.** 확률로 부작용이 생기면 결과를 예측할 수 없어 실력이 드러나지 않는다. 슬레이 더 스파이어처럼 무작위성은 드로우에만 두고, 결과는 결정적으로 둔다.

1. 모든 약물 카드는 카드 텍스트에 부작용을 **명시**한다: `sideEffects: [{ card, count, dest }]`
2. **들어가는 위치(dest)**
   - `discard` 버린 카드 더미 — 기본값. 다음 셔플 이후 "섞여 들어온다"
   - `draw_random` 뽑을 더미의 무작위 위치
   - `hand` 손패 — 가득 차 있으면 버린 카드 더미로
3. **수명**
   - 기본은 **전투 한정**이다. 전투가 끝나면 덱에서 사라진다.
   - `persistent` 키워드가 붙으면 런 덱에 남는다. 희귀 약물이나 위험 상호작용에만 쓴다.
4. **부작용 카드 행동 키워드**
   - `unplayable` 사용 불가 (손패를 막는다)
   - `end_of_turn_in_hand` 턴 종료 시 손에 있으면 효과가 발동한다 (예: 활력 −2)
   - `on_draw` 뽑을 때 효과가 발동한다
   - `ethereal` 턴 종료 시 손에 있으면 소진된다
   - `purgeable(cost)` 오더를 내고 사용해 소진할 수 있다
5. **처리 수단** (카드 풀과 유물에 반드시 포함한다)
   - 대증 치료: 손의 부작용 카드 1장 소진 + 1장 드로우
   - 온단세트론: 오심 카드 전부 소진
   - 날록손: 오피오이드 관련 부작용 전부 소진
   - 투석: 신독성 계열 카드 소진, 투여 중 약물 전부 제거
   - 당직실(휴식처)의 "부작용 정리": 지속 부작용 카드 1장 제거
   - 유물 "투약 5R 원칙"

#### 가치 예산 유도

기호 정의:
- `V` = 가치 단위. 1V는 대략 "중증도 1 감소"나 "안정화 1"과 같다
- `E` = 카드 비용 (오더)
- `b` = 희귀도 보너스
- `x` = 소진 보정
- `s` = 부작용 보정

1단계. 오더 1의 가치를 7V로 정한다. 슬레이 더 스파이어의 기본 타격(1에너지, 6피해)보다 약간 높은 기준이다. 0비용 카드의 기본 예산은 3V로 둔다.
2단계. 희귀도 보너스: 일반 `b=0`, 고급 `b=2`, 희귀 `b=5`.
3단계. 한 번 쓰고 사라지는 카드(소진)는 `x=3`, 아니면 `x=0`.
4단계. 부작용은 카드가 감수하는 손해이므로 그만큼 예산을 더해 준다. 부작용 카드 1장당:
   - `discard` +3V
   - `draw_random` +4V
   - `hand` +5V
   - `persistent` +10V
   이 값들의 합이 `s`다.
5단계. 카드의 목표 예산: `V_target = 7E + b + x + s` (0비용은 `7E` 대신 3)

**환산표** (시뮬레이션으로 보정할 초기값):

| 항목 | 가치 |
|---|---|
| 단일 대상 피해 1 | 1V |
| 전체 대상 피해 1 | 1.5V |
| 안정화 1 | 1V |
| 드로우 1 | 3V |
| 오더 +1 | 7V |
| 진단 포인트 1 | 2V |
| 취약·약화 1턴 | 3V |
| 활력 회복 1 | 1.5V |

예시. 겐타마이신(일반, 1오더, 부작용 "신독성" 1장을 버린 카드 더미로):
- `E=1`, `b=0`, `x=0`, `s=3`
- `V_target = 7×1 + 0 + 0 + 3 = 10`
- 따라서 중증도 감소 10.

**희귀도별 부작용 상한**
- 일반 약물: `discard` 1장
- 고급 약물: `draw_random` 1장 또는 `discard` 2장
- 희귀 약물: `hand` 1장 또는 `persistent` 1장

---

### D5. 약물 상호작용

#### 쌍(pair) 단위를 기각한 이유

기호 정의:
- `n` = 약물 카드 수
- `P` = 정의해야 할 서로 다른 약물 쌍의 수

1단계. 두 약물을 순서 없이 고르는 경우의 수이므로 `P = n(n−1)/2`
2단계. v1의 약물 수 `n = 26`을 넣는다: `P = 26 × 25 / 2 = 325`

325쌍을 직접 정의할 수는 없다. 대부분은 "상호작용 없음"이기도 하다. 그래서 **기전·계열 태그 단위 규칙**으로 정의한다. 실제 약리도 이렇게 생각한다(QT 연장끼리, CYP3A4 억제제와 기질 등). 특정 약물 쌍에만 해당하는 규칙은 태그 대신 카드 ID로 쓰는 예외로만 둔다.

#### 투여 중 약물 모델
- 약물 카드를 쓰면 환자에게 **투여 중 약물**(`ActiveDrug`)이 등록된다. `halfLife` 턴 동안 유지된다. 반감기를 턴으로 압축한 것이다(`stylized`).
- 지속 시간은 **플레이어 턴 종료 시** 1씩 줄어든다.
  - `halfLife 1`: 이번 턴만 유지
  - `halfLife 2`: 기본값. 이번 턴과 다음 턴
  - 최대 4
- 투여 중인 약물을 **재투여**하면 지속 시간만 갱신된다. 새로 등록되지 않으므로 자기 자신과는 상호작용하지 않는다.
- 약물은 투여 중인 동안 `whileActive` 트리거를 가질 수 있다(예: 노르에피네프린은 턴 시작 시 안정화 4).
- 상호작용 판정은 **새로 투여된 약물 × 이미 투여 중인 약물**로 한다.

#### 규칙 구조

```ts
interface InteractionRule {
  id: string;
  kind: "synergy" | "hazard" | "antagonism";
  // 새 약물(incoming)과 투여 중 약물(active)의 조건.
  // symmetric=true면 역할을 바꿔서도 검사한다.
  incoming: TagQuery;              // { all?: Tag[]; any?: Tag[]; cardId?: CardId }
  active?: TagQuery;               // 생략하면 단독 규칙(투여 중 약물 없이 incoming만으로 판정)
  symmetric: boolean;
  condition?: Condition;           // 추가 조건 (예: 특정 태그 약물이 투여 중이 아님)
  priority: number;                // 낮을수록 먼저 실행
  overrides?: string[];            // 이 규칙이 발동하면 무효화되는 규칙 ID (쌍 단위 예외용)
  effects: EffectOp[];
  text: string;                    // 화면 경고 문구
  medical: MedicalNote;
}
```

#### 해석 알고리즘
1. 약물 카드 `c`를 쓴다 → `administer`(투여 등록 또는 갱신)
2. 투여 중 약물 `a`마다(`a ≠ c`, 등록 순서대로), 모든 규칙 `R`에 대해 `(incoming=c, active=a)`가 맞는지 확인한다. `symmetric`이면 `(incoming=a, active=c)`도 확인한다. 단독 규칙은 `c`만으로 한 번 확인한다.
3. 하나의 투여에서 **같은 규칙은 최대 1회** 발동한다.
4. 발동한 규칙의 `overrides` 대상을 제거한다.
5. `priority` 오름차순, 같으면 `id` 사전순으로 효과를 큐에 넣는다. 이 효과들은 **카드 자신의 효과보다 먼저** 처리된다. 그래야 시너지의 `modify_current`(이번 카드 배율)가 카드 피해에 적용된다.

#### DUR 경고 표시
DUR(Drug Utilization Review, 의약품 안심 서비스)을 본떠, 손패의 약물 카드에 마우스를 올리면 **지금 쓰면 발동할 규칙**을 미리 보여 준다. core에 `previewInteractions(state, cardUid)`를 두고 UI가 호출한다. 숨겨진 함정으로 처벌하지 않는다. 상호작용 관리가 **실력**이 되어야 한다.

#### v1 규칙 목록 (13개)

QT 간격은 심전도에서 Q파 시작부터 T파 끝까지의 구간이다. CYP3A4는 Cytochrome P450 3A4(사이토크롬 P450 3A4)의 약자다.

| ID | 종류 | 조건 | 효과 | fidelity |
|---|---|---|---|---|
| H1 | 위험 | `qt_prolong` + `qt_prolong` (대칭) | 손에 "부정맥" 1장 | accurate |
| H2 | 위험 | `k_lowering` + `qt_prolong` (대칭) | 뽑을 더미에 "부정맥" 1장 | accurate (저칼륨혈증은 QT 위험을 키운다) |
| H3 | 위험 | `k_lowering` + `k_lowering` (대칭) | 손에 "저칼륨혈증" 1장 | simplified |
| H4 | 위험 | 들어옴 `cyp3a4_substrate`, 투여 중 `cyp3a4_inhibitor` | 이번 카드 배율 150 + 이 카드의 부작용 1회 추가 | simplified |
| H4b | 위험 | 들어옴 `cyp3a4_inhibitor`, 투여 중 `cyp3a4_substrate` | 기질 약물 지속 +1, 기질의 부작용 카드 1장 추가 | simplified |
| H5 | 위험 | `cns_depressant` + `cns_depressant` (대칭) | 손에 "호흡억제" 1장 | accurate |
| H6 | 위험 | `nephrotoxic` + `nephrotoxic` (대칭) | 버린 카드 더미에 "신독성" 2장 | accurate |
| H7 | 위험 | `anticoagulant` + `antiplatelet` (대칭) | 환자에게 "출혈 경향" 상태 (둘 다 투여 중인 동안 턴 시작 시 활력 −2) | accurate |
| H8 | 위험 | 단독: 들어옴 `insulin`, 조건: `k_raising` 투여 중 아님 | 손에 "저칼륨혈증" 1장 | accurate |
| S1 | 시너지 | `beta_lactam` + `aminoglycoside` (대칭) | 이번 카드 배율 150 | simplified (균종 조건 생략) |
| S2 | 시너지 | 들어옴 `vasopressor`, 투여 중 `fluid` | 안정화 8 | simplified (수액 우선 원칙) |
| S3 | 시너지 | `anticoagulant` + `antiplatelet` (대칭), 조건: 대상 분류 `thrombotic` | 이번 카드 배율 150 | simplified |
| S4 | 시너지 | 들어옴 `insulin`, 투여 중 `glucose` | 이번 카드의 "저혈당" 부작용 생성 억제 | simplified |
| A1 | 길항 | 들어옴 `opioid_antagonist`, 투여 중 `opioid` | 오피오이드 투여 종료, 손·버린 카드 더미의 호흡억제·과진정 전부 소진 | accurate |

H7과 S3가 같은 조합에서 함께 발동하는 것은 의도된 양날의 검이다.

---

### D6. 카드 효과 명령 집합

#### 원칙
1. **작은 명령 집합 + 탈출구.** 명령은 약 25개로 한다. 거기서 표현할 수 없는 카드는 `custom`(코드에 등록된 이름 붙은 효과)으로 처리한다. `custom`이 콘텐츠의 10%를 넘으면 명령 추가를 검토한다.
2. **코드 어휘는 범용 게임 용어**(damage, block, draw)로, **화면 어휘는 의학 용어**(중증도 감소, 안정화)로 쓴다.
3. 카드, 유물, 상태, 질병의 행동, 상호작용 규칙이 **모두 같은 명령 집합**을 쓴다.
4. 콘텐츠는 JSON이 아니라 **TypeScript(타입스크립트) 데이터 파일**(`satisfies CardDef[]`)로 둔다. 목표를 "코드 수정 없이"에서 "**로직 수정 없이** 콘텐츠 추가"로 바꾼다. 타입 검사가 오타와 잘못된 명령을 컴파일 시점에 잡아 준다.
5. 카드 설명문은 명령에서 **자동 생성**한다. `textOverride`는 예외로만 쓴다.

#### 대상 선택자
`patient` · `target`(플레이어가 고른 적) · `all_enemies` · `random_enemy` · `self`(효과의 주인: 질병 행동이면 그 질병) · `source`

#### 명령 목록

| 명령 | 매개변수 | 비고 |
|---|---|---|
| `damage` | amount, target, tags? | 피해 계산 파이프라인(§4.3)을 거친다. 태그 기본값은 카드 태그 |
| `lose_vitality` | amount | 안정화를 무시하는 직접 손실 |
| `heal` | amount, target | 환자는 활력, 적은 중증도 회복 |
| `gain_stability` | amount, target | |
| `gain_orders` | amount | |
| `draw` | amount | |
| `discard` | amount, mode: choose/random | choose면 대기 선택 상태 생성 |
| `exhaust` | from: hand/discard/draw, filter, amount 또는 "all", mode | |
| `add_card` | cardId, count, dest, upgraded? | |
| `remove_from_deck` | filter, mode | 런 덱. 상점·휴식처용 |
| `apply_status` | statusId, stacks, target | |
| `remove_status` | statusId, target, stacks 또는 "all" | |
| `diagnose` | points, target | |
| `modify_resistance` | tag 또는 "all", delta, target | |
| `end_drug` | filter(태그/ID) | 투여 종료 |
| `extend_drug` | filter, turns | |
| `modify_current` | pct | 지금 처리 중인 카드의 피해·안정화 배율 |
| `suppress_side_effects` | — | 지금 처리 중인 카드의 부작용 생성 억제 |
| `cost_modifier` | filter, delta, uses | 다음 N장의 비용 조정 |
| `upgrade_card` | from, mode | |
| `gain_gold` | amount | 런 자원 |
| `repeat` | times, effects | |
| `if` | condition, then, else? | |
| `delay` | turns, effects | 플레이어 턴 시작 시 틱 |
| `select_cards` | from, filter, min, max, then | 대기 선택 상태. 선택 결과를 `then`에 바인딩 |
| `custom` | id, params | 코드 등록 효과 |

#### 값 표현 (ValueExpr)
```ts
type ValueExpr =
  | number
  | { x: true }                                     // X비용 카드의 지불 오더
  | { ref: CountRef; of?: TargetSel; status?: StatusId }
  | { add: [ValueExpr, ValueExpr] }
  | { mul: [ValueExpr, ValueExpr] };
type CountRef = "hand_size" | "active_drug_count" | "exhaust_count" | "cards_played_this_turn"
  | "drugs_played_this_turn" | "status_stacks" | "knowledge_level" | "side_effects_in_hand";
```

#### 조건 (Condition)
```ts
type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { knowledgeAtLeast: { target: TargetSel; level: 0 | 1 | 2 } }
  | { hasStatus: { target: TargetSel; status: StatusId; min?: number } }
  | { activeDrugTag: Tag }
  | { targetCategory: DiseaseCategory }
  | { vitalityBelowPct: number } | { severityBelowPct: { target: TargetSel; pct: number } }
  | { countAtLeast: { ref: CountRef; n: number } };
```

---

### D7. 지도, 보상, 유물의 진행 구조

#### 막 구성
| 막 | 층 수 | 끝 | 고정 층 |
|---|---|---|---|
| 1 응급실 | 8 | 보스: DKA | 1층 전투, 4층 보물, 8층 휴식 |
| 2 병동 | 10 | 관문 정예: 대량 상부위장관 출혈 | 1층 전투, 5층 보물, 10층 휴식 |
| 3 중환자실 | 10 | 최종 보스: 패혈성 쇼크 | 1층 전투, 5층 보물, 10층 휴식 |

막을 넘어갈 때 활력 30%를 회복한다(전원·전동 처리).

#### 지도 생성 알고리즘
지도는 DAG(Directed Acyclic Graph, 방향 비순환 그래프)이다. 폭 7열, 층 수 `L`.

1. 1층에서 서로 다른 시작 열을 가능하면 겹치지 않게 골라 경로 6개를 만든다(`map` 난수 스트림).
2. 각 경로는 층마다 열을 −1, 0, +1 중 하나로 이동한다. 격자 경계 안에서만.
3. **교차 금지**: 같은 층 사이에서 두 간선이 서로 엇갈리면 그 이동을 다시 뽑는다.
4. 경로가 지나간 칸만 노드가 된다. 같은 칸을 지나는 경로는 합쳐진다.
5. 고정 층에 노드 종류를 배정한다.
6. 나머지 노드에 가중치 추첨으로 종류를 배정한다.
   - 전투 50, 이벤트 15, 휴식 12, 정예 10, 상점 8, 보물 5
7. 제약을 위반하면 해당 노드만 다시 뽑는다(최대 20회, 그래도 실패하면 전투).
   - 정예와 휴식은 막의 4층 미만에 올 수 없다
   - 한 경로에서 정예·휴식·상점이 연속으로 오지 않는다
   - 한 노드의 자식 노드들은 서로 종류가 달라야 한다(자식이 2개 이상일 때)
   - 마지막 휴식 층의 직전 층에는 휴식이 오지 않는다

#### 노드 종류
| 노드 | 이름 | 내용 |
|---|---|---|
| 전투 | 환자 | 막별 인카운터 풀. 막의 첫 2전투는 "쉬움" 풀. 직전과 같은 인카운터 금지 |
| 정예 | 중증 환자 | 정예 풀. 보상에 유물 포함 |
| 휴식 | 당직실 | 택 1: 휴식(최대 활력 30% 회복) / 처방 최적화(카드 1장 업그레이드) / 부작용 정리(지속 부작용 카드 1장 제거) |
| 상점 | 약제부 | 카드 5장, 유물 2개, 카드 제거 |
| 보물 | 가이드라인 개정 | 유물 1개 |
| 이벤트 | 회진 | v1 이벤트 4종 (§7.6) |

#### 보상
- **예산(골드)**: 일반 전투 10–20, 정예 25–35, 보스 70. 시작 예산 99.
- **카드 보상**: 3장 중 1장 선택 또는 건너뛰기.
  - 희귀도 기본 확률: 일반 60 / 고급 37 / 희귀 3 (정수 가중치)
  - **희귀 보정**: 희귀 확률 = `min(40, 3 + p)`. `p`는 마지막 희귀 카드 이후 보여 준 일반 카드 수. 희귀가 나오면 `p = 0`
  - 정예는 희귀 기본 10. 보스 보상은 전부 희귀.
- **상점 가격**: 일반 50 / 고급 75 / 희귀 150 (±10%, `shop` 스트림). 유물 150–250. 카드 제거 75에서 시작해 사용할 때마다 +25.
- **업그레이드**: 모든 카드 정의에 `upgrade` 차이값을 둔다. 화면에는 "최적화 처방"으로, 이름 뒤에 `+`를 붙여 표시한다.

#### 유물(가이드라인) 희귀도
시작 1 / 일반 6 / 고급 5 / 보스 3 = 15개. 획득 가중치는 일반 50 / 고급 33. 희귀 등급은 v1에서 비운다. 보스 유물은 보스 보상에서만 3개 중 1개를 고른다.

---

### D8. 자동 시뮬레이션 밸런스 검증

#### 봇
1. **무작위 봇**: 합법 행동 중 무작위(`sim` 전용 스트림). 크래시와 불변식 위반 탐지용이고, 실력 격차 기준선이다.
2. **탐욕 봇**: 한 턴 안에서 가능한 카드 사용 순서를 깊이 우선으로 탐색한다(노드 상한 2,000). 각 종료 상태를 점수 함수로 평가해 최선의 순서를 실행한다.

탐욕 봇 점수 함수 유도:

기호 정의:
- `ΔS` = 이번 턴에 줄인 적 중증도의 합
- `I` = 이번 적 턴에 들어올 예고 피해의 합 (의도 기준)
- `B` = 턴 종료 시 환자의 안정화
- `L` = 예상 활력 손실
- `K` = 이번 턴에 새로 생긴 부작용 카드 수
- `D` = 이번 턴에 얻은 진단 포인트
- `W` = 이번 턴에 치료(중증도 0)한 적의 수

1단계. 예상 손실은 들어오는 피해에서 안정화로 막는 만큼을 뺀 것이다: `L = max(0, I − B)`
2단계. 활력 1은 중증도 1보다 귀하다(런 전체 자원이므로). 가중치 2를 준다.
3단계. 부작용 카드는 앞으로 한 번 이상 손패를 막는다. 가치표의 `discard` 부작용 기준 3V를 가중치로 쓴다.
4단계. 점수: `score = ΔS − 2L − 3K + 2D + 20W`
   - 치료된 적의 이번 턴 예고 피해는 `I`에서 뺀다.

카드 보상은 "현재 덱에 넣었을 때 고정 시드 20전투의 평균 점수 향상"이 가장 큰 카드를 고른다. 느리면 가치 예산 순위로 대체한다.

#### 실험 종류
1. **전투 실험**: 고정 덱 × 고정 인카운터 × N 시드 → 승률, 소요 턴, 활력 손실, 부작용 카드 수, 발동한 상호작용
2. **카드 가치 실험 (절제 비교)**: 카드 `c`의 기여도를 잰다
3. **런 실험**: 탐욕 봇 전체 런 N회 → 막별 도달률, 사망 원인 질병, 최종 승률

#### 카드 가치 추정 식

기호 정의:
- `D0` = 기준 덱 (해당 막의 표준 덱, `sim/decks.ts`)
- `f` = 비교용 필러 카드 (예산 기준에 딱 맞는 "기준 처치" 카드)
- `L̄(D)` = 덱 `D`로 N 시드 전투를 했을 때의 평균 활력 손실
- `v(c)` = 카드 `c`의 기여도 (클수록 좋은 카드)

1단계. 필러를 넣은 덱과 `c`를 넣은 덱을 **같은 시드 집합**으로 돌린다(공통 난수 기법 — 두 덱의 운 차이가 상쇄되어 분산이 줄어든다).
2단계. `v(c) = L̄(D0 + f) − L̄(D0 + c)`. 활력을 덜 잃을수록 좋은 카드다.
3단계. 판정: `v(c)`가 전체 카드 중 상위 10% 또는 하위 10%이면 "조정 후보"로 보고서에 표시한다.

#### 필요 시행 수 N 유도

기호 정의:
- `σ` = 한 전투 활력 손실의 표준편차 (관측값, 초기 가정 6)
- `δ` = 구분하고 싶은 최소 차이 (활력 1)
- `N` = 각 덱의 시행 수

1단계. 평균 하나의 표준오차는 `σ/√N`이다.
2단계. 독립인 두 평균의 차이의 표준오차는 `√(σ²/N + σ²/N) = σ√(2/N)`이다.
3단계. 95% 신뢰 수준으로 `δ`를 구분하려면 `1.96 × σ√(2/N) ≤ δ`
4단계. `N`에 대해 정리하면 `N ≥ 2 × (1.96σ/δ)²`
5단계. `σ=6`, `δ=1`을 넣으면 `N ≥ 2 × (11.76)² = 2 × 138.3 ≈ 277`

따라서 기본 **N = 300**. 공통 난수를 쓰면 실제 필요한 수는 더 적지만, 보수적으로 300을 유지한다. 시뮬레이터는 실행 후 관측된 `σ`를 출력하고, `σ`가 가정보다 크면 경고한다.

#### 목표 범위 (탐욕 봇 기준, 초기값)
| 지표 | 목표 |
|---|---|
| 일반 전투 평균 활력 손실 | 1막 4–9 / 2막 7–13 / 3막 9–16 |
| 정예 전투 평균 활력 손실 | 12–22 |
| 보스 승률 (해당 막 표준 덱, 활력 최대) | 45–65% |
| 전체 런 승률 | 탐욕 봇 15–35%, 무작위 봇 < 2% |
| 약물 중심 덱의 전투당 부작용 카드 드로우 | 1.5–4 |
| 상호작용 규칙 발동 | 모든 규칙이 런 실험 중 1회 이상 발동 (죽은 규칙 탐지) |

#### 회귀 검사
`sim/baseline.json`에 주요 지표 스냅샷을 저장한다. `npm run sim:check`는 현재 지표가 스냅샷에서 크게 벗어나면(평균 ±2 표준오차) 경고한다. 의도한 변경이면 `npm run sim:baseline`으로 갱신하고, 변경 이유를 `DECISIONS.md`에 적는다.

---

## 3. 아키텍처

### 3.1 기술 스택
| 영역 | 선택 | 이유 |
|---|---|---|
| 언어 | TypeScript, `strict` + `noUncheckedIndexedAccess` | 콘텐츠 참조 오류를 컴파일 시점에 잡는다 |
| 빌드 | Vite | |
| UI | React | AI 구현 세션이 가장 익숙하다. 상태 관리 라이브러리는 쓰지 않는다 (§3.8) |
| 스타일 | 일반 CSS 모듈 | |
| 테스트 | Vitest | |
| 스크립트 실행 | `tsx` | 시뮬레이터 CLI(Command Line Interface, 명령줄 인터페이스) |
| 품질 | ESLint + `no-restricted-imports`로 계층 경계 강제 | |
| 저장 | 브라우저 로컬 저장소 + 디버그용 JSON(JavaScript Object Notation, 자바스크립트 객체 표기법) 내보내기 | |

### 3.2 폴더 구조
```
src/
  core/                    # 순수 로직. 외부 의존성 없음
    types.ts               # 모든 정의·상태 타입
    rng.ts                 # 난수 생성기, 스트림 파생
    step.ts                # 진입점: step(state, action) → { state, events }
    queue.ts               # 효과 큐 처리
    effects/               # 명령별 실행기 (파일당 1~3개 명령) + registry.ts
    values.ts              # ValueExpr 평가
    conditions.ts          # Condition 평가
    triggers.ts            # 트리거 수집·순서화
    combat/                # 턴 흐름, 피해 계산, 전투 시작·종료
    drugs.ts               # 투여 중 약물, 상호작용 해석, 미리보기
    diagnosis.ts           # 진단 포인트, 지식 단계, 표시용 정보 필터
    enemy-ai.ts            # 행동 선택, 의도 계산
    map/generate.ts
    rewards.ts, shop.ts, rest.ts, events.ts
    run.ts                 # 런 시작, 노드 이동, 막 전환
    describe.ts            # 명령 → 한국어 설명문
    invariants.ts          # 불변식 검사 (테스트·개발 모드에서 매 step 후 실행)
    content/registry.ts    # 콘텐츠 색인 + validateContent()
    custom/                # custom 효과 구현
  content/                 # 데이터만. core/types만 import 가능
    cards/  starter.ts diagnosis.ts procedures.ts drugs.ts side-effects.ts
    tags.ts statuses.ts interactions.ts relics.ts keywords.ts events.ts
    diseases/ act1.ts act2.ts act3.ts bosses.ts
    encounters.ts
  ui/                      # React. core의 공개 API만 사용
    controller.ts          # 상태 보관, dispatch, 저장
    screens/ Title Map Combat Reward Shop Rest Event Treasure DeckView Casebook GameOver
    components/
    debug/                 # ?debug=1 패널
  sim/                     # Node 전용. core + content 사용
    bots/ random.ts greedy.ts
    decks.ts               # 막별 표준 덱
    combat-sim.ts run-sim.ts card-value.ts report.ts replay.ts cli.ts
    baseline.json
tests/
  unit/ scenario/ fuzz/ determinism/ content/
docs/
  design.md (이 문서) DECISIONS.md PROGRESS.md
```

**의존 방향**: `content → core/types`, `core → (없음)`, `ui → core, content`, `sim → core, content`. ESLint로 강제한다.

### 3.3 core 공개 API
```ts
newRun(seed: string, options?: RunOptions): GameState
step(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
legalActions(state: GameState): Action[]           // 봇과 UI 활성화에 공용
previewInteractions(state: GameState, cardUid: Uid): InteractionPreview[]
visibleEnemyInfo(state: GameState, enemyUid: Uid): EnemyView   // 지식 단계로 필터링한 정보
describeCard(def: CardDef, upgraded: boolean): string
stateHash(state: GameState): string                 // 결정론 검사용
```
- `step`은 **입력 상태를 변경하지 않는다.** 내부에서 `structuredClone`한 뒤 복사본을 변경한다.
- **UI는 `EnemyView`만 사용하고 원본 적 상태의 숨겨진 필드를 읽지 않는다.** 디버그 패널만 예외다.

### 3.4 행동(Action)
```ts
type Action =
  | { type: "play_card"; cardUid: Uid; targetUid?: Uid; xValue?: number }
  | { type: "end_turn" }
  | { type: "choose_cards"; uids: Uid[] }            // 대기 선택 해소
  | { type: "move_map"; nodeId: string }
  | { type: "pick_reward"; index: number | "skip" }
  | { type: "shop_buy"; slot: string } | { type: "shop_remove"; cardUid: Uid } | { type: "leave" }
  | { type: "rest_choose"; option: "rest" | "upgrade" | "purge"; cardUid?: Uid }
  | { type: "event_choose"; optionId: string }
  | { type: "pick_relic"; index: number };
```
불법 행동이면 상태를 바꾸지 않고 `{ type: "action_rejected", reason }` 이벤트만 반환한다.

### 3.5 상태(GameState) 요약
```ts
interface GameState {
  schemaVersion: 1;
  seed: string;
  rng: Record<RngStream, RngState>;        // 런 수준 스트림
  phase: "map" | "combat" | "reward" | "shop" | "rest" | "event" | "treasure" | "boss_relic" | "gameover" | "victory";
  run: RunState;
  combat?: CombatState;
  pending?: PendingChoice;                 // 대기 중 플레이어 선택 (큐 정지 상태)
  nextUid: number;
  actionCount: number;
}
interface RunState {
  act: 1 | 2 | 3; floor: number; map: MapState; currentNode?: string;
  vitality: number; maxVitality: number; gold: number;
  deck: CardInstance[]; relics: RelicInstance[];
  casebook: Record<DiseaseId, "confirmed">;
  rarePity: number; shopRemovalCount: number;
  stats: RunStats;                          // 시뮬레이션 통계용 누적값
}
interface CombatState {
  turn: number; orders: number; ordersPerTurn: number; stability: number;
  drawPile: CardInstance[]; hand: CardInstance[]; discardPile: CardInstance[]; exhaustPile: CardInstance[];
  limbo: CardInstance[];                    // 처리 중인 카드
  enemies: EnemyState[];
  activeDrugs: ActiveDrug[];
  patientStatuses: StatusStack[];
  queue: QueuedEffect[];                    // 직렬화 가능해야 함
  delayed: DelayedEffect[];
  costModifiers: CostModifier[];
  current?: { cardUid: Uid; pct: number; suppressSideEffects: boolean };
  counters: { cardsPlayedThisTurn: number; drugsPlayedThisTurn: number; firstHazardUsed: boolean };
  rng: Record<CombatRngStream, RngState>;   // 전투 스트림 (층 단위 파생)
}
interface EnemyState {
  uid: Uid; diseaseId: DiseaseId; variantId?: string;
  severity: number; maxSeverity: number; stability: number;
  statuses: StatusStack[];
  knowledge: 0 | 1 | 2; diagnosisPoints: number;
  acquiredResistance: Record<Tag, number>;
  phase: number;
  ai: { history: MoveId[]; planned: MoveId[] };   // planned[0] = 이번 의도, planned[1] = 다음 의도
  countdowns: { moveId: MoveId; turnsLeft: number }[];
}
interface ActiveDrug { uid: Uid; cardId: CardId; tags: Tag[]; turnsLeft: number; }
```

### 3.6 난수 생성기
- 알고리즘: **sfc32** (32비트 정수 4개 상태). 시드 문자열은 `cyrb128`로 해시해 초기 상태를 만든다.
- **런 스트림**: `map`, `encounter`, `reward`, `shop`, `event`, `relic`. 시드 문자열 + `":"` + 스트림 이름으로 파생한다.
- **전투 스트림**: `shuffle`, `enemyAi`, `cardEffect`. 전투를 시작할 때 `seed:act:floor:스트림명`으로 **새로 파생**한다.
  → 앞선 전투의 셔플 횟수나 이벤트 선택이 이후 전투의 난수를 바꾸지 않는다. 같은 층의 전투는 같은 드로우 운을 받으므로 비교 실험도 쉬워진다.
- `sim` 전용 스트림은 봇 행동에만 쓰고 GameState에 넣지 않는다.
- 모든 스트림 상태는 GameState에 숫자로 저장되므로 저장·불러오기와 복제로 그대로 보존된다.

### 3.7 효과 처리 순서
**큐 규칙**: 큐에서 앞에서부터 꺼내 실행한다. 실행 중 발생한 **트리거 반응은 큐 맨 앞에** 삽입한다. 즉, 원인 효과 직후, 원래 남아 있던 효과들보다 먼저 처리된다. 한 `step`에서 큐 처리가 1,000회를 넘으면 오류를 던진다(무한 루프 방지).

**트리거 수집 순서**(같은 사건에 여러 반응이 있을 때): 유물(획득 순) → 환자 상태 → 투여 중 약물(등록 순) → 적(위치 순, 적마다 상태 순) → 손패의 부작용 카드(손 순서).

**카드 사용 순서** (`play_card`)
1. 검증: 비용(비용 수정자 반영), 대상, 사용 가능 여부
2. 오더 지불, 카드를 `limbo`로 이동, `current` 설정
3. 약물이면 `administer` → 상호작용 해석 → 발동 규칙의 효과를 큐에 추가
4. 카드 효과를 순서대로 큐에 추가
5. 약물이면 부작용 카드 추가 (`suppressSideEffects`면 생략)
6. `card_played` 트리거
7. 큐를 모두 비운다. 대기 선택이 생기면 정지하고 `choose_cards` 뒤에 재개한다
8. 카드를 버린 카드 더미로 보낸다(`exhaust` 키워드면 소진 더미). `current`를 해제한다

**턴 흐름**
- **플레이어 턴 시작**
  1. 안정화 0
  2. 오더를 `ordersPerTurn`으로
  3. `delayed` 틱
  4. 투여 중 약물의 `turn_start` 트리거
  5. 환자 상태의 `turn_start`
  6. 5장 드로우 (뽑을 더미가 비면 버린 카드 더미를 `shuffle` 스트림으로 섞어 채운다. 손이 10장이면 버린 카드 더미로)
  7. 유물 `turn_start`
- **플레이어 턴 종료** (`end_turn`)
  1. 손패의 `end_of_turn_in_hand` 발동
  2. `ethereal` 소진
  3. 보존 카드를 제외하고 손패를 버린다
  4. 투여 중 약물 지속 −1, 0이면 종료(`drug_expired` 이벤트)
  5. 환자 상태 지속 감소
- **적 턴**: 적마다 위치 순으로
  1. 안정화 0
  2. `planned[0]` 행동 실행
  3. 카운트다운 틱 (0이 되면 발동)
  4. 상태 지속 감소
  - 모든 적이 끝나면 각 적의 다음 의도를 계획한다(`enemyAi` 스트림)
- **전투 종료**: 모든 적의 중증도가 0이면 승리(보상 단계로), 활력이 0이면 즉시 게임 오버. 판정은 큐의 명령 하나가 끝날 때마다 한다.

### 3.8 UI 구조
- `controller.ts`: 현재 GameState를 보관한다. `dispatch(action)`이 `core.step`을 호출하고, 새 상태를 저장한 뒤 이벤트를 **애니메이션 큐**로 보낸다. React와의 연결은 `useSyncExternalStore`로 한다.
- 화면은 상태를 그대로 그린다. 애니메이션은 이벤트를 재생할 뿐 게임 결과를 바꾸지 않는다. M3에서는 애니메이션 없이 즉시 반영하고 M9에서 추가한다.
- **전투 화면 배치** (최소 1280×720)
  - 좌측: 환자(활력, 안정화, 상태, 투여 중 약물 목록과 남은 턴)
  - 우측: 적(가명 또는 진단명, 중증도 막대, 의도 아이콘과 수치, 지식 단계 게이지, 1단계 이상이면 효과 표)
  - 하단: 손패, 오더, 뽑을·버린·소진 더미 개수
  - 약물 카드에 마우스를 올리면 **DUR 경고 패널**이 뜬다
  - 우측 가장자리: 전투 로그(이벤트 목록의 텍스트 변환)
- 키워드 툴팁은 `content/keywords.ts`에서 가져온다.
- **디버그 패널** (`?debug=1`): 시드 지정, 카드 추가, 모든 정보 공개, 노드로 이동, 상태 JSON 내보내기와 불러오기.

### 3.9 저장
- 로컬 저장소 키 `orderset.save`: `{ schemaVersion, state, actionLog }`. 모든 `step` 뒤에 저장한다.
- 불러올 때 `schemaVersion`을 확인하고, 마이그레이션 함수 맵을 적용한다. 존재하지 않는 카드·유물 ID는 "폐기된 카드"·"폐기된 유물"로 바꾸고 경고를 표시한다.
- **내보내기**: `{ seed, actionLog, finalHash }`. `npm run replay 파일.json`은 시드부터 행동 로그를 재생해 `finalHash`와 일치하는지 확인한다.

### 3.10 콘텐츠 검증 (`validateContent`)
- ID 중복 없음
- 모든 참조가 존재함: 부작용 카드, 인카운터의 질병, 질병의 행동, 규칙의 태그, `custom` ID
- 모든 태그가 `content/tags.ts`에 선언됨
- 약물·질병·규칙·부작용 카드에 `medical` 필드가 있음
- 모든 카드의 `describeCard`가 성공함
- 약물 카드의 부작용 수가 희귀도별 상한(D4) 이내
- 카드 가치가 예산 ±30% 이내 (벗어나면 오류가 아니라 경고)
- `npm run content:report`: 희귀도·종류별 개수, fidelity별 목록(`unverified` 우선), `custom` 비율, 예산 이탈 카드

---

## 4. 데이터 스키마

### 4.1 카드
```ts
interface CardDef {
  id: CardId; nameKo: string; nameEn: string;
  kind: "procedure" | "drug" | "diagnostic" | "side_effect";
  rarity: "starter" | "common" | "uncommon" | "rare" | "special";
  cost: number | "X" | "unplayable";
  target: "enemy" | "none";
  tags: Tag[];                      // 피해 태그 기본값, 상호작용·효과 표 판정에 사용
  keywords?: Keyword[];             // exhaust, ethereal, retain, targeted, persistent, unplayable ...
  effects: EffectOp[];
  drug?: { halfLife: 1 | 2 | 3 | 4; whileActive?: TriggerDef[]; sideEffects: SideEffectSpec[] };
  sideEffectBehavior?: TriggerDef[];   // 부작용 카드 전용 (on_draw, end_of_turn_in_hand)
  purgeCost?: number;
  upgrade: Partial<Pick<CardDef, "cost" | "effects" | "keywords">> & { drug?: Partial<CardDef["drug"]> };
  textOverride?: string;
  medical?: MedicalNote;            // drug·side_effect는 필수
}
interface SideEffectSpec { card: CardId; count: number; dest: "discard" | "draw_random" | "hand" }
```

### 4.2 질병
```ts
interface DiseaseDef {
  id: DiseaseId; nameKo: string; nameEn: string;
  symptomAlias: string;                         // 0단계 표시명
  category: "infection" | "metabolic" | "cardiovascular" | "thrombotic" | "respiratory" | "neuro" | "bleeding" | "surgical";
  tier: "normal" | "elite" | "boss";
  severity: [number, number];                   // 시작 중증도 범위 (encounter 스트림)
  diagnosis: { partialAt: number; confirmAt: number };
  effectiveness: Partial<Record<Tag, "immune" | "resistant" | "weak" | "harmful">>;  // 없으면 normal
  acquiredResistance?: { tags: Tag[]; gainPerHit: number };
  passives?: TriggerDef[];
  variants?: { id: string; weight: number; nameKo: string; effectivenessOverride: DiseaseDef["effectiveness"] }[];
  phases?: { atSeverityPct: number; moves: MoveDef[]; onEnter: EffectOp[] }[];
  moves: MoveDef[];
  ai: AiPattern;
  medical: MedicalNote;
}
interface MoveDef {
  id: MoveId; nameKo: string;
  intent: { type: "attack" | "attack_multi" | "progress" | "debuff" | "defend" | "complication" | "unknown"; value?: ValueExpr; hits?: number };
  effects: EffectOp[];
  countdown?: number;                           // 합병증: 예고 후 N턴 뒤 발동
}
type AiPattern =
  | { type: "sequence"; order: MoveId[]; loop: boolean }
  | { type: "weighted"; weights: Record<MoveId, number>; noRepeat?: MoveId[]; maxInARow?: number }
  | { type: "conditional"; rules: { when: Condition; move: MoveId }[]; fallback: AiPattern };
```

### 4.3 피해 계산 파이프라인

기호 정의:
- `d0` = 명령의 기본 피해
- `a` = 공격자의 고정 가산 (질병 공격: "악화" 스택 / 플레이어: 유물 등의 가산)
- `e` = 효과 표 배율. 대상 질병의 `effectiveness`에서 이 피해의 태그와 맞는 항목들을 곱한다
  - 등급별 값: immune 0, resistant 50, normal 100, weak 150
- `t` = 표적 배율. `targeted` 카드이고 대상이 확진이면 150, 아니면 100
- `r` = 획득 내성 배율 (D2의 `r(n)`)
- `s` = 현재 카드 배율 (`current.pct`, 기본 100)
- `v` = 대상이 "취약"이면 150, 아니면 100
- `w` = 공격자가 "약화"면 75, 아니면 100

1단계. 가산: `d1 = max(0, d0 + a)`
2단계. **유해 판정**: 맞는 태그 중 하나라도 `harmful`이면 피해 대신 회복 처리한다. 대상 중증도를 `floor(d1 / 2)`만큼 회복시키고(`harmful_treatment` 이벤트) 끝낸다. 잘못된 치료가 질병을 악화시키는 것이다(예: 울혈성 심부전에 수액).
3단계. 효과 표 배율: 맞는 항목들의 값을 차례로 곱하고 100으로 나눈다. 맞는 항목이 없으면 `e = 100`.
   - 계산은 `e = 100`에서 시작해 맞는 항목마다 `e = floor(e × 값 / 100)`
   - 상한 200: `e = min(200, e)`
   - 예: 항생제 계열 normal × 베타락탐 immune → 0
4단계. 모든 배율을 한 번에 곱하고 마지막에 한 번만 내림한다.
   `d = floor( d1 × e × t × r × s × v × w / 100⁶ )`
   (최대값 추정: 50 × 200 × 150 × 100 × 150 × 150 × 100 ≈ 3.4 × 10¹³. JavaScript 안전 정수 범위 약 9 × 10¹⁵ 안에 있다)
5단계. 안정화 흡수: `absorbed = min(stability, d)`, 안정화 −= `absorbed`, 중증도(또는 활력) −= `d − absorbed`

질병이 환자를 공격할 때는 `e, t, r, s = 100`으로 두고 같은 파이프라인을 쓴다.

### 4.4 상태, 유물, 트리거
```ts
interface StatusDef {
  id: StatusId; nameKo: string; owner: "patient" | "enemy" | "both";
  stacking: "intensity" | "duration" | "both";
  decay: "none" | "turn_end" | "own_turn_end";
  triggers: TriggerDef[];
  medical?: MedicalNote;
}
interface RelicDef {
  id: RelicId; nameKo: string; nameEn?: string; tier: "starter" | "common" | "uncommon" | "boss";
  triggers: TriggerDef[];
  modifiers?: RelicModifier[];     // 상시 규칙 변경 (오더 +1, 보상 카드 수 등). 종류는 열거형으로 제한
  flavor: string;
}
interface TriggerDef {
  on: "combat_start" | "turn_start" | "turn_end" | "card_played" | "drug_administered" | "drug_expired"
    | "interaction_fired" | "damage_dealt" | "damage_taken" | "enemy_cured" | "knowledge_up"
    | "countdown_started" | "vitality_below" | "card_drawn" | "combat_end";
  condition?: Condition;
  effects: EffectOp[];
  oncePerCombat?: boolean;
}
```

### 4.5 이벤트(GameEvent) — UI 애니메이션, 로그, 통계 공용
`card_drawn`, `card_played`, `drug_administered`, `drug_expired`, `interaction_fired{ruleId, kind}`, `side_effect_added`, `damage{source, target, amount, absorbed}`, `harmful_treatment`, `stability_gained`, `status_applied`, `knowledge_up{level}`, `intent_set`, `countdown_tick`, `enemy_cured`, `patient_died`, `shuffle`, `reward_offered`, `action_rejected` 등. 모든 이벤트는 직렬화 가능한 평범한 객체다.

---

## 5. 콘텐츠 목록 (v1)

> 수치는 D4 예산 공식으로 1차 설정한 뒤 시뮬레이션으로 조정한다. 아래 표는 **정체성과 역할**을 고정하는 목록이다. 새 카드를 넣을 때도 같은 형식을 따른다.

### 5.1 시작 덱 (10장)과 시작 유물
| 카드 | 수 | 종류 | 효과 |
|---|---|---|---|
| 응급 처치 | 4 | 처치 | 1오더, 중증도 6 |
| 안정화 조치 | 4 | 처치 | 1오더, 안정화 5 |
| 병력 청취 | 1 | 진단 | 0오더, 진단 1, 드로우 1 |
| 아세트아미노펜 | 1 | 약물 (`analgesic`) | 1오더, 중증도 4 + 안정화 3, 반감기 2, 부작용 없음 |

시작 유물 **인턴 수첩**: 전투 시작 시 첫 번째 적 진단 +1.

### 5.2 카드 56장 (시작 카드 4종 제외)
희귀도 합계: 일반 31 / 고급 18 / 희귀 7.

**진단 (10)**
| 카드 | 희귀도 | 역할 |
|---|---|---|
| 신체 진찰 | 일반 | 진단 2 + 안정화 4 |
| 혈액 검사 | 일반 | 진단 2 + 드로우 1 |
| 소변 검사 | 일반 | 진단 1, 대상이 대사·신장 관련이면 +2 |
| 흉부 X선 | 일반 | 진단 2, 호흡기·심혈관이면 +1 |
| 심전도 | 일반 | 진단 2, 심혈관이면 이번 턴 다음 의도 공개 |
| 동맥혈 가스 분석 (ABGA, Arterial Blood Gas Analysis) | 일반 | 진단 2, 대상의 "산증" 스택 −2 |
| 배양 검사 | 고급 | 즉시 진단 1, 2턴 뒤 진단 4 (지연) |
| 현장 초음파 (POCUS, Point-of-Care Ultrasound) | 고급 | 0오더, 진단 2, 소진 |
| CT (Computed Tomography, 컴퓨터 단층촬영) | 고급 | 2오더, 모든 적 진단 3 |
| 조직 검사 | 희귀 | 즉시 확진, 이번 전투에서 그 대상에 대한 다음 표적 카드 배율 +50, 소진 |

**처치 (20)**
| 카드 | 희귀도 | 태그·역할 |
|---|---|---|
| 산소 투여 | 일반 | 안정화 7, 호흡기 질환 상대면 +3 |
| 기도 확보 | 일반 | 안정화 5 + 다음 턴 오더 +1 (2오더) |
| 배농 | 일반 | `procedure`, `surgical`: 중증도 8, 감염·외과 질환 상대 표적 |
| 압박 지혈 | 일반 | 안정화 6, 출혈 경향 상태 제거 |
| 정맥로 확보 | 일반 | 0오더, 다음 약물 비용 −1 |
| 흉부 압박 | 일반 | `cardiac`: 중증도 5 × 2회 |
| 회진 | 일반 | 드로우 2, 1장 버리기 |
| 대증 치료 | 일반 | 0오더, 손의 부작용 카드 1장 소진 + 드로우 1 |
| 격리 조치 | 일반 | 감염 질환 전체에 약화 2턴 |
| 제세동 | 고급 | `cardiac`: 중증도 18, 표적, 소진 |
| 중심정맥관 삽입 | 고급 | 지속 효과: 이번 전투 동안 약물 반감기 +1 |
| 기관 삽관 | 고급 | 안정화 14, 호흡기 질환에 표적 피해 8 |
| 흉관 삽입 | 고급 | `procedure`: 중증도 14, 흉부 질환 표적 |
| 수혈 | 고급 | 활력 8 회복, 출혈 질환에 중증도 10 |
| 협진 의뢰 | 고급 | 무작위 고급 카드 1장을 손에 (비용 0, 이번 턴), 소진 |
| 인계 | 고급 | 이번 턴 종료 시 손패 전부 보존 |
| 심낭 천자 | 희귀 | 중증도 30, 심장 눌림증 상대면 배율 200, 소진 |
| 투석 | 희귀 | 신독성·고칼륨혈증 부작용 전부 소진, 투여 중 약물 전부 종료, 안정화 10 |
| 신속대응팀 호출 | 희귀 | 드로우 4, 오더 +2, 소진 |
| 오더 세트 | 희귀 | 다음에 쓰는 약물 카드를 한 번 더 발동 (투여·상호작용 포함) |

**약물 (26)**
| 약물 | 희귀도 | 태그 | 반감기 | 부작용 |
|---|---|---|---|---|
| 세프트리악손 (ceftriaxone) | 일반 | `abx`, `beta_lactam` | 2 | 발진 → discard |
| 피페라실린-타조박탐 (piperacillin-tazobactam) | 고급 | `abx`, `beta_lactam`, `broad_spectrum` | 2 | 장내세균 교란 → draw_random |
| 메로페넴 (meropenem) | 희귀 | `abx`, `carbapenem`, `broad_spectrum` | 2 | 장내세균 교란 → hand |
| 반코마이신 (vancomycin) | 고급 | `abx`, `glycopeptide`, `anti_mrsa`, `nephrotoxic` | 3 | 신독성 → draw_random |
| 겐타마이신 (gentamicin) | 일반 | `abx`, `aminoglycoside`, `nephrotoxic` | 2 | 신독성 → discard |
| 레보플록사신 (levofloxacin) | 일반 | `abx`, `fluoroquinolone`, `qt_prolong` | 2 | 오심 → discard |
| 클래리스로마이신 (clarithromycin) | 일반 | `abx`, `macrolide`, `qt_prolong`, `cyp3a4_inhibitor` | 2 | 오심 → discard |
| 메트로니다졸 (metronidazole) | 일반 | `abx`, `anaerobe` | 2 | 오심 → discard |
| 노르에피네프린 (norepinephrine) | 고급 | `vasopressor` | 1 | 부정맥 → draw_random. 투여 중 턴 시작 시 안정화 4 |
| 에피네프린 (epinephrine) | 고급 | `vasopressor`, `anaphylaxis_tx` | 1 | 부정맥 → draw_random |
| 아미오다론 (amiodarone) | 희귀 | `antiarrhythmic`, `qt_prolong`, `cyp3a4_inhibitor` | 4 | 부정맥 → persistent |
| 헤파린 (heparin) | 일반 | `anticoagulant` | 2 | 출혈 → discard |
| 아스피린 (aspirin) | 일반 | `antiplatelet` | 3 | 출혈 → discard |
| 푸로세미드 (furosemide) | 일반 | `loop_diuretic`, `k_lowering` | 2 | 저칼륨혈증 → discard |
| 인슐린 (insulin) | 고급 | `insulin`, `k_lowering` | 2 | 저혈당 → draw_random |
| 염화칼륨 (potassium chloride) | 일반 | `k_raising`, `electrolyte` | 2 | 고칼륨혈증 → discard. 저칼륨혈증 카드 1장 소진 |
| 생리식염수 (normal saline) | 일반 | `fluid` | 2 | 없음 (대신 수치 낮게). 투여 중 턴 시작 시 안정화 2 |
| 포도당 (dextrose) | 일반 | `glucose` | 2 | 없음. 저혈당 카드 전부 소진 |
| 락툴로오스 (lactulose) | 일반 | `laxative`, `ammonia_lowering` | 2 | 오심 → discard |
| 모르핀 (morphine) | 고급 | `opioid`, `cns_depressant` | 2 | 호흡억제 → draw_random. 사용 시 활력 4 회복 |
| 미다졸람 (midazolam) | 일반 | `benzodiazepine`, `cns_depressant`, `cyp3a4_substrate` | 2 | 과진정 → discard |
| 할로페리돌 (haloperidol) | 일반 | `antipsychotic`, `qt_prolong` | 3 | 과진정 → discard |
| 온단세트론 (ondansetron) | 일반 | `antiemetic`, `qt_prolong` | 2 | 없음. 오심 카드 전부 소진 |
| 날록손 (naloxone) | 고급 | `opioid_antagonist` | 1 | 없음 (A1 규칙의 주체) |
| 메틸프레드니솔론 (methylprednisolone) | 고급 | `corticosteroid`, `immunosuppressive` | 3 | 면역억제 → draw_random |
| 살부타몰 (salbutamol) | 일반 | `beta2_agonist`, `k_lowering` | 1 | 없음 (H2·H3 경유 위험) |

MRSA는 Methicillin-Resistant *Staphylococcus aureus*(메티실린 내성 황색포도알균)이다.

### 5.3 부작용 카드 (13, 보상 풀 제외)
| 카드 | 행동 |
|---|---|
| 오심 | 사용 불가, `purgeable(1)` |
| 발진 | 사용 불가, `ethereal` |
| 신독성 | 사용 불가, 턴 종료 시 손에 있으면 활력 −2 |
| 저칼륨혈증 | 사용 불가, 손에 있는 동안 `qt_prolong` 약물 사용 시 손에 부정맥 1장 추가 |
| 고칼륨혈증 | 사용 불가, 턴 종료 시 손에 있으면 활력 −3 |
| 저혈당 | 뽑을 때 활력 −3, 사용 불가, `ethereal` |
| 호흡억제 | 뽑을 때 이번 턴 오더 −1, 사용 불가 |
| 과진정 | 사용 불가, 턴 종료 시 손에 있으면 다음 턴 드로우 −1 |
| 부정맥 | 사용 불가, 턴 종료 시 손에 있으면 활력 −4, `purgeable(2)` |
| 출혈 | 사용 불가, 턴 종료 시 손에 있으면 활력 −2 |
| 섬망 | 뽑을 때 손패 무작위 1장 버림 (`cardEffect` 스트림), 사용 불가 |
| 장내세균 교란 | 사용 불가. 손에 있는 동안 `abx` 카드 비용 +1 |
| 면역억제 | 사용 불가. 손에 있는 동안 감염 질환의 공격 +2 |

### 5.4 질병 20종
표기: 약점 = weak, 저항 = resistant, 무효 = immune, 유해 = harmful. 명시가 없는 태그는 normal이다.
감염이 아닌 질병은 기본적으로 `abx: immune`이다.

| # | 막 | 등급 | 질병 | 증상 가명 | 효과 표 요지 | 핵심 행동 |
|---|---|---|---|---|---|---|
| 1 | 1 | 일반 | 급성 충수염 | 우하복부 통증 | 약점 `surgical`, 항생제 normal | 합병증 카운트다운 3: "천공" (중증도 +15, 공격 +3 영구) |
| 2 | 1 | 일반 | 급성 위장염 | 구토와 설사 | 약점 `fluid`, 무효 `abx` | 공격 + 환자에 "탈수" (다음 턴 안정화 획득 −25%) |
| 3 | 1 | 일반 | 지역사회획득 폐렴 | 발열과 기침 | 약점 `beta_lactam`·`macrolide`, 획득 내성 | 공격, "염증" 누적 |
| 4 | 1 | 일반 | 급성 신우신염 | 발열과 옆구리 통증 | 약점 `beta_lactam`·`fluoroquinolone`, 획득 내성 | 공격 2회 |
| 5 | 1 | 일반 | 천식 급성 악화 | 쌕쌕거림 | 약점 `beta2_agonist`·`corticosteroid`, 무효 `abx` | 환자 안정화 제거 공격 |
| 6 | 1 | 일반 | 아나필락시스 | 두드러기와 저혈압 | 약점 `anaphylaxis_tx` (배율 합성 200), 그 외 저항 | 중증도 낮음, 카운트다운 2: 큰 공격 |
| 7 | 1 | 정예 | ST분절 상승 심근경색 (STEMI, ST-Elevation Myocardial Infarction) | 흉통 | 약점 `anticoagulant`·`antiplatelet`·`cardiac` | 체력 50% 이하에서 2단계 "심실세동" (제세동 표적) |
| 8 | 2 | 일반 | 봉와직염 | 붉게 부은 다리 | 약점 `beta_lactam`, 변이 MRSA (`beta_lactam` 무효, `anti_mrsa` 약점) | 공격, 염증 |
| 9 | 2 | 일반 | 심부정맥 혈전증 | 한쪽 다리 부종 | 약점 `anticoagulant` | 카운트다운 4: "색전" (공격 20) |
| 10 | 2 | 일반 | 울혈성 심부전 악화 | 숨참과 부종 | 약점 `loop_diuretic`, **유해 `fluid`** | 공격 + 환자 안정화 감소 |
| 11 | 2 | 일반 | 간성뇌증 | 의식 저하 | 약점 `ammonia_lowering`, **유해 `cns_depressant`** | 덱에 섬망 카드 |
| 12 | 2 | 일반 | 섬망 | 밤중 혼란 | 약점 `antipsychotic`, **유해 `benzodiazepine`** | 덱에 섬망 카드, 약한 공격 |
| 13 | 2 | 일반 | *C. difficile* 감염 (*Clostridioides difficile*, 클로스트리디오이데스 디피실레) | 잦은 설사 | 약점 `anaerobe`·`glycopeptide`, **유해 `broad_spectrum`** | 패시브: 이번 전투에서 광범위 항생제가 쓰일 때마다 "악화" +2 |
| 14 | 2 | 정예 | 폐색전증 | 갑작스러운 호흡곤란 | 약점 `anticoagulant` | 강한 공격, 환자 오더 −1 디버프 |
| 15 | 2 | 관문 정예 | 대량 상부위장관 출혈 | 토혈 | 약점 `transfusion`, **유해 `anticoagulant`·`antiplatelet`** | 매 턴 환자 활력 직접 손실, 수액 normal |
| 16 | 3 | 일반 | 인공호흡기 관련 폐렴 (VAP, Ventilator-Associated Pneumonia) | 기관 내 가래 증가 | 저항 `beta_lactam`, normal `carbapenem`, 획득 내성 증가량 2 | 공격, 내성 스택 시작 1 |
| 17 | 3 | 일반 | 급성 신손상 | 소변량 감소 | 약점 `fluid`, **유해 `nephrotoxic`·`k_raising`** | 덱에 고칼륨혈증 |
| 18 | 3 | 일반 | 급성 호흡곤란 증후군 (ARDS, Acute Respiratory Distress Syndrome) | 양측 폐 침윤 | 약점 `airway`(기관 삽관), **유해 `fluid`** | 환자 오더 감소 |
| 19 | 3 | 일반 | 파종성 혈관내 응고 (DIC, Disseminated Intravascular Coagulation) | 출혈과 점상출혈 | 약점 `transfusion`, 저항 `anticoagulant` | 덱에 출혈, 활력 직접 손실 |
| 20 | 3 | 정예 | 심장 눌림증 (심낭압전) | 저혈압과 경정맥 팽창 | 약점 `pericardiocentesis`(배율 200), `fluid` normal, 저항 `vasopressor`, 나머지 무효 | 카운트다운 3: 큰 공격 |

(표의 `transfusion`, `airway`, `pericardiocentesis`, `cardiac`, `surgical`은 처치 카드의 태그다. `tags.ts`에 선언한다.)

### 5.5 보스
**당뇨병성 케톤산증 (DKA)** — 1막
- 중증도 150. 분류 대사. 증상 가명 "구토, 복통, 깊은 호흡".
- 효과 표: 약점 `insulin`, `fluid` normal, 무효 `abx`.
- 패시브 "산증": 시작 5스택. 공격에 스택만큼 가산. `fluid` 투여 시 −2.
- 행동: 케톤 생성(산증 +2) / 쿠스마울 호흡(공격 8 + 산증) / 삼투성 이뇨(환자에 탈수) / 합병증 카운트다운 3 "순환 허탈"(공격 25, `fluid` 투여 중이면 절반).
- **숨겨진 변이**(확진 시 공개): "유발 요인: 감염" 50%. 이 변이는 매 턴 중증도 5를 회복하고, `abx` 투여 중이면 회복하지 않는다. 이 변이에서는 `abx`가 무효가 아니라 normal이다.
- 교육 포인트: H8(칼륨 보충 없는 인슐린), S4(포도당 병용), 수액 우선.

**패혈성 쇼크** — 3막 최종 보스
- 1단계 "패혈증": 중증도 200, 분류 감염, 증상 가명 "고열과 빈맥".
- **숨겨진 변이**(원인균):
  - 그람 양성 MRSA: `beta_lactam` 무효, `anti_mrsa` 약점
  - 그람 음성: `carbapenem`·`aminoglycoside` 약점
  - 1단계(감별)에서 "감염"만, 확진에서 원인균 공개. 배양 검사가 핵심 카드다.
- 획득 내성: 모든 `abx` 계열 태그.
- 2단계 "패혈성 쇼크" (중증도 50% 이하):
  - 진입 시 환자에게 "저혈압" 상태: 턴 시작 시 활력 −4, `vasopressor` 투여 중이면 무효
  - 행동 추가: 조직 저관류(공격 14), 사이토카인 폭풍(자신에게 염증 +3)
  - 합병증 카운트다운 4 "다장기 부전"(공격 30)
- 교육 포인트: 경험적 광범위 항생제 → 배양 → 표적 치료 전환(de-escalation), 수액과 승압제(S2).

### 5.6 상태 효과
| 상태 | 대상 | 효과 |
|---|---|---|
| 취약 | 양쪽 | 받는 피해 배율 150 (지속형) |
| 약화 | 양쪽 | 주는 피해 배율 75 (지속형) |
| 악화 | 적 | 공격에 스택만큼 가산 (강도형) |
| 염증 | 적 | 턴 종료 시 스택만큼 중증도 회복 후 스택 −1 |
| 산증 | 적 (DKA) | 공격에 스택만큼 가산 |
| 탈수 | 환자 | 안정화 획득 배율 75 (지속형) |
| 저혈압 | 환자 | 턴 시작 시 활력 −N, `vasopressor` 투여 중이면 무효 |
| 출혈 경향 | 환자 | 턴 시작 시 활력 −2 (H7) |
| 보존 | 카드 수준 | 턴 종료 시 버려지지 않음 |

### 5.7 유물 15개
| 유물 | 등급 | 효과 |
|---|---|---|
| 인턴 수첩 | 시작 | 전투 시작 시 첫 번째 적 진단 +1 |
| 손 위생 지침 | 일반 | 전투 시작 시 안정화 6 |
| 조기 경보 점수 (NEWS, National Early Warning Score) | 일반 | 적이 합병증 카운트다운을 시작하면 안정화 5 |
| 투약 5R 원칙 | 일반 | 전투마다 첫 약물의 부작용 생성 무효 |
| SBAR 인계 (Situation-Background-Assessment-Recommendation, 상황-배경-평가-권고) | 일반 | 턴 종료 시 손패 1장 보존 (선택) |
| 진료 지침 요약본 | 일반 | 적을 확진하면 드로우 1 |
| 수액 프로토콜 | 일반 | `fluid` 약물 사용 시 활력 2 회복 |
| DUR 시스템 | 고급 | 전투마다 첫 위험 상호작용 무효 |
| 항생제 관리 프로그램 (ASP, Antimicrobial Stewardship Program) | 고급 | 획득 내성 증가 절반 (2회 적중마다 +1) |
| 패혈증 1시간 번들 | 고급 | 전투 첫 턴의 첫 `abx` 카드 비용 0 |
| ACLS 알고리즘 (Advanced Cardiovascular Life Support, 전문 심장 소생술) | 고급 | 활력이 처음 25% 이하가 되면 안정화 15 + 오더 1 (전투당 1회) |
| 감별진단 체크리스트 | 고급 | 진단 포인트 획득 +1 |
| 중환자실 입실 | 보스 | 턴당 오더 +1, 당직실에서 휴식 불가 |
| 다학제 협진 | 보스 | 턴당 오더 +1, 카드 보상 선택지 2장 |
| 광범위 항생제 프로토콜 | 보스 | `abx` 피해 배율 130, 전투 시작 시 뽑을 더미에 장내세균 교란 1장 |

### 5.8 이벤트 4종 (M8에서 구현, 일정이 밀리면 전투 노드로 대체)
1. **제약회사 샘플**: 무작위 고급 약물 1장 획득 / 거절
2. **야간 당직**: 카드 2장 업그레이드 + 활력 −6 / 그냥 잠
3. **학회 발표**: 예산 −60 → 무작위 일반 유물 / 거절
4. **보호자 면담**: 활력 10 회복 / 카드 1장 제거

---

## 6. 테스트 전략

| 종류 | 위치 | 내용 |
|---|---|---|
| 단위 | `tests/unit` | 명령 실행기, 피해 파이프라인 단계별, 값·조건 평가, 난수 기준값, 지도 제약 |
| 시나리오 | `tests/scenario` | "이 상태에서 이 행동들 → 이 결과". 상태 빌더 헬퍼(`makeCombat({hand, enemies, drugs})`)를 둔다 |
| 결정론 | `tests/determinism` | 고정 시드 + 고정 행동 로그 → `stateHash` 기준값 일치. 같은 입력을 두 번 실행해도 동일 |
| 퍼즈 | `tests/fuzz` | 무작위 봇 1,000전투(개발 중엔 200). 매 step마다 불변식 검사 |
| 콘텐츠 | `tests/content` | `validateContent()` 통과 |

**불변식** (`core/invariants.ts`)
- 0 ≤ 중증도 ≤ 최대 중증도
- 0 ≤ 활력 ≤ 최대 활력
- 손패 ≤ 10
- 오더 ≥ 0
- 모든 수치가 정수 (NaN 없음)
- 카드 인스턴스 UID 중복 없음
- 카드 보존: 전투 중 (뽑을 + 손 + 버린 + 소진 + 처리 중) 카드 수의 변화 = 추가 − 제거
- 전투 중인데 모든 적의 중증도가 0인 상태가 step 종료 시 존재하지 않음
- 큐는 대기 선택 상태가 아니면 step 종료 시 비어 있음

기준 해시는 규칙 변경으로 의도적으로 바뀔 수 있다. 그때는 갱신하고 `DECISIONS.md`에 기록한다.

---

## 7. 명령어 (package.json 스크립트)
```
npm run dev              # 브라우저 실행
npm test                 # 전체 테스트
npm run test:fuzz        # 퍼즈 (긴 실행)
npm run content:report   # 콘텐츠 현황, unverified 목록
npm run sim -- combat --deck act1 --encounter pneumonia --n 300
npm run sim -- card-value --act 1 --n 300
npm run sim -- run --bot greedy --n 200
npm run sim:check        # 기준 지표 대비 회귀 검사
npm run sim:baseline     # 기준 지표 갱신
npm run replay <file>    # 내보낸 런 재생 검증
```

---

## 8. 마일스톤

각 마일스톤은 **실행해서 눈으로 확인 가능한 상태**로 끝난다.

### M0. 골격
- **범위**: Vite + TS + React + Vitest + ESLint 경계 규칙, `core/rng.ts`, 빈 화면, `docs/` 파일
- **실행 확인**: `npm run dev` → 타이틀 화면에 시드 입력칸과 "새 런" 버튼. 누르면 시드에서 뽑은 난수 5개 표시
- **테스트 기준**
  - sfc32 + cyrb128이 고정 시드에서 기준값을 출력
  - 스트림 독립성: `map` 스트림을 100번 소비해도 `reward` 스트림의 출력이 같다
  - `ui/`에서 core 내부 파일을 import하면 lint 실패, `core/`에서 `ui/`를 import하면 lint 실패

### M1. 전투 코어 (헤드리스)
- **범위**: 상태 타입, `step`, 턴 흐름, 드로우·셔플·버리기, 오더, damage·gain_stability·draw 명령, 피해 파이프라인(1·4·5단계만), 시작 카드 3종(아세트아미노펜 제외), 더미 적 1종(sequence AI), 무작위 봇, 불변식, `stateHash`
- **실행 확인**: `npm run sim -- combat --deck starter --encounter dummy --n 100 --bot random` → 승률, 평균 턴이 출력된다
- **테스트 기준**
  - 시나리오: 안정화 흡수, 셔플 발생 시점, 손패 10장 초과 처리, 턴 시작 시 안정화 초기화
  - 결정론: 같은 시드와 행동 로그 → 같은 해시 (2회 실행)
  - 퍼즈: 무작위 봇 200전투 불변식 위반 0, 예외 0

### M2. 효과 명령 집합, 트리거, 상태
- **범위**: D6의 명령 전부(`custom` 레지스트리 포함), ValueExpr, Condition, 트리거 수집 순서, 대기 선택(`select_cards`, `choose_cards`), 상태 효과 시스템, `delay`, `describe.ts`, 콘텐츠 레지스트리와 `validateContent`
- **실행 확인**: `npm run content:report` 출력, 시작 카드와 테스트용 카드 10장의 자동 설명문이 한국어로 출력된다
- **테스트 기준**
  - 명령마다 최소 1개의 단위 테스트
  - 트리거 순서 테스트: 유물 → 환자 상태 → 약물 → 적 순서로 이벤트가 기록된다
  - 대기 선택 중 저장·복원 후 재개해도 결과가 같다 (큐 직렬화)
  - 큐 1,000회 초과 시 오류 발생 테스트

### M3. 최소 전투 UI
- **범위**: controller, 전투 화면(환자·적·의도·손패·더미 개수·로그), 카드 대상 지정, 턴 종료, 게임 오버·승리 화면, 디버그 패널 기초
- **실행 확인**: 브라우저에서 시작 덱으로 더미 적과 한 전투를 끝까지 플레이할 수 있다. 새로 고침하면 같은 상태로 복원된다
- **테스트 기준**
  - core 테스트 전부 통과 (UI 자동 테스트는 v1에서 생략)
  - 수동 체크리스트(`docs/PROGRESS.md`에 기록): 불법 카드 비활성화 표시, 의도 표시, 로그 표시, 저장·복원

### M4. 약물 시스템
- **범위**: 투여 중 약물, 반감기, `whileActive`, 부작용 카드 삽입(3가지 위치, 수명), 부작용 카드 13종, 상호작용 해석, 13개 규칙, `previewInteractions`와 DUR 경고 패널, 약물 8종(세프트리악손, 겐타마이신, 레보플록사신, 클래리스로마이신, 미다졸람, 온단세트론, 인슐린, 염화칼륨)
- **실행 확인**: 디버그 패널로 약물 카드를 손에 넣고, 레보플록사신 → 온단세트론 순으로 쓰면 DUR 경고가 뜨고, 손에 부정맥이 들어오며, 로그에 H1이 기록된다
- **테스트 기준**
  - 규칙마다 발동 시나리오 1개 + 비발동 시나리오 1개
  - 같은 규칙은 한 투여에서 1회만 발동
  - 재투여 시 지속 갱신만 되고 자기 자신과 상호작용하지 않음
  - `overrides` 동작, `priority` 순서
  - 전투 한정 부작용이 전투 후 덱에서 사라지고, `persistent`는 남는다
  - S1의 `modify_current`가 같은 카드의 피해에 반영된다

### M5. 진단과 질병 AI
- **범위**: 지식 단계, 증상 가명, `visibleEnemyInfo`, 효과 표, 유해 판정, 획득 내성, 표적 키워드, 변이, 단계 전환, 합병증 카운트다운, AI 패턴 3종, 진단 카드 10종, 1막 질병 7종
- **실행 확인**: 폐렴과 전투 시 처음에는 "발열과 기침"으로 보이고, 혈액 검사 2장을 쓰면 확진되어 이름·효과 표·다음 의도 2개가 보인다. 세프트리악손을 3번 쓰면 효과 표시 옆에 내성 스택이 보이고 피해가 줄어든다
- **테스트 기준**
  - 피해 파이프라인 전 단계 수치 테스트 (예시 입력 5세트 이상, 손으로 계산한 기대값)
  - 내성 배율 n=0,1,2,3,5 → 100, 80, 60, 40, 40
  - 유해 태그 → 회복 처리
  - `EnemyView`가 지식 0단계에서 숨겨진 필드를 포함하지 않음
  - 지연 진단이 정확한 턴에 발동
  - 같은 시드에서 같은 의도 순서

### M6. 런 구조 — 1막 수직 단면
- **범위**: 지도 생성, 노드 이동, 인카운터 선택, 보상(예산·카드·희귀 보정), 상점, 당직실, 보물, 유물 시스템 + 유물 15개, DKA 보스, 증례집, 1막 전체, 저장 스키마 버전과 내보내기, 리플레이. 콘텐츠: 1막 질병 7종 + DKA, 카드 약 25장(시작 4 + 진단 5 + 처치 8 + 약물 8)
- **실행 확인**: 브라우저에서 새 런 → 1막 지도 → 전투·상점·휴식을 거쳐 DKA를 잡거나 사망한다. 런 내보내기 파일을 `npm run replay`로 재생하면 해시가 일치한다
- **테스트 기준**
  - 지도 제약 테스트: 시드 500개에서 모든 제약을 만족하고, 모든 노드가 시작에서 도달 가능하며 보스로 이어진다
  - 보상 희귀 보정 수치 테스트
  - 상점 제거 비용 증가
  - 저장·복원 왕복 후 해시 동일
  - 리플레이 결정론 (시드 20개, 무작위 봇의 전체 런)

### M7. 시뮬레이터
- **범위**: 탐욕 봇, 표준 덱, 전투·카드 가치·런 실험, 보고서(표 형식 콘솔 + `sim/reports/*.json`), 회귀 검사, 관측 σ 출력
- **실행 확인**: `npm run sim -- card-value --act 1 --n 300`이 1막 카드별 `v(c)` 순위와 조정 후보를 출력한다. `npm run sim -- run --bot greedy --n 200`이 1막 도달률과 DKA 승률을 출력한다
- **테스트 기준**
  - 탐욕 봇이 무작위 봇보다 1막 표준 전투의 평균 활력 손실이 유의하게 적다 (N=300, 차이 > 2 표준오차)
  - 같은 인자로 두 번 실행한 보고서가 동일하다 (결정론)
  - 공통 난수: 두 덱 비교가 같은 시드 집합을 쓰는지 테스트
  - 1막 지표가 D8 목표 범위에 들어오도록 1차 밸런스 조정 완료

### M8. v1 콘텐츠 완성
- **범위**: 카드 60장, 질병 20종, 보스 2종, 유물 15개, 2·3막, 관문 정예, 이벤트 4종, 전체 밸런스
- **실행 확인**: 브라우저에서 3막 끝까지 플레이할 수 있다. `content:report`의 개수가 60/20/2/15와 일치한다
- **테스트 기준**
  - `validateContent` 통과, `unverified` 목록을 사용자에게 전달
  - 퍼즈: 무작위 봇 전체 런 200회 불변식 위반 0
  - D8 목표 범위 전부 충족, 또는 벗어난 항목과 이유를 `PROGRESS.md`에 기록
  - 모든 상호작용 규칙이 런 실험에서 1회 이상 발동
  - `sim/baseline.json` 생성

### M9. 다듬기 (선택)
- **범위**: 이벤트 기반 애니메이션, 키워드 툴팁, 증례집 화면, 덱 보기, 설정(애니메이션 속도), 타이틀 고지문
- **실행 확인**: 카드 사용 → 피해 숫자, 부작용 카드가 더미로 날아가는 연출, 상호작용 발동 연출이 보인다
- **테스트 기준**: 애니메이션을 끄고 켜도 `stateHash`가 같다 (UI가 결과에 영향을 주지 않음)

---

## 9. 범위 밖 (v1에서 하지 않음)
- 런을 넘는 메타 진행, 해금, 난이도 단계
- 포션류 소모품
- 적 소환
- 다국어
- 모바일 레이아웃
- 사운드
