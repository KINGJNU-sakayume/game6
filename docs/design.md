# 오더 세트 (Order Set) — 설계 문서 v1.1

> 의학 테마 덱빌딩 로그라이크. 개인 비상업 프로젝트.
> 이 문서는 구현 세션이 **이 문서 하나만 보고** 구현을 시작할 수 있도록 작성되었다.
> v1.0(`docs/design-v1.0.md`)을 비판적으로 검토해 고친 판이다. 무엇을 왜 고쳤는지는 `docs/REVIEW.md`에 있다. 본문에서 `(R번호)`는 그 검토 항목을 가리킨다.

---

## 0. 구현 세션 작업 규칙

1. **이 문서가 단일 기준이다.** 설계를 바꿔야 할 이유가 생기면 `docs/DECISIONS.md`에 "무엇을, 왜"를 기록한다. 문서에 없는 세부 사항은 가장 단순한 쪽으로 정하고 같은 파일에 기록한다. 사용자 확인이 필요한 변경은 표시해 둔다.
2. **마일스톤 순서를 지킨다** (§8). 마일스톤은 "테스트 통과 + 실행 확인 항목 충족"일 때 끝난다.
3. **core 금지 사항**: `Math.random`, `Date.now`/`new Date`, 게임 수치의 소수 연산(모든 게임 수치는 정수, 배율은 백분율 정수), DOM 접근, `ui/`·`sim/`·`content/` import.
4. **의학 데이터 규칙**: 약물·질병·상호작용·부작용 정의에는 `medical` 필드가 필수다(D1). 확실하지 않으면 추측으로 채우지 말고 `fidelity: "unverified"`로 둔다. `npm run content:report`가 목록을 출력하고 사용자(의대생)가 검증한다.
5. 코드 식별자는 영어, 화면 텍스트는 한국어. 약물·질병은 영문명을 함께 표시한다.
6. 커밋은 마일스톤 안의 작업 단위로 한다. 마일스톤이 끝나면 `docs/PROGRESS.md`에 확인 결과를 적는다.

---

## 1. 게임 개요

### 1.1 한 런 = 한 환자의 입원 경과 (R24)

- 플레이어는 당직 의사다. **환자는 런 내내 한 명**이고 환자의 **활력**이 플레이어 체력이다. 질병이 적이다.
- 환자는 제2형 당뇨병과 고혈압이 있는 50~70대다(시드로 이름 성씨·나이·성별 결정, 이름은 "김○○"처럼 가림).
- **1막 응급실**: 내원 초기의 급성 문제들. 당뇨 환자의 DKA 유발 요인(감염, 경색)과 감별 대상(복통, 구토)이 차례로 드러난다. 끝에 DKA.
- **2막 병동**: 입원 중 합병증(봉와직염, 혈전, 섬망, C. diff 등). 끝에 관문 정예 대량 상부위장관 출혈.
- **3막 중환자실**: 중환자실 합병증(인공호흡기 폐렴, 급성 신손상, ARDS 등). 끝에 패혈성 쇼크.
- 전투 한 번은 "호출" 한 번, 즉 입원 중 생긴 급성 사건 하나다.

### 1.2 막 구조

| 막 | 층 | 끝 |
|---|---|---|
| 1 응급실 | 8 | 보스: 당뇨병성 케톤산증(DKA, Diabetic Ketoacidosis) |
| 2 병동 | 10 | 관문 정예: 대량 상부위장관 출혈 (보상은 보스와 같음) |
| 3 중환자실(ICU, Intensive Care Unit) | 10 | 최종 보스: 패혈성 쇼크 |

v1은 보스 2종이다. 2막 끝은 "관문 정예"이며 보상과 막 전환은 보스와 같게 처리한다(R25).

### 1.3 카드 4종

- **처치**: 시술과 행위. 기본적으로 모든 질병에 듣는 "보존적 치료"이고, 특정 시술만 적응증을 갖는다.
- **약물**: 강력하지만 **적응증이 있는 질병에만** 듣는다. 투여 중 상태, 상호작용, 부작용 카드가 따른다.
- **진단**: 숨겨진 정보를 공개하고 `표적` 보너스를 연다.
- **부작용**: 저주·상태 카드 역할. 보상 풀에 나오지 않는다. 일부 질병도 부작용 카드를 덱에 넣는다(착란, 고칼륨혈증, 출혈 등).

### 1.4 핵심 긴장

1. 경험적 치료(지금 바로, 도박) vs 진단 후 표적 치료(템포 소모, 고효율, 내성 없음)
2. 약물의 힘 vs 부작용 카드와 위험 상호작용
3. 범용 처치(느리지만 어디서나) vs 적응증 약물(빠르지만 상대를 탄다)

---

## 2. 확정된 설계 결정 (D1–D8)

### D1. 의학 정확성 수준

**결정: 방향은 정확하게, 크기는 게임적으로.**

1. **방향은 실제와 맞춘다.** 효과의 방향(개선/악화), **적응증과 질병의 관계**, 대표 부작용, 상호작용이 존재하는지 여부.
2. **크기는 추상화한다.** 용량, 시간, 확률은 게임 수치다. 화면에 **투여 용량과 그 단위**(mg, mEq/L, mL/kg 등)를 쓰지 않는다. 진단 단서의 검사 수치는 단위 없이 쓸 수 있다(R40). 임상 참고 자료처럼 보이면 안 된다.
3. **단순화와 과장은 허용하고, 반대 방향은 금지한다.** "인슐린이 칼륨을 올린다", "검사가 산증을 줄인다", "맥박 있는 환자에게 제세동이 이롭다"는 금지다(R8, R9).
4. **적응증 원칙** (R1): 약물은 적응증이 없는 질병의 중증도를 줄이지 못한다. 처치는 보존적 치료로서 어디에나 들되, 특정 시술은 적응증을 따른다.
5. 모든 의학 데이터에 다음 필드를 둔다.
   ```ts
   medical: { fidelity: "accurate" | "simplified" | "stylized" | "unverified"; note: string }
   ```
   - `accurate`: 방향과 관계가 실제와 같다
   - `simplified`: 예외나 조건을 생략했다
   - `stylized`: 게임을 위해 의도적으로 비틀었다. `note`에 무엇을 비틀었는지 쓴다
   - `unverified`: 사용자 검증 대기
6. 타이틀 화면에 고지한다: "오락용 게임입니다. 수치와 효과는 실제 임상 판단의 근거가 아닙니다."

---

### D2. 핵심 자원

| 자원 | 소유 | 범위 | 규칙 |
|---|---|---|---|
| **활력** (Vitality) | 환자 | 런 | 시작값·최대값 70. 0이 되면 사망하고 런이 끝난다 |
| **안정화** (Stability) | 환자·질병 | 한 턴 | 방어도. 피해를 먼저 흡수한다. 소유자의 턴이 시작될 때 0 |
| **오더** (Orders) | 환자 | 한 턴 | 에너지. 매 턴 3. 남은 오더는 사라진다 |
| **중증도** (Severity) | 질병 | 전투 | 적 체력. 0이 되면 "치료". 질병의 행동으로 회복하지만 최대치를 넘지 않는다(최대치 자체를 올리는 합병증은 예외) |
| **진단 포인트** | 질병별 | 전투 | 누적되면 지식 단계가 오른다(D3) |
| **획득 내성** | 질병별·계열별 | 전투 | 경험적·광범위 항생제 사용으로 쌓인다(아래) |
| **예산** (Gold) | 환자 | 런 | 상점 화폐. 시작 99 |

- 드로우는 턴당 5장, 손패 최대 10장.
- **기각한 안: 환자 측 "약물 부담" 게이지.** 약물의 환자 측 비용은 부작용 카드가 이미 표현한다. 같은 행동에 비용을 두 번 매기면 약물 덱이 이중으로 처벌받는다.

#### 획득 내성 (R20)

기호:
- `n` = 대상 질병이 이 카드의 계열 태그에 대해 쌓은 스택 (계열 태그가 여럿이면 최댓값)
- `r(n)` = 내성 배율 (백분율 정수)

1단계. 스택당 20%p 감소: `100 − 20n`
2단계. 하한 40: `r(n) = max(40, 100 − 20n)`
3단계. 확인: n=0 → 100, 1 → 80, 2 → 60, 3 이상 → 40

**쌓이는 조건.** 항생제 카드가 피해를 1 이상 주었을 때(안정화 흡수 전 값 기준), 다음 중 하나면 대상 질병의 `acquiredResistance.tags`에 있는 이 카드의 계열 태그마다 `gainPerHit`만큼 쌓인다.
- 대상이 **확진 전**(지식 단계 < 2)이다 → 경험적 치료의 선택압
- 카드가 `broad_spectrum`이다 → 광범위 항생제의 선택압

확진된 대상에게 좁은 범위 항생제를 쓰면 쌓이지 않는다. 계열 태그: `beta_lactam`, `carbapenem`, `glycopeptide`, `aminoglycoside`, `fluoroquinolone`, `macrolide`, `nitroimidazole`.

---

### D3. 은닉 정보와 진단

**원칙: 물리 법칙은 항상 적용되고, 정보만 숨겨진다.** 질병의 반응표(치료 반응)는 진단 여부와 상관없이 실제로 작동한다. 진단은 (1) 정보를 보여 주고 (2) `표적` 보너스를 열고 (3) 항생제 내성 누적을 멈춘다.

#### 주호소와 단서 (R21)

- **주호소**(`complaint`): 0단계에서 이름 대신 보이는 말. 같은 막의 여러 질병이 같은 주호소를 **공유**한다(예: 2막 "다리 부종" = 봉와직염 또는 심부정맥 혈전증, "의식 변화" = 간성뇌증 또는 섬망).
- **단서**(`clues`): 실제 감별에 쓰는 소견 2~3개. 0단계에서 첫 번째 단서, 1단계부터 전부 보인다. 의학 지식이 곧 실력이 되는 지점이다.

#### 지식 단계

| 단계 | 조건 | 화면에 보이는 것 |
|---|---|---|
| 0 미진단 | 시작 | 주호소, 단서 1개, 중증도, 이번 턴 의도(종류와 수치), 합병증 카운트다운의 남은 턴(내용은 "?"), 획득 내성 스택 |
| 1 감별 | 진단 포인트 ≥ `partialAt` | 단서 전부, **분류**, **반응표**(변이에 따라 달라지는 항목은 "?"), 합병증 내용 |
| 2 확진 | 진단 포인트 ≥ `confirmAt` | **질병명**, 패시브, **다음 의도까지 2개**, **변이**(원인균 등), 반응표 전부, `표적` 보너스 활성, 내성 누적 중단 |

- 기본 임계값 `partialAt = 2`, `confirmAt = 4`. 보스는 3/5.
- **표적 키워드**: 확진된 대상에게 피해 배율 `t = 150`, 아니면 `t = 100`. "교수 회진"으로 +50.
- **지연 진단**: 배양 검사처럼 결과가 늦는 카드는 `delay` 명령으로 N턴 뒤 진단 포인트를 준다.
- **증례집**: 한 런에서 확진한 질병을 다시 만나면 1단계에서 시작한다. 변이는 전투마다 새로 정해지므로 변이 항목은 다시 "?"다.
- **오진의 대가**: 무효 항목으로 공격하면 피해 0이고 부작용은 그대로 생긴다. 금기 항목으로 공격하면 질병이 회복된다(§4.3).

#### 반응표 등급 (R5)

| 코드 | 화면 표기 | 배율 | 뜻 |
|---|---|---|---|
| `key` | 특효 | 200 | 결정적 치료 (에피네프린→아나필락시스, 심낭 천자→심장 눌림증) |
| `weak` | 우수 | 150 | 1차 치료 |
| `normal` | 보통 | 100 | 적응은 되나 1차는 아님 |
| `resistant` | 저하 | 50 | 효과가 약하다 |
| `immune` | 무효 | 0 | 듣지 않는다 |
| `harmful` | 금기 | — | 피해 대신 질병 회복 |

#### 진단 포인트 가치
진단 포인트 1 = 2V (D4). 진단 카드는 대부분 소량의 안정화나 드로우를 함께 준다.

---

### D4. 부작용 카드 규칙

**결정: 약물별 고정 부작용.** 무작위성은 드로우에만 두고 결과는 결정적으로 둔다.

1. 모든 약물 카드는 부작용을 카드에 **명시**한다: `sideEffects: [{ card, count, dest }]`
2. **들어가는 위치(dest)**
   - `discard` 버린 카드 더미 (기본)
   - `draw_random` 뽑을 더미의 무작위 위치 (`cardEffect` 스트림)
   - `hand` 손패 (가득 차면 버린 카드 더미)
3. **수명**: 기본은 전투 한정. `persistent`인 부작용 카드는 생성될 때 런 덱에도 1장 추가된다. 희귀 약물에만 쓴다.
4. **부작용 카드 행동 키워드**
   - `unplayable` 사용 불가
   - `end_of_turn_in_hand` 턴 종료 시 손에 있으면 발동
   - `on_draw` 뽑을 때 발동
   - `ethereal` 턴 종료 시 손에 있으면 소진 (턴 종료 발동 뒤에 처리)
   - `purgeable(cost)` 오더를 내고 사용하면 소진된다
5. **처리 수단** (카드 풀과 유물에 반드시 포함): 대증 치료, 온단세트론(오심), 날록손(호흡억제), 염화칼륨(저칼륨혈증), 포도당(저혈당), 인슐린·살부타몰·푸로세미드(고칼륨혈증), 아미오다론(부정맥), 투석(신독성·고칼륨혈증), 압박 지혈·내시경 지혈(출혈), 할로페리돌·락툴로오스(착란), 당직실 "부작용 정리"(지속 부작용 제거).

#### 활력 회복 규칙 (R22)

전투 중 **반복 가능한** 활력 회복은 두지 않는다. 활력 회복은 (1) 소진 카드 (2) 전투 종료 시점 효과 (3) 전투 밖(당직실, 이벤트, 막 전환)으로만 준다.

#### 가치 예산 (R23)

기호:
- `V` = 가치 단위. 1V ≈ 중증도 1 감소 ≈ 안정화 1
- `E` = 카드 비용(오더)
- `b` = 희귀도 보너스: 일반 0, 고급 2, 희귀 5
- `x` = 소진 보정: 소진이면 3
- `s` = 부작용 보정

1단계. 비용 기준: `base = 7E` (0비용은 3, X비용은 X당 7)
2단계. 부작용 보정: 부작용 카드마다 해악값 `h`에 위치 계수를 곱해 더한다.
   - 위치 계수: `discard` 1.0, `draw_random` 1.2, `hand` 1.5, 지속(`persistent`) 3.0
   - `s = Σ count × h × 계수`
3단계. 목표: `V_target = base + b + x + s`

**부작용 해악값 h**

| 카드 | h | 카드 | h |
|---|---|---|---|
| 발진 | 2 | 출혈 | 5 |
| 오심 | 3 | 과진정 | 5 |
| 착란 | 4 | 서맥 | 4 |
| 저칼륨혈증 | 4 | 고칼륨혈증 | 6 |
| 면역억제 | 4 | 저혈당 | 6 |
| 장내세균 교란 | 4 | 부정맥 | 8 |
| 신독성 | 5 | 호흡억제 | 8 |
| 폐 독성 (지속) | 3 | | |

**환산표** (시뮬레이션으로 보정할 초기값)

| 항목 | 가치 |
|---|---|
| 범용 피해 1 (처치) | 1V |
| 적응증 제한 피해 1 — 적응 질병 4종 이상 | 0.8V |
| 적응증 제한 피해 1 — 2~3종 | 0.6V |
| 적응증 제한 피해 1 — 1종 | 0.5V |
| 전체 대상 피해 | 위 값 × 1.5 |
| 안정화 1 | 1V |
| 드로우 1 | 3V |
| 오더 +1 | 7V |
| 진단 포인트 1 | 2V |
| 취약·위축 1턴 | 3V |
| 활력 회복 1 | 1.5V |
| 비용 −1 (조건부) | 5V |
| 부작용 카드 1장 소진 | 2V |
| 조건부 효과 (대상 특성 조건) | 효과 가치 × 0.5 |

- `표적` 보너스는 예산에 넣지 않는다. 진단 카드에 들인 비용의 대가다.
- **시작 카드는 예산 검증에서 제외한다** (R30).
- 검증: `|실제 − V_target| / V_target > 30%`면 경고(오류 아님).

예시. 겐타마이신(일반, 1오더, 신독성 1장 → discard):
- `base = 7`, `b = 0`, `x = 0`, `s = 1 × 5 × 1.0 = 5` → `V_target = 12`
- 적응증 제한 피해(감염 질병 4종 이상) 0.8V → `12 / 0.8 = 15` → 중증도 14 (반올림 후 하향 조정)

**희귀도별 부작용 상한**
- 일반: `discard` 1장
- 고급: `draw_random` 1장 또는 `discard` 2장
- 희귀: `hand` 1장 또는 지속 1장

---

### D5. 약물 상호작용

#### 쌍(pair) 단위를 기각한 이유

`n` = 약물 카드 수, `P` = 서로 다른 약물 쌍의 수라 하면 `P = n(n−1)/2`. v1.1의 약물 30종이면 `P = 30 × 29 / 2 = 435`다. 대부분은 "상호작용 없음"이므로 **기전·계열 태그 단위 규칙**으로 정의한다. 특정 쌍에만 해당하는 규칙은 카드 ID 예외로만 쓴다.

#### 투여 중 약물 모델 (R2)

- 약물 카드를 쓰면 환자에게 **투여 중 약물**(`ActiveDrug`)이 등록되고 `halfLife` 턴 동안 유지된다(`stylized`: 반감기를 턴으로 압축).
- **지속 감소 시점: 플레이어 턴 시작 처리의 마지막.** 약물의 턴 시작 효과와 환자 상태의 턴 시작 판정(저혈압 등)이 끝난 뒤 모든 투여 중 약물의 `turnsLeft`가 1 줄고, 0이면 종료된다(`drug_expired`).
  - `halfLife 1`: 쓴 턴, 그 적 턴, 다음 턴 시작 효과까지
  - `halfLife 2`: 기본값. 여기에 다음 턴 전체가 더해진다
  - 최대 4. "중심정맥관 삽입"은 이후 투여분에 +1
- **재투여**하면 지속만 갱신된다. 자기 자신과는 상호작용하지 않는다.
- 약물은 투여 중 `whileActive` 트리거를 가질 수 있다(예: 노르에피네프린은 턴 시작 시 안정화 3).
- 상호작용 판정은 **새로 투여된 약물 × 이미 투여 중인 약물**이다.

#### 규칙 구조

```ts
interface InteractionRule {
  id: string;
  kind: "synergy" | "hazard" | "antagonism";
  incoming: TagQuery;              // { all?: Tag[]; any?: Tag[]; cardId?: CardId }
  active?: TagQuery;               // 생략하면 단독 규칙
  symmetric: boolean;              // true면 역할을 바꿔서도 검사
  condition?: Condition;           // 추가 조건 (대상 분류·특성 등)
  priority: number;                // 낮을수록 먼저
  overrides?: string[];            // 이 규칙이 발동하면 무효화되는 규칙
  effects: EffectOp[];
  text: string;                    // DUR 경고 문구
  medical: MedicalNote;
}
```

#### 해석 알고리즘

1. `administer` 명령이 실행되면 약물 `c`를 등록하거나 갱신한다.
2. 투여 중 약물 `a`마다(`a ≠ c`, 등록 순), 모든 규칙 `R`에 대해 `(incoming=c, active=a)`를 검사한다. `symmetric`이면 `(incoming=a, active=c)`도 검사한다. 단독 규칙은 `c`만으로 한 번 검사한다.
3. 한 번의 투여에서 **같은 규칙은 최대 1회** 발동한다.
4. 발동한 규칙의 `overrides` 대상을 제거한다.
5. `priority` 오름차순, 같으면 `id` 사전순으로 효과를 **큐 맨 앞에** 넣는다. 카드 효과보다 먼저 처리되므로 `modify_current`가 같은 카드의 피해에 반영된다.
6. 위험 규칙이 발동하고 "DUR 시스템" 유물이 이번 전투에서 아직 쓰이지 않았다면, 그 규칙의 효과를 버리고 유물을 소모한다.

#### DUR 경고 미리보기

손패의 약물 카드를 가리키면 **지금 쓰면 발동할 규칙**을 보여 준다. `previewInteractions(state, cardUid, targetUid?)`. 조건이 대상의 숨겨진 정보(1단계 이전의 분류·특성)에 달려 있으면 "대상에 따라 발동 가능"으로 표시해 정보를 누설하지 않는다. 숨겨진 함정으로 처벌하지 않는다.

#### v1.1 규칙 목록 (17개)

| ID | 종류 | 조건 | 효과 | fidelity |
|---|---|---|---|---|
| H1 | 위험 | `qt_prolong` + `qt_prolong` (대칭) | 손에 "부정맥" 1장 | accurate |
| H2 | 위험 | `k_lowering` + `qt_prolong` (대칭) | 뽑을 더미에 "부정맥" 1장 | accurate (저칼륨혈증은 QT 연장 위험을 키움) |
| H3 | 위험 | `k_lowering` + `k_lowering` (대칭) | 손에 "저칼륨혈증" 1장 | simplified |
| H4 | 위험 | 들어옴 `cyp3a4_substrate`, 투여 중 `cyp3a4_inhibitor` | 이번 카드 배율 150, 이 카드 부작용 1회 추가 | simplified |
| H4b | 위험 | 들어옴 `cyp3a4_inhibitor`, 투여 중 `cyp3a4_substrate` | 기질 약물 지속 +1, 기질 약물의 부작용 카드 1장을 버린 더미에 | simplified |
| H5 | 위험 | `cns_depressant` + `cns_depressant` (대칭) | 손에 "호흡억제" 1장 | accurate |
| H6 | 위험 | `nephrotoxic` + `nephrotoxic` (대칭) | 버린 더미에 "신독성" 2장 | accurate |
| H7 | 위험 | `anticoagulant` + `antiplatelet` (대칭) | 환자에게 "출혈 경향" | accurate |
| H8 | 위험 | 단독: 들어옴 `insulin`, 조건: `k_raising` 투여 중 아님 | 손에 "저칼륨혈증" 1장 | accurate (칼륨 보충 없는 인슐린) |
| H9 | 위험 | `thrombolytic` + (`anticoagulant` 또는 `antiplatelet`) (대칭) | 손에 "출혈" 1장 | accurate (혈전용해 후 24시간 항혈전제 보류) |
| S1 | 시너지 | `beta_lactam` + `aminoglycoside` (대칭) | 이번 카드 배율 150 | simplified (균종 조건 생략) |
| S2 | 시너지 | 들어옴 `vasopressor`, 투여 중 `fluid` | 안정화 8 | simplified (수액 우선 원칙) |
| S3 | 시너지 | `anticoagulant` + `antiplatelet` (대칭), 조건: 대상 특성 `acs` | 이번 카드 배율 150 | simplified (R10) |
| S4 | 시너지 | 들어옴 `insulin`, 투여 중 `glucose` | 이번 카드의 부작용 생성 억제 | simplified |
| S5 | 시너지 | `nitroimidazole` + (`beta_lactam`·`fluoroquinolone`·`aminoglycoside` 중 하나) (대칭), 조건: 대상 분류 `abdominal` | 이번 카드 배율 200 | simplified (복강 내 감염의 혐기균 병용) |
| A1 | 길항 | 들어옴 `opioid_antagonist`, 투여 중 `opioid` | 오피오이드 투여 종료 | accurate (R11) |
| A2 | 길항 | 들어옴 `anaphylaxis_tx`, 투여 중 `beta_blocker` | 이번 카드 배율 50 | accurate (β차단제 복용자의 에피네프린 반응 저하) |

H7과 S3가 같은 조합에서 함께 발동하는 것은 의도한 양날의 검이다.

---

### D6. 카드 효과 명령 집합

#### 원칙
1. **작은 명령 집합 + 탈출구.** 표현할 수 없는 카드는 `custom`(코드에 등록된 이름 붙은 효과)으로 처리한다. `custom`이 콘텐츠의 10%를 넘으면 명령 추가를 검토한다.
2. **코드 어휘는 범용 게임 용어**(damage, block, draw), **화면 어휘는 의학 용어**(중증도 감소, 안정화).
3. 카드, 유물, 상태, 질병 행동, 상호작용 규칙이 **모두 같은 명령 집합**을 쓴다.
4. 콘텐츠는 **TypeScript 데이터 파일**(`satisfies CardDef[]`)이다. "로직 수정 없이 콘텐츠 추가"가 목표다.
5. 카드 설명문은 명령에서 **자동 생성**한다. `textOverride`는 예외로만.

#### 대상 선택자
`patient` · `target`(플레이어가 고른 적) · `all_enemies` · `random_enemy` · `self`(효과의 주인. 질병 행동이면 그 질병) · `source`(사건을 일으킨 쪽)

#### 명령 목록

| 명령 | 매개변수 | 비고 |
|---|---|---|
| `damage` | amount, target, tags?, hits?, mods? | 피해 파이프라인(§4.3). 태그 기본값은 카드 태그. `mods`: `[{ if: Condition, pct }]` 조건부 배율 |
| `lose_vitality` | amount | 안정화를 무시하는 직접 손실 |
| `heal` | amount, target | 환자는 활력, 적은 중증도 |
| `gain_stability` | amount, target | 환자는 탈수 배율 적용 |
| `gain_orders` | amount | |
| `draw` | amount | |
| `discard` | amount, mode: choose/random | choose면 대기 선택 |
| `exhaust_cards` | from, filter, amount 또는 "all", mode: all/choose | 부작용 처리 |
| `add_card` | cardId, count, dest, costZeroThisTurn? | |
| `apply_status` | status, stacks, target | |
| `remove_status` | status, target, stacks 또는 "all" | |
| `diagnose` | points, target | |
| `confirm` | target | 즉시 확진 |
| `reveal_intent` | target | 이번 턴 동안 다음 의도 공개 |
| `modify_resistance` | tag 또는 "all", delta, target | |
| `end_drug` | filter(태그/ID/"all") | 투여 종료 |
| `extend_drug` | filter, turns | |
| `modify_current` | pct | 처리 중인 카드의 배율 |
| `suppress_side_effects` | — | 처리 중인 카드의 부작용 억제 |
| `extra_side_effects` | times | 처리 중인 카드의 부작용 추가 횟수 |
| `cost_modifier` | filter, delta, uses, scope: turn/combat | 다음 N장의 비용 조정 |
| `combat_flag` | flag, delta | 전투 지속 효과(약물 지속 +1, 오더 세트 장전, 손패 보존 등) |
| `start_countdown` | move, turns, target | 합병증 예고 |
| `enter_phase` | phase | 질병 단계 전환 |
| `raise_max_severity` | amount, target | 최대 중증도 증가(+같은 양 회복) |
| `gain_gold` | amount | |
| `repeat` | times, effects | |
| `if` | cond, then, else? | |
| `delay` | turns, effects | 플레이어 턴 시작 시 틱 |
| `select_cards` | from, filter, min, max, then | 대기 선택. 선택 결과를 `then`에 바인딩 |
| `custom` | id, params | 코드 등록 효과 |

내부 명령(콘텐츠에서 쓰지 않음): `administer`, `emit_side_effects`, `card_played`, `finish_card`.

#### 값 표현 (ValueExpr)
```ts
type ValueExpr =
  | number
  | { x: true }
  | { ref: CountRef; of?: TargetSel; status?: StatusId }
  | { add: [ValueExpr, ValueExpr] }
  | { mul: [ValueExpr, ValueExpr] };
type CountRef = "hand_size" | "active_drug_count" | "exhaust_count" | "cards_played_this_turn"
  | "drugs_played_this_turn" | "status_stacks" | "knowledge_level" | "side_effects_in_hand"
  | "drugs_ended_now";
```

#### 조건 (Condition)
```ts
type Condition =
  | { all: Condition[] } | { any: Condition[] } | { not: Condition }
  | { knowledgeAtLeast: { target: TargetSel; level: 0 | 1 | 2 } }
  | { hasStatus: { target: TargetSel; status: StatusId; min?: number } }
  | { activeDrugTag: Tag }
  | { targetCategory: DiseaseCategory[] }
  | { targetTrait: Trait[] }
  | { vitalityBelowPct: number } | { severityBelowPct: { target: TargetSel; pct: number } }
  | { countAtLeast: { ref: CountRef; n: number } }
  | { turnAtLeast: number };
```

---

### D7. 지도, 보상, 유물

#### 막 구성
| 막 | 층 | 끝 | 고정 층 |
|---|---|---|---|
| 1 응급실 | 8 | 보스 DKA | 1층 전투, 4층 보물, 8층 휴식 |
| 2 병동 | 10 | 관문 정예 상부위장관 출혈 | 1층 전투, 5층 보물, 10층 휴식 |
| 3 중환자실 | 10 | 최종 보스 패혈성 쇼크 | 1층 전투, 5층 보물, 10층 휴식 |

- 보스 노드는 마지막 층 위에 별도로 있고 마지막 층의 모든 노드와 연결된다.
- 막을 넘어갈 때 최대 활력의 30%를 회복한다(전동 처리). 튜닝 값이다.

#### 지도 생성
DAG(방향 비순환 그래프), 폭 7열, 층 수 `L`.

1. 경로 6개를 만든다. 첫 두 경로는 서로 다른 시작 열에서 출발한다(`map` 스트림).
2. 각 경로는 층마다 열을 −1, 0, +1 중 하나로 이동한다(격자 안).
3. **교차 금지**: 같은 층 사이에서 두 간선이 엇갈리면(`a→a+1`과 `a+1→a`) 다시 뽑는다. 10회 실패하면 직진한다(직진은 교차를 만들지 않는다).
4. 경로가 지나간 칸만 노드가 된다. 같은 칸을 지나는 경로는 합쳐진다.
5. 고정 층에 종류를 배정한다.
6. 나머지 노드는 가중치 추첨: 전투 50, 이벤트 15, 휴식 12, 정예 10, 상점 8, 보물 5.
7. 제약 위반이면 그 노드만 다시 뽑는다(최대 20회, 실패하면 전투). **고정 층 노드는 제약 검사에서 제외한다** (R28).
   - 정예와 휴식은 막의 4층 미만에 올 수 없다
   - 한 경로에서 **같은 종류의** 정예·휴식·상점이 연속으로 오지 않는다
   - 한 노드의 자식이 2개 이상이면 자식끼리 종류가 달라야 한다
   - 마지막 층 직전 층에는 휴식이 오지 않는다

#### 노드 종류
| 노드 | 화면 이름 | 내용 |
|---|---|---|
| 전투 | 호출 | 막별 인카운터 풀. 막의 첫 2전투는 "쉬움" 풀. 직전과 같은 인카운터 금지 |
| 정예 | 급변 | 정예 풀. 보상에 유물 포함 |
| 휴식 | 당직실 | 택 1: 휴식(최대 활력 30% 회복) / 처방 최적화(카드 1장 업그레이드) / 부작용 정리(지속 부작용 카드 1장 제거) |
| 상점 | 약제부 | 카드 5장, 유물 2개, 카드 제거 |
| 보물 | 가이드라인 개정 | 유물 1개 |
| 이벤트 | 돌발 상황 | 이벤트 5종 (§5.9) |
| 보스 | 주 진단 | 보스·관문 정예 |

#### 보상
- **예산**: 전투 10–20, 정예 25–35, 관문 정예 60, 보스 70.
- **카드 보상**: 3장 중 1장 또는 건너뛰기. 같은 보상 안에서 중복 없음.
  - 희귀도 가중치(정수): 일반 `60 − p'`, 고급 37, 희귀 `3 + p'` (R27)
  - `p'`는 `min(37, p)`이고 `p`는 마지막 희귀 이후 보여 준 일반 카드 수다. 희귀가 나오면 `p = 0`. 희귀 가중치의 최댓값은 40이다
  - 정예: 일반 `50 − p'`, 고급 40, 희귀 `10 + p'` (`p' = min(30, p)`)
  - 보스·관문 정예: 전부 희귀
- **상점 가격**: 일반 50 / 고급 75 / 희귀 150, ±10%(`shop` 스트림). 유물 150–250. 카드 제거 75에서 시작해 사용할 때마다 +25.
  - 상점 카드 희귀도 가중치: 일반 50 / 고급 38 / 희귀 12
- **업그레이드**: 모든 카드 정의에 `upgrade` 차이값. 화면에는 이름 뒤 `+`.

#### 유물(가이드라인)
시작 1 / 일반 6 / 고급 5 / 보스 5 = 17개. 획득 가중치 일반 60 / 고급 40. 보스 유물은 DKA와 관문 정예 처치 후에만 3개 중 1개를 고른다(이미 가진 것은 제외) (R25).

---

### D8. 자동 시뮬레이션 밸런스 검증

#### 봇
1. **무작위 봇**: 합법 행동 중 무작위(`sim` 전용 스트림). 크래시·불변식 위반 탐지와 실력 격차 기준선.
2. **탐욕 봇**: 한 턴 안의 카드 사용 순서를 깊이 우선 탐색(노드 상한 2,000). 탐색은 **전투 부분만 복제**한다 (R38).

탐욕 봇 점수:
- `ΔS` 이번 턴에 줄인 적 중증도 합, `I` 이번 적 턴 예고 피해 합, `B` 턴 종료 시 안정화, `L = max(0, I − B)`, `K` 새로 생긴 부작용 카드 수, `D` 얻은 진단 포인트, `W` 치료한 적 수
- `score = ΔS − 2L − 3K + 2D + 20W` (치료된 적의 예고 피해는 `I`에서 뺀다)

카드 보상은 가치 예산 순위로 고른다(적응증 제한 카드는 현재 막의 인카운터 풀에서 적응 질병 비율로 가중).

#### 실험 종류
1. **전투 실험**: 고정 덱 × 고정 인카운터 × N 시드 → 승률, 소요 턴, 활력 손실, 부작용 카드 수, 발동 상호작용
2. **카드 가치 실험**: 카드 `c`의 기여도
3. **런 실험**: 탐욕 봇 전체 런 N회 → 막별 도달률, 사망 원인 질병, 최종 승률

#### 카드 가치 추정
- `D0` 기준 덱(`sim/decks.ts`), `f` 필러 카드(예산에 딱 맞는 "기준 처치"), `L̄(D)` 평균 활력 손실
- **같은 시드 집합**으로 두 덱을 돌린다(공통 난수)
- `v(c) = L̄(D0 + f) − L̄(D0 + c)`. 상위·하위 10%면 조정 후보

#### 필요 시행 수 N (R37)

- `σ` 한 전투 활력 손실의 표준편차(초기 가정 6), `δ` 구분하고 싶은 최소 차이(1), `ρ` 공통 난수로 생긴 두 덱 결과의 상관
1단계. 차이의 표준오차: `σ√(2(1−ρ)/N)`
2단계. 유의수준 5%(양측), 검정력 80%: `(1.96 + 0.84) × σ√(2(1−ρ)/N) ≤ δ`
3단계. 정리: `N ≥ 2(1−ρ) × (2.80σ/δ)²`
4단계. 공통 난수 없이(ρ=0): `N ≥ 2 × 16.8² ≈ 565`
5단계. ρ=0.5: `N ≥ 283`

기본 **N = 300**. 공통 난수를 쓰기 때문에 성립하는 값이다. 시뮬레이터는 관측된 σ와 ρ를 출력하고, `2(1−ρ)(2.80σ/δ)² > N`이면 경고한다.

#### 목표 범위 (탐욕 봇, 초기값)
| 지표 | 목표 |
|---|---|
| 일반 전투 평균 활력 손실 | 1막 4–9 / 2막 7–13 / 3막 9–16 |
| 정예 전투 평균 활력 손실 | 12–22 |
| 보스 승률 (해당 막 표준 덱, 활력 최대) | 45–65% |
| 전체 런 승률 | 탐욕 봇 15–35%, 무작위 봇 < 2% |
| 약물 중심 덱의 전투당 부작용 카드 드로우 | 1.5–4 |
| 상호작용 규칙 발동 | 모든 규칙이 런 실험 중 1회 이상 발동 |

#### 회귀 검사
`sim/baseline.json`에 지표 스냅샷. `npm run sim:check`는 평균 ±2 표준오차를 벗어나면 경고. 의도한 변경이면 `npm run sim:baseline`으로 갱신하고 `DECISIONS.md`에 적는다.

---

## 3. 아키텍처

### 3.1 기술 스택
| 영역 | 선택 | 이유 |
|---|---|---|
| 언어 | TypeScript, `strict` + `noUncheckedIndexedAccess` | 콘텐츠 참조 오류를 컴파일 시점에 잡는다 |
| 빌드 | Vite | |
| UI | React 18.3, **클래식 JSX 변환**(`React.createElement`) | 배포용 단일 HTML에서 React를 CDN의 UMD 빌드로 불러오기 위해. 상태 관리 라이브러리는 쓰지 않는다 |
| 스타일 | 일반 CSS (디자인 토큰 + 화면별 파일) | |
| 테스트 | Vitest | |
| 스크립트 | `tsx` | 시뮬레이터 CLI |
| 계층 경계 | `tests/arch.test.ts`가 import 문을 검사 | ESLint 설정 없이 같은 규칙을 강제 |
| 저장 | 브라우저 로컬 저장소 + JSON 내보내기 | |

### 3.2 폴더 구조
```
src/
  core/                    # 순수 로직. content·ui·sim을 import하지 않는다
    types.ts               # 모든 정의·상태 타입
    rng.ts                 # sfc32 + cyrb128, 스트림 파생
    registry.ts            # 콘텐츠 주입(installContent)과 조회 (R33)
    validate.ts            # validateContent
    step.ts                # 진입점: step(state, action)
    queue.ts               # 효과 큐 처리, 대기 선택
    effects.ts             # 명령 실행기 레지스트리
    values.ts, conditions.ts, triggers.ts
    combat.ts              # 전투 시작·턴 흐름·종료
    damage.ts              # 피해 파이프라인
    drugs.ts               # 투여 중 약물, 상호작용 해석, 미리보기
    diagnosis.ts           # 진단 포인트, 지식 단계, EnemyView
    enemy-ai.ts            # 행동 선택, 의도 계산
    map.ts, rewards.ts, shop.ts, rest.ts, events.ts, run.ts
    describe.ts            # 명령 → 한국어 설명문
    invariants.ts, hash.ts
    custom.ts              # custom 효과 구현
  content/                 # 데이터만. core/types만 import
    tags.ts statuses.ts keywords.ts
    cards/ starter.ts diagnostics.ts procedures.ts drugs.ts side-effects.ts
    diseases/ act1.ts act2.ts act3.ts
    encounters.ts interactions.ts relics.ts events.ts quiz.ts
    index.ts               # ContentDB 조립
  ui/                      # React. core 공개 API와 content만 사용
    main.tsx controller.ts
    screens/ Title Map Combat Reward Shop Rest Event Treasure BossRelic End
    components/ Card Monitor DiseasePanel EmrBanner Tooltip PileView ...
    styles/
  sim/                     # Node 전용
    bots/ random.ts greedy.ts
    decks.ts cli.ts report.ts
tests/
docs/
scripts/build-artifact.mjs # 배포용 단일 HTML 조립
```

**의존 방향**: `content → core/types`, `core → (없음)`, `ui → core, content`, `sim → core, content`. core는 콘텐츠를 import하지 않고, 진입점이 `installContent(db)`로 주입한다.

### 3.3 core 공개 API
```ts
installContent(db: ContentDB): void
validateContent(db: ContentDB): { errors: string[]; warnings: string[] }
newRun(seed: string, options?: RunOptions): GameState
step(state: GameState, action: Action): { state: GameState; events: GameEvent[] }
legalActions(state: GameState): Action[]
previewInteractions(state: GameState, cardUid: Uid, targetUid?: Uid): InteractionPreview[]
previewDamage(state: GameState, cardUid: Uid, targetUid: Uid): DamagePreview   // 지식 단계로 필터링
visibleEnemyInfo(state: GameState, enemyUid: Uid): EnemyView
describeCard(cardId: CardId, upgraded: boolean): CardText
stateHash(state: GameState): string
```
- `step`은 입력 상태를 바꾸지 않는다(`structuredClone` 후 변경).
- **UI는 `EnemyView`와 `DamagePreview`만 쓴다.** 원본 적 상태의 숨겨진 필드를 읽지 않는다. 디버그 패널만 예외.

### 3.4 행동(Action)
```ts
type Action =
  | { type: "play_card"; cardUid: Uid; targetUid?: Uid }
  | { type: "end_turn" }
  | { type: "choose_cards"; uids: Uid[] }            // 대기 선택 해소 (손패·덱 공용)
  | { type: "move_map"; nodeId: string }
  | { type: "claim_reward"; item: number; choice?: number }   // 카드 보상이면 choice = 카드 번호
  | { type: "skip_reward"; item: number }
  | { type: "shop_buy"; slot: string } | { type: "shop_remove" }
  | { type: "rest_choose"; option: "rest" | "upgrade" | "purge" }
  | { type: "event_choose"; optionId: string }
  | { type: "pick_relic"; index: number }
  | { type: "leave" };                                // 보상·상점·보물·휴식 후 지도로
```
불법 행동이면 상태를 바꾸지 않고 `{ type: "action_rejected", reason }` 이벤트만 돌려준다. 덱에서 카드를 고르는 행동(업그레이드, 제거, 정리)은 `pending: deck_select`를 만든 뒤 `choose_cards`로 해소한다.

### 3.5 상태(GameState)
```ts
interface GameState {
  schemaVersion: 2;
  seed: string;
  rng: Record<RunRngStream, RngState>;
  phase: "map" | "combat" | "reward" | "shop" | "rest" | "event" | "treasure" | "boss_relic" | "gameover" | "victory";
  run: RunState;
  combat?: CombatState;
  reward?: RewardState; shop?: ShopState; event?: EventState; treasure?: TreasureState; bossRelic?: RelicId[];
  pending?: PendingChoice;
  nextUid: number;
  actionCount: number;
}
interface RunState {
  act: 1 | 2 | 3; floor: number; map: MapState; currentNode?: string;
  vitality: number; maxVitality: number; gold: number;
  deck: CardInstance[]; relics: RelicInstance[];
  casebook: Partial<Record<DiseaseId, "confirmed">>;
  rarePity: number; shopRemovalCount: number;
  combatsThisAct: number; lastEncounter?: string;
  patient: { surname: string; age: number; sex: "M" | "F" };
  flags: Record<string, number>;           // 피로 등 다음 전투 효과
  stats: RunStats;
}
interface CombatState {
  kind: "normal" | "elite" | "gate" | "boss"; encounterId: string;
  turn: number; orders: number; ordersPerTurn: number; stability: number;
  drawPile: CardInstance[]; hand: CardInstance[]; discardPile: CardInstance[]; exhaustPile: CardInstance[];
  limbo: CardInstance[];
  enemies: EnemyState[];
  activeDrugs: ActiveDrug[];
  patientStatuses: StatusStack[];
  queue: QueuedEffect[];                  // 직렬화 가능
  delayed: DelayedEffect[];
  costModifiers: CostModifier[];
  current?: { cardUid: Uid; pct: number; suppressSideEffects: boolean; extraSideEffects: number };
  counters: Record<string, number>;       // cardsPlayedThisTurn, drugsPlayedThisTurn, fluidsGiven …
  flags: Record<string, number>;          // drugHalfLifeBonus, orderSetArmed, retainAll, durUsed, firstDrugFree …
  log: LogEntry[];                         // 경과 기록 (UI용, 최근 60개)
  rng: Record<CombatRngStream, RngState>;
}
interface EnemyState {
  uid: Uid; diseaseId: DiseaseId; variantId?: string;
  severity: number; maxSeverity: number; stability: number;
  statuses: StatusStack[];
  knowledge: 0 | 1 | 2; diagnosisPoints: number;
  acquiredResistance: Record<Tag, number>; resistanceFraction: number;
  phase: number;                           // 0 = 기본 단계
  ai: { history: MoveId[]; planned: PlannedMove[]; seqIndex: number };
  countdowns: { moveId: MoveId; turnsLeft: number }[];
  revealNext: boolean; targetedBonus: number;
}
interface PlannedMove { moveId: MoveId; hits?: number }
interface ActiveDrug { uid: Uid; cardId: CardId; tags: Tag[]; turnsLeft: number; order: number }
```

### 3.6 난수 생성기
- **sfc32**(32비트 정수 4개 상태). 시드 문자열은 `cyrb128`로 해시한다.
- **런 스트림**: `map`, `encounter`, `reward`, `shop`, `event`, `relic`, `profile`. 시드 + `":"` + 스트림 이름으로 파생.
- **전투 스트림**: `shuffle`, `enemyAi`, `cardEffect`. 전투 시작 때 `seed:act:floor:스트림명`으로 새로 파생. 앞선 전투의 셔플 횟수나 선택이 이후 전투의 난수를 바꾸지 않는다.
- `sim` 전용 스트림은 봇 행동에만 쓰고 GameState에 넣지 않는다.
- 모든 스트림 상태는 숫자로 GameState에 저장되어 저장·복제로 그대로 보존된다.

### 3.7 효과 처리 순서

**큐 규칙.** 큐 앞에서부터 꺼내 실행한다. 실행 중 생긴 **트리거 반응은 큐 맨 앞에** 넣는다(원인 효과 직후, 남아 있던 효과보다 먼저). 한 `step`에서 1,000회를 넘으면 오류.

**트리거 수집 순서**(같은 사건에 반응이 여럿일 때): 유물(획득 순) → 환자 상태 → 투여 중 약물(등록 순) → 적(위치 순, 적마다 패시브 → 상태) → 손패의 부작용 카드(손 순서). 턴 시작·종료는 아래 **단계의 나열**이고, 각 단계 안에서 이 순서를 쓴다 (R32).

**카드 사용** (`play_card`) (R3, R4)
1. 검증: 비용(수정자 반영), 대상, 사용 가능 여부
2. 오더 지불, 카드를 `limbo`로, `current` 설정, 카운터 증가, 비용 수정자 사용 횟수 차감
3. 다음 명령들을 큐 **뒤에** 차례로 넣는다
   - 약물이면 `administer` (실행될 때 등록·상호작용 해석, 발동 규칙의 효과를 큐 맨 앞에)
   - 카드 효과들
   - 약물이면 `emit_side_effects` (실행될 때 `current`의 억제·추가 횟수를 읽는다)
   - "오더 세트"가 장전되어 있고 약물이면, 위 세 묶음을 한 번 더 (장전 해제)
   - `card_played` (트리거 발생)
   - `finish_card` (카드를 버린 더미 또는 소진 더미로, `current` 해제)
4. 큐를 비운다. 대기 선택이 생기면 멈추고, `choose_cards` 뒤에 재개한다

**플레이어 턴 시작**
1. 턴 +1, 환자 안정화 0
2. 오더를 `ordersPerTurn`으로 (피로 등 수정 반영)
3. `delayed` 틱 (0이 되면 효과 실행)
4. 투여 중 약물의 `turn_start` 트리거
5. 환자 상태의 턴 시작 효과 (저산소 → 오더 −1, 저혈압 → 승압제 없으면 활력 손실, 출혈 경향)
6. 적 패시브의 `turn_start` (상부위장관 출혈의 지속 출혈 등)
7. **투여 중 약물 지속 −1**, 0이면 종료 (R2)
8. 드로우 5장 (과진정 등 수정 반영). 뽑을 더미가 비면 버린 더미를 `shuffle` 스트림으로 섞는다. 손이 10장이면 버린 더미로. 뽑힌 카드의 `on_draw` 발동
9. 유물 `turn_start`

**플레이어 턴 종료** (`end_turn`)
1. SBAR 인계 유물이 있으면 보존할 카드 1장 선택(대기 선택, 0장 가능)
2. 손패의 `end_of_turn_in_hand` 발동
3. `ethereal` 소진
4. 보존 카드(보존 키워드, 인계, SBAR 선택)를 빼고 손패를 버린다
5. 이번 턴 한정 효과 정리(턴 한정 비용 수정자, 의도 공개 표시)

**적 턴** (적마다 위치 순)
1. 적 안정화 0
2. 기존 카운트다운 틱: 모두 −1, 0이 된 것은 발동 (R31)
3. `planned[0]` 행동 실행 (행동이 새 카운트다운을 등록하면 다음 적 턴부터 틱)
4. 적 턴 종료 효과 (염증: 스택만큼 회복 후 −1, 패시브 `enemy_turn_end`)

**라운드 종료**
1. 지속형 상태(취약, 위축, 탈수) −1. 이번 적 턴에 새로 걸린 상태는 한 번 건너뛴다
2. 각 적의 다음 의도를 계획한다 (`enemyAi` 스트림)
3. 플레이어 턴 시작으로

**전투 종료 판정**은 큐 명령 하나가 끝날 때마다 한다. 모든 적의 중증도가 0이면 승리, 활력이 0이면 즉시 게임 오버.
- 승리: `combat_end` 트리거 → 전투 한정 카드 제거 → 보상 단계
- 적 한 명이 치료되면(`enemy_cured`) 그 적의 카운트다운과 지연 효과는 사라진다

### 3.8 UI 구조와 비주얼 방향

**구조**
- `controller.ts`가 GameState를 보관한다. `dispatch(action)` → `core.step` → 새 상태 저장 → 이벤트를 **연출 큐**로. React와는 `useSyncExternalStore`로 연결한다.
- 화면은 상태를 그대로 그린다. 연출은 이벤트를 재생할 뿐 결과를 바꾸지 않는다. 연출 속도 설정(보통/빠름/끔)이 있고, 연출을 꺼도 `stateHash`는 같다.
- 논리 해상도 **1280×720 무대**를 창 크기에 맞춰 축소·확대한다(레터박스). 세로로 좁은 화면에서는 가로 회전을 안내한다 (R39).

**비주얼 방향: "병원 서식과 모니터"**
AI 생성 디자인의 흔한 인상(보라·파랑 그라데이션, 유리 질감, 이모지 아이콘, 어두운 바탕에 형광 하나, 크림색 종이에 세리프)을 피하고, 실제 병원의 재료에서 시각 언어를 가져온다.

| 재료 | 쓰는 곳 | 특징 |
|---|---|---|
| **복사식 처방 용지** (흰 NCR 용지, 청흑색 인쇄) | 카드, 보상, 이벤트 메모 | 인쇄된 괘선, 양식 번호, 바코드, 붉은 도장, 파란 볼펜 메모 |
| **EMR 화면** (차가운 회색 창, 청록 제목 막대) | 상단 환자 배너, 패널 틀, 로그 | 조밀한 정보, 표, 등폭 숫자 |
| **환자 모니터** (검은 화면에 파라미터별 색) | 환자 패널 | 심박(초록), 안정화(청록), 경고(빨강), 오더(노랑). 활력이 낮아질수록 심전도 속도가 빨라진다 |
| **판독 라이트박스와 필름** | 질병 패널 | 지식 단계가 오를수록 필름이 선명해진다(흐림 → 병변 표시 → 확진 도장) |
| **병실 커튼** (옅은 청록 주름) | 전투 배경 | |
| **임상 경로표** (모눈 인쇄 양식) | 지도 | 지나온 길은 파란 볼펜, 현재 위치는 빨간 동그라미 |

- **서체**: 본문 IBM Plex Sans KR, 숫자·코드 IBM Plex Mono, 모니터 수치 Barlow Condensed, 도장·제목 Black Han Sans, 손글씨 메모 Nanum Pen Script(아껴서 쓴다).
- **색 토큰**: 커튼 `#D3E2DC`, EMR 회색 `#E6EAEE`, 제목 막대 `#2C5D70`, 용지 `#FAFBF8`, 잉크 `#1C2433`, 도장 빨강 `#C23A2B`, 볼펜 파랑 `#2346A0`, 형광펜 `#F2E36B`, 모니터 바탕 `#0B100F`, 심박 초록 `#45E08A`, 청록 `#3BC9E6`, 경고 `#F05D5E`, 노랑 `#F3D35B`.
- **카드 종류 띠**: 처치 청록 `#2C5D70`, 약물 산딸기색 `#B0425A`(주사제 라벨), 진단 검사실 초록 `#3C7D4A`, 부작용 겨자색 빗금 `#C99A2E`.
- **아이콘**: 이모지 금지. 유물은 의료 약어 배지(5R, DUR, SBAR, NEWS, ACLS…), 의도·노드·카드 종류는 직접 그린 SVG 글리프.

**전투 화면 배치** (1280×720)
- 상단: EMR 환자 배너(환자, 막·층, 활력, 예산, 가이드라인 배지, 처방 목록, 설정)
- 좌측: 환자 모니터(활력, 안정화, 상태, 투여 중 약물 = 주입 펌프 표시와 남은 턴)
- 중앙~우측: 질병 라이트박스(주호소 또는 진단명, 단서, 중증도 막대, 의도, 진단 게이지, 반응표, 내성, 카운트다운)
- 하단: 손패, 오더 도장, 뽑을·버린·소진 더미
- 약물 카드를 가리키면 **DUR 점검 창**, 카드를 대상 위로 가져가면 예상 중증도 감소와 반응 등급(알려진 경우만)
- 우측 가장자리: 경과 기록(접을 수 있음)
- 키보드: 숫자 1–0 카드 선택, E 턴 종료, Esc 취소

**연출과 소리** (구현)
- 쓴 카드는 완료·폐기 더미로 날아가고, 새로 뽑은 카드는 대기 더미에서 손으로 들어온다. 피해 숫자, 진단 도장(감별·확진·치료), 턴 표시, 상호작용 알림은 이벤트를 재생한다.
- 효과음은 WebAudio로 합성한다(종이 넘기는 소리, 모니터 경보, 도장, 볼펜 딸깍). 첫 입력 전에는 소리를 내지 않고, 설정에서 끌 수 있다.
- `prefers-reduced-motion`이면 장식 움직임을 끄고 알림 글자는 제자리에서 나타났다 사라진다.
- 첫 전투에는 시작 유물 "수첩"의 메모로 조작 요령 네 줄을 보인다(닫을 수 있음).

**디버그 패널**: v1에서는 만들지 않았다. 화면 확인은 `scripts/screenshots.ts`(봇으로 각 단계 상태를 만들어 주입), 규칙 확인은 시뮬레이터와 테스트가 맡는다 (`DECISIONS.md`).

### 3.9 저장
- 로컬 저장소 키 `orderset.save`: `{ schemaVersion, state, actionLog }`. 모든 `step` 뒤에 저장한다. 모든 접근은 `try/catch`로 감싸고 저장소가 없어도 게임이 돌아가야 한다.
- 불러올 때 `schemaVersion`을 확인하고 마이그레이션 함수를 적용한다. 없는 카드·유물 ID는 "폐기된 카드"·"폐기된 유물"로 바꾸고 경고한다.
- **내보내기**: `{ seed, actionLog, finalHash }`. `npm run replay 파일.json`은 시드부터 재생해 해시 일치를 확인한다.

### 3.10 콘텐츠 검증 (`validateContent`)
- ID 중복 없음, 모든 참조 존재(부작용 카드, 인카운터의 질병, 질병의 행동, 규칙의 태그, `custom` ID, 원인균)
- 모든 태그가 `content/tags.ts`에 선언됨, 모든 특성이 선언됨
- 약물·질병·규칙·부작용 카드에 `medical` 필드
- 모든 카드의 `describeCard` 성공
- 부작용 수가 희귀도별 상한(D4) 이내
- 항생제 카드(`abx` 태그)는 모든 원인균에 대한 스펙트럼 등급을 가짐
- 카드 가치가 예산 ±30% 이내 (경고)
- `npm run content:report`: 희귀도·종류별 개수, fidelity별 목록(`unverified` 우선), `custom` 비율, 예산 이탈 카드

### 3.11 배포용 단일 HTML
`npm run build:artifact`는 React·ReactDOM을 외부 전역(`React`, `ReactDOM`)으로 두고 앱을 IIFE로 묶은 뒤, CSS와 JS를 인라인한 단일 HTML을 `dist-artifact/order-set.html`로 만든다. React는 cdnjs의 18.3.1 UMD 빌드를 `<script src>`로 불러오고, cdnjs가 실패하면 jsdelivr의 같은 파일을 불러온다. 둘 다 실패하면 화면에 안내 문구를 띄운다. 글꼴은 Google Fonts만 쓴다.
- 무대는 뷰포트 요소 크기에 맞춰 줄이고, 휴대폰의 안전 영역(`env(safe-area-inset-*)`)을 피하며, 폭 900px 미만에서는 좌우 16px 여백을 둔다.
- 아티팩트 뷰어의 `window.claude.hot`이 있으면 진행 상태를 넘겨받아 다시 게시해도 판이 이어진다.

---

## 4. 데이터 스키마

### 4.1 태그와 특성

```ts
interface TagDef {
  id: Tag; nameKo: string;
  kind: "therapeutic" | "class" | "property";
  // therapeutic: 치료 기전. indications에 맞는 질병에만 효과(명시 항목이 없을 때)
  // class: 약물 계열(상호작용·내성용). property: 성질(qt_prolong, nephrotoxic …)
  indications?: { categories?: DiseaseCategory[]; traits?: Trait[] };
}
type DiseaseCategory = "infection" | "metabolic" | "cardiovascular" | "thrombotic" | "respiratory"
  | "neuro" | "bleeding" | "abdominal" | "allergic" | "renal";
```
분류 10개(R26): 감염, 대사, 심혈관, 혈전, 호흡, 신경, 출혈, 복부, 알레르기, 신장.

**질병 특성(traits)** — 적응증과 카드 조건에 쓴다.

| 특성 | 뜻 | 쓰는 곳 |
|---|---|---|
| `chest` | 흉부 질환 | 흉부 X선 보너스 |
| `cardiac` | 심장 질환 | 심전도 보너스 |
| `renal` | 신장·요로 | 소변 검사 보너스 |
| `us_visible` | 초음파로 보이는 질환 | 현장 초음파 보너스 |
| `hypovolemia` | 순환 혈액량 부족 | 수액 적응증 |
| `shock` | 쇼크 | 승압제 적응증 |
| `volume_overload` | 체액 과다 | 고리 이뇨제 적응증 |
| `hyperglycemia` | 고혈당 위기 | 인슐린 적응증 |
| `bronchospasm` | 기관지 연축 | β2 작용제·스테로이드 적응증 |
| `allergic` | 알레르기 반응 | 아나필락시스 치료 적응증 |
| `arterial_thrombus` | 동맥 혈전 | 항혈소판제·혈관 재개통 적응증 |
| `venous_thrombus` | 정맥 혈전 | 항응고제 적응증 |
| `thrombolysable` | 혈전용해 적응 | 혈전용해제 적응증 |
| `acs` | 급성 관상동맥 증후군 | β차단제 적응증, S3 |
| `arrhythmia` | 부정맥 | 항부정맥제·β차단제 적응증 |
| `shockable` | 충격 가능 리듬 | 제세동 적응증 |
| `agitation` | 초조 | 항정신병제 적응증 |
| `hyperammonemia` | 고암모니아혈증 | 암모니아 저하제 적응증 |
| `gi_bleed` | 위장관 출혈 | PPI·내시경 적응증 |
| `hemorrhage` | 출혈성 질환 | 수혈 적응증 |
| `source` | 감염원 제거 가능 | 감염원 제거 적응증 |
| `resp_failure` | 호흡 부전 | 기관 삽관 적응증 |
| `pleural` | 흉막강 질환 | 흉관 적응증 |
| `pericardial` | 심낭 질환 | 심낭 천자 적응증 |
| `renal_failure` | 신부전 | 투석 적응증 |

### 4.2 카드
```ts
interface CardDef {
  id: CardId; nameKo: string; nameEn: string;
  kind: "procedure" | "drug" | "diagnostic" | "side_effect";
  rarity: "starter" | "common" | "uncommon" | "rare" | "special";
  cost: number | "unplayable";
  target: "enemy" | "none";
  tags: Tag[];
  keywords?: Keyword[];              // exhaust, ethereal, retain, targeted, unplayable, power
  effects: EffectOp[];
  drug?: {
    halfLife: 1 | 2 | 3 | 4;
    whileActive?: TriggerDef[];
    sideEffects: SideEffectSpec[];
    spectrum?: Partial<Record<OrganismId, Grade>>;   // 항생제만. 모든 원인균 필수
  };
  sideEffect?: { harm: number; persistent?: boolean; behavior: TriggerDef[]; purgeCost?: number };
  upgrade: Partial<Pick<CardDef, "cost" | "effects" | "keywords">> & { drug?: Partial<CardDef["drug"]> };
  textOverride?: string;
  medical?: MedicalNote;             // drug·side_effect 필수
}
interface SideEffectSpec { card: CardId; count: number; dest: "discard" | "draw_random" | "hand" }
type Grade = "key" | "weak" | "normal" | "resistant" | "immune" | "harmful";
```

### 4.3 질병
```ts
interface DiseaseDef {
  id: DiseaseId; nameKo: string; nameEn: string;
  presentation: { complaint: string; clues: string[] };     // 0단계: complaint + clues[0]
  category: DiseaseCategory; traits: Trait[];
  tier: "normal" | "elite" | "gate" | "boss";
  severity: [number, number];
  diagnosis: { partialAt: number; confirmAt: number };
  organism?: OrganismId;                                  // 감염 질환
  effectiveness: Partial<Record<Tag, Grade>>;
  acquiredResistance?: { tags: Tag[]; gainPerHit: number; start?: Partial<Record<Tag, number>> };
  passives?: TriggerDef[];
  variants?: { id: string; weight: number; nameKo: string; organism?: OrganismId;
               effectivenessOverride?: Partial<Record<Tag, Grade>>; passives?: TriggerDef[] }[];
  phases?: { id: string; nameKo: string; enterAtSeverityPct?: number;
             traitsAdd?: Trait[]; traitsRemove?: Trait[];
             effectivenessOverride?: Partial<Record<Tag, Grade>>;
             moves?: MoveDef[]; ai?: AiPattern; onEnter?: EffectOp[] }[];
  moves: MoveDef[];
  ai: AiPattern;
  art: { region: "head" | "chest" | "abdomen" | "pelvis" | "leg" | "body"; lesion: [number, number, number] };
  medical: MedicalNote;
}
interface MoveDef {
  id: MoveId; nameKo: string;
  intent: IntentPart[];                       // 예: [{kind:"attack", value:5, hits:2}, {kind:"debuff"}]
  hitsRange?: [number, number];               // 계획 시 enemyAi 스트림으로 횟수 결정
  effects: EffectOp[];
}
type AiPattern = {
  opening?: MoveId[];                         // 처음 몇 턴 고정
  rules?: { when: Condition; move: MoveId; once?: boolean }[];   // 위에서부터 첫 번째로 맞는 규칙
  weights: Partial<Record<MoveId, number>>;   // 규칙이 없으면 가중 추첨
  noRepeat?: MoveId[];                        // 직전과 같은 행동 금지
  maxInARow?: number;
};
```
AI 조건에는 `{ noCountdown: true }`(카운트다운이 없음)와 `turnAtLeast`를 쓸 수 있다.

### 4.4 피해 계산 파이프라인 (R1, R5, R36)

기호:
- `d0` 기본 피해, `a` 공격자 고정 가산(질병: 악화 + 산증 [+ 면역억제 보정] / 플레이어: 유물 가산)
- `M` 대상의 현재 반응표(기본 → 변이 → 단계 순으로 덮어씀), `O` 대상의 원인균
- `g(tag)` 태그 하나의 등급

1단계. 가산: `d1 = max(0, d0 + a)`
2단계. **금기 판정**: 카드의 태그 중 하나라도 `M`에서 `harmful`이면, 또는 항생제 스펙트럼 `S[O]`가 `harmful`이면 금기다. 금기 반응은 대상 중증도를 `max(6, floor(d1 / 2))` 회복시키고 악화 1을 준다(`harmful_treatment`).
   - **약물은 전신 금기**: 약물 카드는 투여하는 순간(`administer`) 살아 있는 모든 질병에 대해 금기를 판정한다. 대상으로 고르지 않은 질병도 반응한다. 같은 카드의 피해 명령은 금기 대상에게 0(무효)으로 끝난다. 반응이 두 번 나지 않게 하기 위해서다.
   - **처치(약물이 아닌 카드)**는 피해 명령이 금기 대상에 닿을 때 반응한다.
   - DUR 점검 창은 감별 이상인 질병에 대한 금기를 미리 알린다. 금기가 변이(원인균)에 달려 있으면 확진한 뒤에만 알린다. 모르고 투여해도 금기 반응은 똑같이 일어난다.
3단계. **치료 등급 `e`**
   - 치료 태그(`kind: therapeutic`)마다: `M`에 항목이 있으면 그 등급, 없으면 적응증(분류·특성)에 맞을 때 `normal`, 아니면 "해당 없음"
   - 항생제(`drug.spectrum` 보유): `M["abx"]`가 있으면 그 등급, 없으면 대상에 원인균이 있을 때 `S[O]`(없으면 `immune`), 원인균이 없으면 "해당 없음"
   - 치료 근거가 하나라도 있으면 `e` = 그중 **가장 좋은 등급**의 배율. 모두 "해당 없음"이면 `e = 0`(적응증 아님)
   - 치료 태그도 스펙트럼도 없는 카드(범용 처치)는 `e = 100`
   - 계열·성질 태그에 `M` 항목이 있으면(금기 제외) `e = floor(e × 등급 / 100)`
   - 상한: `e = min(200, e)`
4단계. 배율 목록 `[e, t, r, s, v, w, m…]`
   - `t` 표적(확진이면 150 + 교수 회진 보너스, 아니면 100), `r` 내성, `s` 현재 카드 배율(`current.pct`), `v` 대상 취약 150, `w` 공격자 위축 75, `m` 유물 배율(광범위 항생제 프로토콜 130 등)과 명령의 조건부 배율(`mods`)
   - `P = 100`에서 시작해 배율마다 `P = floor(P × m / 100)`
   - `d = floor(d1 × P / 100)`
5단계. 안정화 흡수: `absorbed = min(stability, d)`, 안정화 −= `absorbed`, 중증도(또는 활력) −= `d − absorbed`

질병이 환자를 공격할 때는 `e, t, r, s = 100`이다. 의도에 표시되는 수치도 같은 함수로 계산한다.

### 4.5 상태, 유물, 트리거
```ts
interface StatusDef {
  id: StatusId; nameKo: string; owner: "patient" | "enemy" | "both";
  stacking: "intensity" | "duration";
  decay: "none" | "round_end" | "custom";
  description: string;
  medical?: MedicalNote;
}
interface RelicDef {
  id: RelicId; nameKo: string; nameEn?: string; badge: string;   // 배지 약어
  tier: "starter" | "common" | "uncommon" | "boss";
  triggers: TriggerDef[];
  modifiers?: RelicModifier[];     // ordersPerTurn, cardRewardChoices, noRestHeal, maxCardsPerTurn, abxPct, resistanceHalf, diagnoseBonus, abxBonusConfirmed
  description: string; flavor: string;
}
interface TriggerDef {
  on: "combat_start" | "turn_start" | "turn_end" | "card_played" | "drug_administered" | "drug_expired"
    | "interaction_fired" | "damage_dealt" | "damage_taken" | "enemy_cured" | "knowledge_up"
    | "countdown_started" | "vitality_below" | "card_drawn" | "combat_end" | "enemy_turn_end";
  condition?: Condition;
  effects: EffectOp[];
  oncePerCombat?: boolean;
}
```

### 4.6 이벤트(GameEvent)
`card_drawn`, `card_played`, `drug_administered`, `drug_expired`, `interaction_fired{ruleId, kind}`, `side_effect_added`, `damage{target, amount, absorbed}`, `harmful_treatment`, `ineffective`, `stability_gained`, `status_applied`, `knowledge_up{level}`, `intent_set`, `countdown_tick`, `countdown_fired`, `phase_changed`, `enemy_cured`, `patient_died`, `shuffle`, `reward_offered`, `action_rejected` 등. 모두 직렬화 가능한 평범한 객체다.

---

## 5. 콘텐츠 목록 (v1.1)

> 수치는 D4 예산으로 1차 설정한 값이고 시뮬레이션으로 조정한다. 표기: `[태그]`는 피해에 적용되는 치료 태그, "표적"은 키워드, "소진"은 사용 후 소진 더미로.

### 5.1 시작 덱 (10장)과 시작 유물

| ID | 카드 | 수 | 종류 | 비용 | 효과 | 업그레이드 |
|---|---|---|---|---|---|---|
| `first_aid` | 응급 처치 First aid | 4 | 처치 | 1 | 중증도 6 | 9 |
| `stabilize` | 안정화 조치 Stabilize | 4 | 처치 | 1 | 안정화 5 | 8 |
| `history` | 병력 청취 History taking | 1 | 진단 | 0 | 진단 1, 드로우 1 | 진단 2 |
| `acetaminophen` | 아세트아미노펜 acetaminophen | 1 | 약물 `analgesic` | 1 | 안정화 5, 대상 위축 1. 반감기 2, 부작용 없음 | 안정화 7, 위축 2 |

시작 유물 **인턴 수첩**: 전투 시작 시 첫 번째 적 진단 +1.

### 5.2 카드 64장 (시작 카드 제외)

희귀도 합계: 일반 36 / 고급 20 / 희귀 8.

#### 진단 (10)
| ID | 카드 | 희귀도 | 비용 | 효과 | 업그레이드 |
|---|---|---|---|---|---|
| `physical_exam` | 신체 진찰 | 일반 | 1 | 진단 2, 안정화 4 | 안정화 7 |
| `blood_test` | 혈액 검사 | 일반 | 1 | 진단 2, 드로우 1 | 진단 3 |
| `urinalysis` | 소변 검사 | 일반 | 0 | 진단 1. 대상이 신장 특성 또는 대사 분류면 진단 +2 | 기본 진단 2 |
| `chest_xray` | 흉부 X선 | 일반 | 1 | 진단 2, 안정화 3. 흉부 특성이면 진단 +2 | 안정화 6 |
| `ecg` | 심전도 | 일반 | 0 | 진단 1. 심장 특성이면 진단 +2, 다음 의도 공개 | 기본 진단 2 |
| `abga` | 동맥혈 가스 분석 (ABGA) | 일반 | 1 | 진단 2. 대사·호흡 분류면 드로우 2 | 진단 3 |
| `culture` | 배양 검사 | 고급 | 1 | 진단 1. 2턴 뒤 같은 대상 진단 4 | 비용 0 |
| `pocus` | 현장 초음파 (POCUS) | 고급 | 0 | 진단 2. 초음파 특성이면 진단 +3. 소진 | 진단 3 |
| `ct_scan` | CT | 고급 | 1 | 모든 적 진단 3 | 진단 4 |
| `attending_rounds` | 교수 회진 | 희귀 | 1 | 대상 즉시 확진. 이번 전투 동안 그 대상에 대한 표적 배율 +50. 소진 | 비용 0 |

#### 처치 (25)
| ID | 카드 | 희귀도 | 비용 | 효과 | 업그레이드 |
|---|---|---|---|---|---|
| `supportive_care` | 보존적 치료 | 일반 | 1 | 중증도 8 | 11 |
| `early_mobilization` | 조기 거동 | 일반 | 1 | 중증도 5, 안정화 4 | 7, 6 |
| `reassessment` | 재평가 | 일반 | 1 | 중증도 6. 대상이 감별 단계 이상이면 대신 10 | 8 / 13 |
| `oxygen` | 산소 투여 | 일반 | 1 | 안정화 6, 환자의 저산소 전부 제거 | 안정화 9 |
| `source_control` | 감염원 제거 | 일반 | 1 | 중증도 11 `[source_control]`. 표적 | 15 |
| `direct_pressure` | 압박 지혈 | 일반 | 1 | 안정화 6, 출혈 경향 제거, 손의 출혈 카드 1장 소진 | 안정화 9 |
| `iv_access` | 정맥로 확보 | 일반 | 0 | 이번 턴 다음 약물 카드 비용 −1 | + 드로우 1 |
| `chart_review` | 차트 정리 | 일반 | 0 | 드로우 2, 손패 1장 버리기(선택) | 드로우 3 |
| `symptomatic` | 대증 치료 | 일반 | 0 | 손의 부작용 카드 1장 소진(선택), 드로우 1 | 2장까지 |
| `monitoring` | 집중 모니터링 | 일반 | 1 | 안정화 5, 진단 1, 다음 의도 공개 | 안정화 8 |
| `med_reconciliation` | 처방 감사 | 일반 | 1 | 투여 중 약물 전부 종료. 종료한 약물 1개당 드로우 1(최대 3) | 비용 0 |
| `intensive_care` | 집중 치료 | 고급 | 2 | 중증도 18 | 24 |
| `defibrillation` | 제세동 | 고급 | 1 | 중증도 20 `[defib]`. 소진 | 26 |
| `central_line` | 중심정맥관 삽입 | 고급 | 1 | 지속: 이번 전투 동안 이후 투여하는 약물의 지속 +1. 안정화 4. 소진 | 비용 0 |
| `intubation` | 기관 삽관 | 고급 | 2 | 안정화 12, 저산소 전부 제거, 중증도 10 `[airway]` | 안정화 16, 중증도 14 |
| `chest_tube` | 흉관 삽입 | 고급 | 1 | 중증도 14 `[chest_tube]`, 안정화 4 | 중증도 20 |
| `transfusion` | 수혈 | 고급 | 1 | 중증도 12 `[transfusion]`, 활력 5 회복. 소진 | 활력 8 |
| `consult` | 협진 의뢰 | 고급 | 1 | 무작위 고급 카드 1장을 손에(이번 턴 비용 0, 전투 한정). 소진 | 비용 0 |
| `handoff` | 인계 | 고급 | 1 | 이번 턴 종료 시 손패 전부 보존, 드로우 1 | 비용 0 |
| `pericardiocentesis` | 심낭 천자 | 고급 | 1 | 중증도 16 `[pericardiocentesis]`, 진단 2 | 중증도 22 |
| `endoscopy` | 내시경 지혈술 | 고급 | 2 | 중증도 18 `[endoscopy]`, 출혈 카드 전부 소진, 안정화 6 | 중증도 24 |
| `dialysis` | 투석 | 희귀 | 2 | 신독성·고칼륨혈증 카드 전부 소진, 투여 중 약물 전부 종료, 안정화 10, 중증도 20 `[dialysis]` | 비용 1 |
| `rapid_response` | 신속대응팀 호출 | 희귀 | 0 | 오더 +1, 드로우 3. 소진 | 오더 +2 |
| `order_set` | 오더 세트 | 희귀 | 1 | 다음에 쓰는 약물 카드가 한 번 더 발동(투여·상호작용·부작용 포함) | 비용 0 |
| `revascularization` | 혈관 재개통술 (PCI·혈전 제거술) | 희귀 | 2 | 중증도 24 `[revascularization]`, 안정화 8 | 중증도 32 |

#### 약물 (29)
| ID | 약물 | 희귀도 | 비용 | 효과 | 태그 | 반감기 | 부작용 | 업그레이드 |
|---|---|---|---|---|---|---|---|---|
| `ceftriaxone` | 세프트리악손 ceftriaxone | 일반 | 1 | 중증도 11, 표적 | abx, beta_lactam, cdi_risk | 2 | 발진 → discard | 15 |
| `pip_tazo` | 피페라실린-타조박탐 piperacillin-tazobactam | 고급 | 1 | 중증도 16 | abx, beta_lactam, broad_spectrum, cdi_risk | 2 | 장내세균 교란 → draw_random | 21 |
| `meropenem` | 메로페넴 meropenem | 희귀 | 1 | 중증도 20 | abx, carbapenem, broad_spectrum, cdi_risk | 2 | 장내세균 교란 → hand | 26 |
| `vancomycin` | 반코마이신 vancomycin | 고급 | 1 | 중증도 16, 표적 | abx, glycopeptide, nephrotoxic | 3 | 신독성 → draw_random | 21 |
| `gentamicin` | 겐타마이신 gentamicin | 일반 | 1 | 중증도 14 | abx, aminoglycoside, nephrotoxic | 2 | 신독성 → discard | 18 |
| `levofloxacin` | 레보플록사신 levofloxacin | 일반 | 1 | 중증도 12 | abx, fluoroquinolone, qt_prolong, cdi_risk | 2 | 오심 → discard | 16 |
| `clarithromycin` | 클래리스로마이신 clarithromycin | 일반 | 1 | 중증도 12 | abx, macrolide, qt_prolong, cyp3a4_inhibitor | 2 | 오심 → discard | 16 |
| `metronidazole` | 메트로니다졸 metronidazole | 일반 | 1 | 중증도 12, 표적 | abx, nitroimidazole | 2 | 오심 → discard | 16 |
| `heparin` | 헤파린 heparin | 일반 | 1 | 중증도 14 `[anticoagulant]` | anticoagulant | 2 | 출혈 → discard | 18 |
| `aspirin` | 아스피린 aspirin | 일반 | 0 | 중증도 8 `[antiplatelet]` | antiplatelet | 3 | 출혈 → discard | 11 |
| `alteplase` | 알테플라제 alteplase (tPA) | 희귀 | 2 | 중증도 28 `[thrombolytic]` | thrombolytic | 1 | 출혈 → hand | 36 |
| `metoprolol` | 메토프롤롤 metoprolol | 일반 | 1 | 중증도 10 `[beta_blocker]`, 안정화 3 | beta_blocker | 3 | 서맥 → discard | 13, 4 |
| `amiodarone` | 아미오다론 amiodarone | 희귀 | 1 | 중증도 18 `[antiarrhythmic]`, 부정맥 카드 전부 소진 | antiarrhythmic, qt_prolong, cyp3a4_inhibitor | 4 | 폐 독성(지속) → discard | 24 |
| `norepinephrine` | 노르에피네프린 norepinephrine | 고급 | 1 | 안정화 6, 중증도 8 `[vasopressor]`. 투여 중 턴 시작 시 안정화 3 | vasopressor | 2 | 부정맥 → draw_random | 안정화 9, 중증도 10 |
| `epinephrine` | 에피네프린 epinephrine | 고급 | 1 | 중증도 14, 안정화 4 | vasopressor, anaphylaxis_tx | 1 | 부정맥 → draw_random | 18, 6 |
| `furosemide` | 푸로세미드 furosemide | 일반 | 1 | 중증도 12 `[loop_diuretic]`, 고칼륨혈증 1장 소진 | loop_diuretic, k_lowering | 2 | 저칼륨혈증 → discard | 16 |
| `insulin` | 인슐린 insulin | 고급 | 1 | 중증도 16 `[insulin]`, 고칼륨혈증 전부 소진 | insulin, k_lowering | 2 | 저혈당 → draw_random | 21 |
| `kcl` | 염화칼륨 potassium chloride | 일반 | 0 | 저칼륨혈증 전부 소진, 안정화 4 | k_raising, electrolyte | 2 | 고칼륨혈증 → discard | 안정화 6 |
| `saline` | 생리식염수 normal saline | 일반 | 1 | 안정화 2, 중증도 5 `[fluid]`. 투여 중 턴 시작 시 안정화 2 | fluid | 2 | 없음 | 안정화 4, 중증도 8 |
| `dextrose` | 포도당 dextrose | 일반 | 0 | 저혈당 전부 소진, 안정화 3 | glucose | 2 | 없음 | 안정화 5 |
| `lactulose` | 락툴로오스 lactulose | 일반 | 1 | 중증도 14 `[ammonia_lowering]`, 착란 1장 소진 | ammonia_lowering | 2 | 오심 → discard | 18 |
| `morphine` | 모르핀 morphine | 고급 | 1 | 안정화 10, 활력 5 회복. 소진 | opioid, cns_depressant | 2 | 호흡억제 → draw_random | 안정화 13, 활력 7 |
| `midazolam` | 미다졸람 midazolam | 일반 | 0 | 이번 턴 다음 처치 카드 비용 −1, 안정화 3 | benzodiazepine, cns_depressant, cyp3a4_substrate | 2 | 과진정 → discard | + 드로우 1 |
| `haloperidol` | 할로페리돌 haloperidol | 일반 | 1 | 중증도 14 `[antipsychotic]`, 착란 1장 소진 | antipsychotic, qt_prolong | 3 | 과진정 → discard | 18 |
| `naloxone` | 날록손 naloxone | 일반 | 0 | 호흡억제 카드 전부 소진, 드로우 1 | opioid_antagonist | 1 | 없음 | 드로우 2 |
| `ondansetron` | 온단세트론 ondansetron | 일반 | 0 | 오심 카드 전부 소진, 안정화 3 | antiemetic, qt_prolong | 2 | 없음 | 안정화 5 |
| `methylprednisolone` | 메틸프레드니솔론 methylprednisolone | 고급 | 1 | 중증도 14 `[corticosteroid]`, 대상의 염증 전부 제거 | corticosteroid, immunosuppressive | 3 | 면역억제 → draw_random | 18 |
| `salbutamol` | 살부타몰 salbutamol | 일반 | 0 | 중증도 6 `[beta2_agonist]`, 고칼륨혈증 1장 소진 | beta2_agonist, k_lowering | 1 | 저칼륨혈증 → discard | 9 |
| `pantoprazole` | 판토프라졸 pantoprazole | 일반 | 1 | 중증도 10 `[ppi]`, 안정화 4 | ppi, cdi_risk | 3 | 없음 | 13, 5 |

"소진"은 전투 한정 사용 제한이다. 모든 부작용 카드는 개수 1이다.

### 5.3 항생제 감수성표 (스펙트럼)

K 특효 · W 우수 · N 보통 · R 저하 · I 무효. C. diff에 대한 금기는 `cdi_risk` 태그가 따로 판정한다.

| 원인균 | 화면 이름 | CRO | TZP | MEM | VAN | GEN | LVX | CLR | MTZ |
|---|---|---|---|---|---|---|---|---|---|
| `pneumococcus` | 폐렴알균 | W | N | N | N | I | W | R | I |
| `atypical` | 비정형균 | I | I | I | I | I | W | W | I |
| `ecoli` | 대장균 | W | N | N | I | W | N | I | I |
| `esbl` | ESBL 생성 대장균 | I | R | W | I | N | R | I | I |
| `mssa_strep` | 연쇄알균·MSSA | N | N | N | N | I | R | R | I |
| `mrsa` | MRSA | I | I | I | W | I | I | I | I |
| `intra_abdominal` | 장내세균+혐기균 | R | W | W | I | R | R | I | R |
| `cdiff` | C. difficile | I | I | I | W | I | I | I | W |
| `pseudomonas` | 녹농균 | I | W | W | I | N | N | I | I |
| `gram_neg` | 그람 음성 막대균 | N | W | W | I | W | N | I | I |
| `virus` | 바이러스 | I | I | I | I | I | I | I | I |
| `mixed_community` | 지역사회 세균 | N | N | N | N | N | N | N | N |

- 복강 내 감염(`intra_abdominal`)에서 혐기균 약과 그람 음성 약을 함께 쓰면 S5(배율 200)가 발동해 두 번째 약이 보통 효과를 낸다.
- 폐렴알균의 마크롤라이드 R은 국내 내성률을 반영했다(`simplified`).

### 5.4 부작용 카드 (15, 보상 풀 제외)
| ID | 카드 | h | 행동 |
|---|---|---|---|
| `nausea` | 오심 | 3 | 사용 불가. `purgeable(1)` |
| `rash` | 발진 | 2 | 사용 불가. `ethereal` |
| `nephrotoxicity` | 신독성 | 5 | 사용 불가. 턴 종료 시 손에 있으면 활력 −2 |
| `hypokalemia` | 저칼륨혈증 | 4 | 사용 불가. 손에 있는 동안 `qt_prolong` 약물을 쓰면 손에 부정맥 1장 |
| `hyperkalemia` | 고칼륨혈증 | 6 | 사용 불가. 턴 종료 시 손에 있으면 활력 −3 |
| `hypoglycemia` | 저혈당 | 6 | 뽑을 때 활력 −3. 사용 불가. `ethereal` |
| `resp_depression` | 호흡억제 | 8 | 뽑을 때 이번 턴 오더 −1. 사용 불가 |
| `oversedation` | 과진정 | 5 | 사용 불가. 턴 종료 시 손에 있으면 다음 턴 드로우 −1 |
| `arrhythmia` | 부정맥 | 8 | 사용 불가. 턴 종료 시 손에 있으면 활력 −4. `purgeable(2)` |
| `bleeding` | 출혈 | 5 | 사용 불가. 턴 종료 시 손에 있으면 활력 −2 |
| `confusion` | 착란 | 4 | 뽑을 때 손패 무작위 1장 버림(`cardEffect` 스트림). 사용 불가 |
| `dysbiosis` | 장내세균 교란 | 4 | 사용 불가. 손에 있는 동안 `abx` 카드 비용 +1 |
| `immunosuppression` | 면역억제 | 4 | 사용 불가. 손에 있는 동안 감염 질환의 공격 +2 |
| `bradycardia` | 서맥 | 4 | 사용 불가. `ethereal`. 턴 종료 시 손에 있으면 활력 −2 |
| `lung_toxicity` | 폐 독성 | 3 | **지속**. 사용 불가. 턴 종료 시 손에 있으면 활력 −1. `purgeable(1)` |

질병이 넣는 카드: 착란(간성뇌증, 섬망), 고칼륨혈증(급성 신손상), 출혈(DIC, 상부위장관 출혈), 오심(췌장염).

### 5.5 질병 27종

#### 구현 기준 수치 (1차 밸런스 조정 후)

아래 표는 `npx tsx scripts/gen-disease-table.ts`로 `src/content`에서 뽑았다. 중증도·진단 문턱·행동 수치는 **이 표가 기준**이고, 그 아래 질병별 설명(단서, 반응표, AI, 의학 메모)은 v1.1 원문이다. 원문의 수치와 다르면 표를 따른다. 조정 근거는 `DECISIONS.md`.

| ID | 질병 | 막 | 등급 | 중증도 | 진단 | 행동 |
|---|---|---|---|---|---|---|
| `appendicitis` | 급성 충수염 | 1 | 일반 | 42–46 | 2/4 | 천공 위험(예고 3 → 천공, 공격 6) · 천공(최대 +15, 자신 악화 3) · 통증(공격 11) · 국소 염증(자신 염증 2, 공격 7) |
| `gastroenteritis` | 급성 위장관염 | 1 | 일반 | 30–34 | 2/4 | 구토(공격 9, 환자 탈수 1) · 설사(공격 5×2) · 탈수 진행(환자 탈수 2, 자신 악화 1, 공격 3) |
| `cap` | 지역사회획득 폐렴 | 1 | 일반 | 44–48 | 2/4 | 기침(공격 12) · 고열(공격 8, 환자 위축 1) · 염증 반응(자신 염증 3, 공격 4) |
| `pyelo` | 급성 신우신염 | 1 | 일반 | 40–44 | 2/4 | 오한(공격 6×2) · 고열(공격 13) · 신장 농양 형성(방어 8, 자신 악화 1, 공격 3) |
| `asthma` | 천식 급성 악화 | 1 | 일반 | 34–38 | 2/4 | 기관지 연축(공격 7×2) · 점액 마개(공격 6, 환자 저산소 1) · 호흡근 피로(자신 악화 2, 공격 4) |
| `anaphylaxis` | 아나필락시스 | 1 | 일반 | 22–26 | 2/4 | 두드러기(공격 4, 예고 2 → 기도 부종) · 기도 부종(공격 22) · 혈관 부종(공격 8) · 기관지 수축(공격 4×2) |
| `stemi` | ST분절 상승 심근경색 | 1 | 정예 | 66–72 | 2/4 | 허혈성 흉통(공격 12) · 허혈 진행(자신 악화 2, 공격 6) · 심근 기절(환자 취약 1, 공격 6) · [심실세동] 심실세동(공격 4×3) · 심정지 임박(예고 2 → 심정지, 공격 4) · 심정지(공격 20) |
| `stroke` | 급성 뇌경색 | 1 | 정예 | 62–68 | 2/4 | 신경학적 결손(공격 12) · 뇌부종(자신 악화 2, 공격 4) · 흡인(공격 6, 환자 저산소 1) · 골든타임 종료(단계 1) |
| `dka` | 당뇨병성 케톤산증 | 1 | 보스 | 100–100 | 3/5 | 케톤 생성(자신 산증 1, 방어 5, 공격 3) · 쿠스마울 호흡(공격 7) · 삼투성 이뇨(공격 4, 환자 탈수 1) · 순환 허탈 예고(예고 3 → 순환 허탈) · 순환 허탈(공격 16 (조건부 배율)) |
| `cellulitis` | 봉와직염 | 2 | 일반 | 48–54 | 2/4 | 발적 확산(공격 12) · 염증(자신 염증 3, 공격 5) · 림프관염(공격 7, 환자 취약 1) |
| `dvt` | 심부정맥 혈전증 | 2 | 일반 | 50–56 | 2/4 | 혈전 이동 위험(예고 3 → 색전) · 색전(공격 24 (조건부 배율)) · 부종(공격 9) · 혈전 성장(방어 8, 자신 악화 1, 공격 4) |
| `chf` | 급성 심부전 악화 | 2 | 일반 | 50–56 | 2/4 | 폐부종(공격 14) · 울혈 악화(자신 악화 2, 공격 6) · 호흡곤란(공격 8, 환자 저산소 1) |
| `he` | 간성뇌증 | 2 | 일반 | 42–48 | 2/4 | 의식 저하(덱 +confusion×1 → draw_random, 공격 5) · 퍼덕떨림(공격 10) · 암모니아 축적(자신 악화 2, 공격 4) |
| `delirium` | 섬망 | 2 | 일반 | 38–42 | 2/4 | 야간 초조(공격 7, 덱 +confusion×1 → discard) · 주의력 저하(환자 위축 1, 공격 4) · 배회(공격 5×2) |
| `cdi` | C. difficile 감염 | 2 | 일반 | 46–52 | 2/4 | 수양성 설사(공격 6×2) · 독소(공격 10, 환자 탈수 1) · 대장염 악화(자신 염증 2, 자신 악화 1, 공격 4) |
| `af` | 심방세동 빠른 심실 반응 | 2 | 일반 | 42–46 | 2/4 | 빠른 심실 반응(공격 4×3) · 심박출 저하(공격 6, 환자 취약 1) · 좌심방 혈전(예고 4 → 색전성 뇌졸중) · 색전성 뇌졸중(공격 20 (조건부 배율)) |
| `pe` | 폐색전증 | 2 | 정예 | 78–84 | 2/4 | 급성 우심부전(공격 15) · 저산소혈증(공격 8, 환자 저산소 1) · 혈전 추가(자신 악화 2, 방어 8, 공격 4) |
| `pancreatitis` | 중증 급성 췌장염 | 2 | 정예 | 80–86 | 2/4 | 상복부 통증(공격 13) · 전신 염증 반응(자신 염증 3, 공격 4) · 장마비(공격 6, 덱 +nausea×2 → discard) · 괴사 진행(예고 4 → 췌장 괴사) · 췌장 괴사(최대 +10, 자신 악화 2) |
| `ugib` | 대량 상부위장관 출혈 | 2 | 관문 | 140–140 | 3/5 | 토혈(공격 13) · 저혈량 쇼크(환자 저혈압 1, 공격 5) · 재출혈 예고(예고 3 → 재출혈) · 재출혈(공격 22, 덱 +bleeding×2 → discard) · 응고 장애(자신 악화 2, 방어 10) |
| `vap` | 인공호흡기 관련 폐렴 | 3 | 일반 | 60–66 | 2/4 | 가래 증가(공격 13) · 저산소(공격 8, 환자 저산소 1) · 염증(자신 염증 3, 공격 5) |
| `aki` | 급성 신손상 | 3 | 일반 | 56–62 | 2/4 | 요독(공격 12) · 칼륨 상승(덱 +hyperkalemia×1 → draw_random, 공격 5) · 체액 과다(공격 6, 환자 위축 1) |
| `ards` | 급성 호흡곤란 증후군 | 3 | 일반 | 64–70 | 2/4 | 폐포 손상(공격 13) · 난치성 저산소혈증(공격 7, 환자 저산소 1) · 섬유화(자신 악화 2, 공격 5) |
| `dic` | 파종성 혈관내 응고 | 3 | 일반 | 58–64 | 2/4 | 점상출혈(공격 7, 덱 +bleeding×1 → discard) · 응고인자 소모(환자 취약 2, 공격 4) · 미세혈전(공격 7×2) |
| `clabsi` | 중심정맥관 관련 혈류감염 | 3 | 일반 | 58–64 | 2/4 | 균혈증(공격 12) · 오한(공격 5×3) · 생물막(방어 12, 공격 4) |
| `tamponade` | 심장 눌림증 | 3 | 정예 | 84–90 | 2/4 | 심박출 감소(공격 13) · 경정맥 팽창(방어 10, 자신 악화 1) · 무맥성 전기활동 예고(예고 3 → 무맥성 전기활동) · 무맥성 전기활동(공격 26) |
| `tension_ptx` | 긴장성 기흉 | 3 | 정예 | 80–86 | 2/4 | 흉강 내압 상승(자신 악화 2, 공격 5) · 종격동 편위(공격 15) · 호흡 부전(공격 9, 환자 저산소 1) |
| `septic_shock` | 패혈성 쇼크 | 3 | 보스 | 210–210 | 3/5 | 고열(공격 13) · 균혈증(공격 6×2) · 염증 반응(자신 염증 2, 방어 8, 공격 4) · [패혈성 쇼크] 조직 저관류(공격 16) · 사이토카인 폭풍(자신 염증 3, 공격 6) · 다장기 부전 예고(예고 4 → 다장기 부전) · 다장기 부전(공격 26) · 균혈증(공격 7×2) |

#### 질병별 설명 (v1.1)

표기
- **행동**: `공격 N`(환자에게 피해), `공격 N×H`(H회), `환자 상태 k`, `자신 상태 k`, `방어 N`(자신 안정화), `예고 T → 행동`(합병증 카운트다운), `덱 +카드 → 위치`, `최대 +N`(최대 중증도와 현재 중증도 +N)
- **AI**: `처음`(opening), `규칙`(조건이 맞으면 우선), `가중`(나머지는 가중 추첨), `반복 금지`(직전과 같은 행동 금지)
- 반응표에 없는 치료 태그는 적응증(분류·특성)에 따라 보통 또는 무효다. 금기·특효 등 예외만 적는다.

#### 1막 응급실

**`appendicitis` 급성 충수염 (Acute appendicitis)** — 일반
- 주호소 **복통** · 단서: 우하복부 압통과 반발통 / 명치 통증이 오른쪽 아래로 이동 / 38.1℃
- 복부 · `source` `us_visible` · 원인균 `intra_abdominal` · 중증도 40–44 · 진단 2/4
- 반응표: `source_control` W
- 행동: 천공 위험(예고 3 → 천공, 공격 5) · 천공(최대 +15, 자신 악화 3) · 통증(공격 7) · 국소 염증(자신 염증 2, 공격 4)
- AI: 처음 [천공 위험] · 가중 통증 60, 국소 염증 40 · 같은 행동 최대 2연속
- medical `accurate`: 천공은 치료 지연의 대표 합병증. 단순 충수염은 항생제 단독 치료도 가능

**`gastroenteritis` 급성 위장관염 (Acute gastroenteritis)** — 일반, 쉬움
- 주호소 **복통** · 단서: 하루 여섯 번 물설사와 구토 / 함께 식사한 가족도 같은 증상 / 국소 압통 없음
- 감염 · `hypovolemia` · 원인균 `virus` · 28–32 · 2/4
- 반응표: `fluid` W
- 행동: 구토(공격 6, 환자 탈수 1) · 설사(공격 3×2) · 탈수 진행(환자 탈수 2, 자신 악화 1)
- AI: 가중 구토 45, 설사 35, 탈수 진행 20 · 반복 금지 [탈수 진행]
- medical `accurate`: 바이러스성은 항생제 무효, 수분 보충이 핵심

**`cap` 지역사회획득 폐렴 (Community-acquired pneumonia)** — 일반
- 주호소 **발열** · 단서: 누런 가래를 동반한 기침 / 오른쪽 아래 폐의 수포음 / 호흡수 24회
- 감염 · `chest` `resp_failure` · 변이: 폐렴알균 70 / 비정형균 30 · 42–46 · 2/4
- 내성: 모든 계열, +1
- 행동: 기침(공격 8) · 고열(공격 5, 환자 위축 1) · 염증 반응(자신 염증 3)
- AI: 가중 기침 45, 고열 30, 염증 반응 25 · 반복 금지 [염증 반응]
- medical `simplified`: 비정형균은 베타락탐 무효. 국내 폐렴알균은 마크롤라이드 내성이 높다

**`pyelo` 급성 신우신염 (Acute pyelonephritis)** — 일반, 쉬움
- 주호소 **발열** · 단서: 오한과 오른쪽 옆구리 통증 / 오른쪽 늑척추각 압통 / 사흘째 배뇨통
- 감염 · `renal` · 변이: 대장균 75 / ESBL 생성 대장균 25 · 38–42 · 2/4
- 내성: 모든 계열, +1
- 행동: 오한(공격 4×2) · 고열(공격 9) · 신장 농양 형성(방어 8, 자신 악화 1)
- AI: 가중 오한 40, 고열 40, 농양 20 · 반복 금지 [농양]
- medical `simplified`: ESBL은 3세대 세팔로스포린 무효, 카바페넴이 1차

**`asthma` 천식 급성 악화 (Acute asthma exacerbation)** — 일반, 쉬움
- 주호소 **호흡곤란** · 단서: 숨을 내쉴 때 쌕쌕거림 / 흡입기를 하루 여섯 번 사용 / SpO₂ 91%
- 호흡 · `chest` `bronchospasm` `resp_failure` · 32–36 · 2/4
- 반응표: `beta2_agonist` W, `corticosteroid` W, `anaphylaxis_tx` R, `beta_blocker` 금기
- 행동: 기관지 연축(공격 5×2) · 점액 마개(공격 3, 환자 저산소 1) · 호흡근 피로(자신 악화 2)
- AI: 가중 45 / 30 / 25 · 반복 금지 [점액 마개, 호흡근 피로]
- medical `accurate`: β차단제는 기관지 연축을 악화시킨다

**`anaphylaxis` 아나필락시스 (Anaphylaxis)** — 일반
- 주호소 **호흡곤란** · 단서: 조영제 주사 직후 전신 두드러기 / 입술과 혀의 부종 / 혈압 82/50
- 알레르기 · `allergic` `bronchospasm` `shock` `hypovolemia` · 22–26 · 2/4
- 반응표: `anaphylaxis_tx` K, `corticosteroid` R, `beta_blocker` 금기
- 행동: 두드러기(공격 3, 예고 2 → 기도 부종) · 기도 부종(공격 20) · 혈관 부종(공격 5) · 기관지 수축(공격 3×2)
- AI: 처음 [두드러기] · 가중 혈관 부종 50, 기관지 수축 50
- medical `accurate`: 1차 치료는 에피네프린 근육주사. 스테로이드는 보조

**`stemi` ST분절 상승 심근경색 (STEMI)** — 정예
- 주호소 **흉통** · 단서: 30분 넘게 쥐어짜는 가슴 통증과 식은땀 / 심전도 II·III·aVF ST 분절 상승 / 당뇨 20년
- 심혈관 · `chest` `cardiac` `acs` `arterial_thrombus` `thrombolysable` · 74–80 · 2/4
- 반응표: `revascularization` K, `antiplatelet` W, `anticoagulant` W, `thrombolytic` W, `defib` 금기
- 행동: 허혈성 흉통(공격 11) · 허혈 진행(자신 악화 2, 공격 5) · 심근 기절(환자 취약 2)
- AI: 가중 45 / 30 / 25 · 반복 금지 [심근 기절]
- **2단계 심실세동** (중증도 50% 이하): 특성 +`arrhythmia` `shockable`, −`acs` `arterial_thrombus` `thrombolysable`. 반응표: `defib` K, `antiarrhythmic` W, `vasopressor` N, `antiplatelet`·`anticoagulant`·`thrombolytic`·`revascularization` R, `beta_blocker` I
  - 행동: 심실세동(공격 6×3) · 심정지 임박(예고 2 → 심정지) · 심정지(공격 26)
  - AI: 규칙 [카운트다운 없음 → 심정지 임박] · 가중 심실세동
- medical `accurate`: 1차 PCI가 재관류 표준. 맥박이 있는 리듬에 비동기 충격은 심실세동을 유발할 수 있다

**`stroke` 급성 뇌경색 (Acute ischemic stroke)** — 정예
- 주호소 **편측 마비** · 단서: 1시간 전 시작된 왼쪽 팔다리 마비 / 말이 어눌하고 시선이 오른쪽으로 쏠림 / 혈당 132
- 신경 · `arterial_thrombus` `thrombolysable` · 70–76 · 2/4
- 반응표: `thrombolytic` K, `revascularization` K, `antiplatelet` N, `anticoagulant` I
- 패시브: 전투 시작 시 예고 3 → 골든타임 종료
- 행동: 신경학적 결손(공격 10) · 뇌부종(자신 악화 2) · 흡인(공격 4, 환자 저산소 1) · 골든타임 종료(2단계로)
- AI: 가중 45 / 30 / 25 · 반복 금지 [뇌부종]
- **2단계 골든타임 경과**: 특성 −`thrombolysable`. 반응표: `thrombolytic` 금기, `revascularization` W
- medical `accurate`: 정맥 혈전용해는 발병 4.5시간 이내. 이후에는 출혈 위험이 크다. 혈전 제거술은 선택된 환자에서 24시간까지

**`dka` 당뇨병성 케톤산증 (Diabetic ketoacidosis)** — 보스
- 주호소 **복통** · 단서: 구토와 깊고 빠른 호흡 / 과일 냄새 나는 날숨 / 혈당 486, 소변 케톤 3+
- 대사 · `hyperglycemia` `hypovolemia` · 150 · 3/5
- 반응표: `insulin` K, `fluid` W, `corticosteroid` 금기
- 패시브: 전투 시작 시 자신 산증 5 · `fluid` 약물이 투여될 때마다 자신 산증 −2
- 변이: 유발 요인 불명 50 / **유발 요인: 감염** 50 (원인균 `mixed_community`, 패시브: 적 턴 종료 시 항생제가 투여 중이 아니면 중증도 5 회복)
- 행동: 케톤 생성(자신 산증 2, 방어 6) · 쿠스마울 호흡(공격 8) · 삼투성 이뇨(공격 5, 환자 탈수 2) · 순환 허탈 예고(예고 3 → 순환 허탈) · 순환 허탈(공격 25, 수액 투여 중이면 ×50%)
- AI: 처음 [케톤 생성] · 규칙 [카운트다운 없음 & 3턴 이상 → 순환 허탈 예고] · 가중 쿠스마울 45, 이뇨 25, 케톤 30 · 반복 금지 [케톤, 이뇨]
- medical `accurate`: 수액 → 칼륨 확인 후 인슐린 → 혈당이 떨어지면 포도당 추가. 스테로이드는 고혈당을 악화

#### 2막 병동

**`cellulitis` 봉와직염 (Cellulitis)** — 일반
- 주호소 **다리 부종** · 단서: 정맥주사 자리 주변으로 번지는 붉은 부기 / 경계가 불분명한 발적과 열감 / 38.4℃
- 감염 · `source` · 변이: 연쇄알균·MSSA 60 / MRSA 40 · 48–54 · 2/4
- 내성: 모든 계열, +1
- 행동: 발적 확산(공격 9) · 염증(자신 염증 3) · 림프관염(공격 5, 환자 취약 1)
- AI: 가중 45 / 30 / 25 · 반복 금지 [염증]
- medical `simplified`: MRSA에는 베타락탐 무효(세프타롤린 예외 생략)

**`dvt` 심부정맥 혈전증 (Deep vein thrombosis)** — 일반, 쉬움
- 주호소 **다리 부종** · 단서: 왼쪽 종아리만 붓고 당김 / 종아리 둘레 3cm 차이, 발열 없음 / 닷새째 침상 안정
- 혈전 · `venous_thrombus` `us_visible` · 44–50 · 2/4
- 반응표: `anticoagulant` W, `thrombolytic` R, `antiplatelet` I
- 행동: 혈전 이동 위험(예고 4 → 색전) · 색전(공격 22, 항응고제 투여 중이면 ×50%) · 부종(공격 6) · 혈전 성장(방어 8, 자신 악화 1)
- AI: 처음 [혈전 이동 위험] · 가중 부종 60, 혈전 성장 40 · 반복 금지 [혈전 성장]
- medical `accurate`: 항응고가 1차. 단순 DVT에 혈전용해는 권고되지 않는다

**`chf` 급성 심부전 악화 (Acute decompensated heart failure)** — 일반
- 주호소 **호흡곤란** · 단서: 누우면 숨이 차 앉아서 잠 / 양쪽 다리 함요부종과 경정맥 팽창 / 어제 수액 2L 투여
- 심혈관 · `chest` `cardiac` `volume_overload` `resp_failure` `us_visible` · 50–56 · 2/4
- 반응표: `loop_diuretic` W, `fluid` 금기, `beta_blocker` 금기, `vasopressor` R
- 행동: 폐부종(공격 11) · 울혈 악화(자신 악화 2, 공격 4) · 호흡곤란(공격 6, 환자 저산소 1)
- AI: 가중 40 / 30 / 30 · 반복 금지 [울혈 악화]
- medical `accurate`: 급성 악화기의 수액과 β차단제 신규 시작은 해롭다

**`he` 간성뇌증 (Hepatic encephalopathy)** — 일반
- 주호소 **의식 변화** · 단서: 낮에도 졸고 엉뚱한 대답을 함 / 간경변 병력, 손의 퍼덕떨림 / 사흘째 변을 보지 못함
- 신경 · `hyperammonemia` · 42–48 · 2/4
- 반응표: `ammonia_lowering` W, `cns_depressant` 금기
- 행동: 의식 저하(덱 +착란 → draw_random) · 퍼덕떨림(공격 7) · 암모니아 축적(자신 악화 2)
- AI: 가중 35 / 45 / 20 · 반복 금지 [의식 저하, 암모니아 축적]
- medical `accurate`: 벤조디아제핀·오피오이드는 간성뇌증을 유발·악화

**`delirium` 섬망 (Delirium)** — 일반, 쉬움
- 주호소 **의식 변화** · 단서: 밤이 되면 수액줄을 뽑으려 함 / 주의력 저하, 낮에는 비교적 명료 / 82세, 입원 사흘째
- 신경 · `agitation` · 38–42 · 2/4
- 반응표: `antipsychotic` W, `benzodiazepine` 금기
- 행동: 야간 초조(공격 5, 덱 +착란 → discard) · 주의력 저하(환자 위축 1) · 배회(공격 4×2)
- AI: 가중 40 / 25 / 35 · 반복 금지 [주의력 저하]
- medical `simplified`: 항정신병제는 초조 조절용이며 섬망 기간 단축 근거는 약하다. 벤조디아제핀은 알코올 금단 외에는 악화 요인

**`cdi` C. difficile 감염 (Clostridioides difficile infection)** — 일반
- 주호소 **설사** · 단서: 항생제 7일째, 하루 여덟 번 물설사 / 백혈구 18,000 / 아랫배를 쥐어짜는 통증
- 감염 · `hypovolemia` · 원인균 `cdiff` · 46–52 · 2/4
- 반응표: `cdi_risk` 금기
- 패시브: `cdi_risk` 약물이 투여될 때마다(대상 무관) 자신 악화 2
- 행동: 수양성 설사(공격 5×2) · 독소(공격 8, 환자 탈수 1) · 대장염 악화(자신 염증 2, 자신 악화 1)
- AI: 가중 40 / 35 / 25 · 반복 금지 [대장염 악화]
- medical `simplified`: 현재 1차는 피닥소마이신 또는 **경구** 반코마이신(정맥 투여는 대장에 도달하지 않음, 카드는 경로 구분 생략). 원인 항생제·PPI 지속은 악화 요인

**`af` 심방세동 빠른 심실 반응 (Atrial fibrillation with RVR)** — 일반
- 주호소 **두근거림** · 단서: 불규칙하게 불규칙한 맥박 140회 / 수술 후 이틀째 / 혈압 108/70
- 심혈관 · `cardiac` `arrhythmia` `shockable` · 42–46 · 2/4
- 반응표: `antiarrhythmic` W, `beta_blocker` W, `defib` N, `anticoagulant` R
- 행동: 빠른 심실 반응(공격 3 × 2–4회, 계획할 때 횟수 결정) · 심박출 저하(공격 4, 환자 취약 1) · 좌심방 혈전(예고 4 → 색전성 뇌졸중) · 색전성 뇌졸중(공격 18, 항응고제 투여 중이면 ×50%)
- AI: 처음 [빠른 심실 반응] · 규칙 [카운트다운 없음 & 2턴 이상 → 좌심방 혈전, 1회] · 가중 60 / 40 · 반복 금지 [심박출 저하]
- medical `simplified`: 박동수 조절이 1차, 불안정하면 전기적 심율동 전환(카드는 제세동으로 통합). 항응고는 뇌졸중 예방

**`pe` 폐색전증 (Pulmonary embolism)** — 정예
- 주호소 **호흡곤란** · 단서: 갑자기 시작된 숨참과 숨 쉴 때 찌르는 가슴 통증 / 맥박 118, SpO₂ 88% / 수술 후 닷새째
- 혈전 · `chest` `venous_thrombus` `thrombolysable` `shock` · 86–92 · 2/4
- 반응표: `anticoagulant` W, `thrombolytic` W, `fluid` R, `antiplatelet` I
- 행동: 급성 우심부전(공격 14) · 저산소혈증(공격 6, 환자 저산소 1) · 혈전 추가(자신 악화 2, 방어 8)
- AI: 가중 40 / 35 / 25 · 반복 금지 [혈전 추가]
- medical `accurate`: 고위험 폐색전증은 혈전용해. 우심실 과부하에서 대량 수액은 해롭다

**`pancreatitis` 중증 급성 췌장염 (Severe acute pancreatitis)** — 정예
- 주호소 **복통** · 단서: 등으로 뻗치는 명치 통증과 구토 / 리파아제가 정상 상한의 6배 / 과음 다음 날 발생
- 복부 · `hypovolemia` · 92–98 · 2/4
- 반응표: `fluid` W (원인균이 없으므로 항생제 무효)
- 행동: 상복부 통증(공격 10) · 전신 염증 반응(자신 염증 4) · 장마비(공격 4, 덱 +오심 ×2 → discard) · 괴사 진행(예고 4 → 췌장 괴사) · 췌장 괴사(최대 +15, 자신 악화 2)
- AI: 처음 [상복부 통증] · 규칙 [카운트다운 없음 & 2턴 이상 → 괴사 진행, 1회] · 가중 40 / 30 / 30 · 반복 금지 [전신 염증 반응, 장마비]
- medical `simplified`: 초기 수액이 핵심이나 과도한 수액은 해롭다. 예방적 항생제는 권고되지 않는다

**`ugib` 대량 상부위장관 출혈 (Massive upper GI bleeding)** — 관문 정예
- 주호소 **토혈** · 단서: 선홍색 피를 한 사발 토함 / 흑색변, 맥박 124, 혈압 86/54 / 한 달째 진통제(NSAID) 복용
- 출혈 · `gi_bleed` `hemorrhage` `hypovolemia` · 170 · 3/5
- 반응표: `endoscopy` K, `transfusion` W, `ppi` W, `vasopressor` R, `anticoagulant`·`antiplatelet`·`thrombolytic`·`beta_blocker` 금기
- 패시브: 플레이어 턴 시작 시 환자 활력 −2 (지속 출혈)
- 행동: 토혈(공격 12) · 저혈량 쇼크(환자 저혈압 1) · 재출혈 예고(예고 3 → 재출혈) · 재출혈(공격 24, 덱 +출혈 ×2 → discard) · 응고 장애(자신 악화 2, 방어 10)
- AI: 처음 [토혈] · 규칙 [카운트다운 없음 & 2턴 이상 → 재출혈 예고] · 가중 40 / 30 / 30 · 반복 금지 [저혈량 쇼크, 응고 장애]
- medical `accurate`: 소화성 궤양 출혈은 내시경 지혈 + PPI, 제한적 수혈. 항혈전제는 금기

#### 3막 중환자실

**`vap` 인공호흡기 관련 폐렴 (Ventilator-associated pneumonia)** — 일반
- 주호소 **발열** · 단서: 기관 내 튜브로 누런 가래가 늘어남 / 인공호흡기 엿새째, 새 폐 침윤 / 산소 요구량 증가
- 감염 · `chest` `resp_failure` · 변이: 녹농균 60 / MRSA 40 · 60–66 · 2/4
- 내성: 모든 계열, +2, 시작 스택 `beta_lactam` 1·`fluoroquinolone` 1
- 행동: 가래 증가(공격 10) · 저산소(공격 6, 환자 저산소 1) · 염증(자신 염증 3)
- AI: 가중 45 / 30 / 25 · 반복 금지 [염증]
- medical `simplified`: 병원 획득 균의 다제내성

**`aki` 급성 신손상 (Acute kidney injury)** — 일반, 쉬움
- 주호소 **소변 감소** · 단서: 여섯 시간 동안 소변 40mL / 크레아티닌 0.9 → 2.8 / 반코마이신과 조영제 노출
- 신장 · `renal` `renal_failure` `us_visible` · 56–62 · 2/4
- 반응표: `dialysis` K, `fluid` N, `nephrotoxic` 금기, `k_raising` 금기, `loop_diuretic` I
- 행동: 요독(공격 9) · 칼륨 상승(덱 +고칼륨혈증 → draw_random) · 체액 과다(공격 4, 환자 위축 1)
- AI: 가중 45 / 30 / 25 · 반복 금지 [칼륨 상승]
- medical `simplified`: 투석은 고칼륨혈증·산증·체액 과다·요독에 시행. 이뇨제는 신기능 회복을 돕지 않는다

**`ards` 급성 호흡곤란 증후군 (ARDS)** — 일반
- 주호소 **호흡곤란** · 단서: 산소를 올려도 SpO₂ 85% / 양쪽 폐 침윤, 심부전 소견 없음 / P/F 비 110
- 호흡 · `chest` `resp_failure` `volume_overload` · 64–70 · 2/4
- 반응표: `airway` W, `fluid` 금기, `loop_diuretic` N, `corticosteroid` N
- 행동: 폐포 손상(공격 11) · 난치성 저산소혈증(공격 5, 환자 저산소 1) · 섬유화(자신 악화 2)
- AI: 가중 45 / 35 / 20 · 반복 금지 [섬유화]
- medical `simplified`: 폐 보호 환기와 보수적 수액 전략. 수액 "금기"는 과장이나 방향은 맞다

**`dic` 파종성 혈관내 응고 (DIC)** — 일반
- 주호소 **출혈** · 단서: 주사 자리마다 멎지 않는 출혈과 점상출혈 / 혈소판 32,000, PT 연장 / D-dimer 상승, 피브리노겐 저하
- 출혈 · `hemorrhage` · 58–64 · 2/4
- 반응표: `transfusion` W, `anticoagulant` R, `thrombolytic` 금기, `antiplatelet` 금기
- 행동: 점상출혈(공격 5, 덱 +출혈 → discard) · 응고인자 소모(환자 취약 2) · 미세혈전(공격 7×2)
- AI: 가중 35 / 25 / 40 · 반복 금지 [응고인자 소모]
- medical `simplified`: 원인 치료와 혈액제제 보충. 헤파린은 혈전 우세형에서 제한적으로 쓴다

**`clabsi` 중심정맥관 관련 혈류감염 (CLABSI)** — 일반, 쉬움
- 주호소 **발열** · 단서: 중심정맥관 여드레째, 삽입부 발적 / 혈액배양 2세트에서 그람 양성 알균 / 다른 감염원 없음
- 감염 · `source` · 변이: MSSA 50 / MRSA 50 · 58–64 · 2/4
- 반응표: `source_control` K
- 내성: 모든 계열, +1
- 행동: 균혈증(공격 9) · 오한(공격 4×3) · 생물막(방어 12)
- AI: 가중 40 / 35 / 25 · 반복 금지 [생물막]
- medical `accurate`: 황색포도알균 균혈증은 카테터 제거가 필수. MSSA는 베타락탐이 반코마이신보다 낫다

**`tamponade` 심장 눌림증 (Cardiac tamponade)** — 정예
- 주호소 **저혈압** · 단서: 혈압 78/60, 경정맥 팽창 / 심음이 작고 들숨 때 수축기압이 15 떨어짐 / 심장 수술 후 사흘째
- 심혈관 · `chest` `cardiac` `pericardial` `shock` `hypovolemia` `us_visible` · 94–100 · 2/4
- 반응표: `pericardiocentesis` K, `vasopressor` R, `beta_blocker` 금기, `airway` 금기, `defib` I
- 행동: 심박출 감소(공격 12) · 경정맥 팽창(방어 12, 자신 악화 1) · 무맥성 전기활동 예고(예고 3 → 무맥성 전기활동) · 무맥성 전기활동(공격 30)
- AI: 처음 [심박출 감소] · 규칙 [카운트다운 없음 & 2턴 이상 → 예고] · 가중 55 / 45 · 반복 금지 [경정맥 팽창]
- medical `accurate`: Beck 삼징. 양압 환기는 정맥 환류를 줄여 허탈을 부른다. 수액은 일시적으로 돕는다

**`tension_ptx` 긴장성 기흉 (Tension pneumothorax)** — 정예
- 주호소 **호흡곤란** · 단서: 인공호흡기 기도압이 갑자기 치솟음 / 왼쪽 호흡음 소실, 기관이 오른쪽으로 밀림 / 혈압 80/50
- 호흡 · `chest` `pleural` `shock` `us_visible` · 88–94 · 2/4
- 반응표: `chest_tube` K, `airway` 금기, `fluid` R, `vasopressor` R
- 행동: 흉강 내압 상승(자신 악화 3) · 종격동 편위(공격 14) · 호흡 부전(공격 7, 환자 저산소 1)
- AI: 가중 30 / 40 / 30 · 반복 금지 [흉강 내압 상승]
- medical `accurate`: 임상 진단 후 즉시 감압한다. 영상을 기다리지 않는다

**`septic_shock` 패혈성 쇼크 (Septic shock)** — 최종 보스
- 주호소 **발열** · 단서: 39.6℃, 맥박 128, 혈압 88/52 / 젖산 4.1 / 소변량 감소와 의식 혼미
- 감염 · `source` `hypovolemia` · 변이: 그람 음성 막대균 60 / MRSA 균혈증 40 · 240 · 3/5
- 내성: 모든 계열, +1
- **1단계 패혈증**: 고열(공격 10) · 균혈증(공격 5×2) · 염증 반응(자신 염증 2, 방어 8). 가중 40 / 35 / 25 · 반복 금지 [염증 반응]
- **2단계 패혈성 쇼크** (중증도 50% 이하): 특성 +`shock`. 반응표: `fluid` W, `vasopressor` W, `corticosteroid` N, `beta_blocker` 금기. 진입 시 환자 저혈압 3
  - 행동: 조직 저관류(공격 14) · 사이토카인 폭풍(자신 염증 3) · 다장기 부전 예고(예고 4 → 다장기 부전) · 다장기 부전(공격 30) · 균혈증(공격 6×2)
  - AI: 처음 [다장기 부전 예고] · 규칙 [카운트다운 없음 → 예고] · 가중 40 / 25 / 35 · 반복 금지 [사이토카인 폭풍]
- medical `accurate`: 배양 후 경험적 광범위 항생제, 원인균 확인 후 범위 축소. 노르에피네프린이 1차 승압제. 불응성 쇼크에 스테로이드

### 5.6 인카운터

두 질병이 함께 나오는 인카운터는 각 질병의 중증도와 공격 피해를 60%로 한다(`hpPct`, `atkPct`. 합병증 서사: "폐렴에 천식이 겹쳤다"). v1.1의 "중증도 65%"만으로는 두 질병이 한 턴에 함께 때려 단일 인카운터보다 훨씬 어려웠다.

| 막 | 쉬움 | 보통 | 정예 | 끝 |
|---|---|---|---|---|
| 1 | 위장관염 / 천식 / 신우신염 | 충수염 / 폐렴 / 신우신염 / 아나필락시스 / 폐렴+천식 / 충수염+위장관염 | STEMI / 급성 뇌경색 | DKA |
| 2 | 섬망 / DVT | 봉와직염 / DVT / 심부전 / 간성뇌증 / C. diff / 심방세동 / 봉와직염+DVT / 간성뇌증+섬망 | 폐색전증 / 급성 췌장염 | 상부위장관 출혈 |
| 3 | 급성 신손상 / 중심정맥관 감염 | 인공호흡기 폐렴 / 급성 신손상 / ARDS / DIC / 중심정맥관 감염 / 인공호흡기 폐렴+급성 신손상 / ARDS+DIC | 심장 눌림증 / 긴장성 기흉 | 패혈성 쇼크 |

### 5.7 상태 효과
| ID | 상태 | 대상 | 누적 | 효과 |
|---|---|---|---|---|
| `vulnerable` | 취약 | 양쪽 | 지속형 | 받는 피해 ×1.5 |
| `weak` | 위축 | 양쪽 | 지속형 | 주는 피해 ×0.75 |
| `aggravation` | 악화 | 적 | 강도형 | 공격 피해 +스택 |
| `inflammation` | 염증 | 적 | 강도형 | 적 턴 종료 시 스택만큼 중증도 회복, 그 후 −1 |
| `acidosis` | 산증 | 적 | 강도형 | 공격 피해 +스택. 수액 투여 시 −2 |
| `dehydration` | 탈수 | 환자 | 지속형 | 안정화 획득 ×0.75 |
| `hypoxia` | 저산소 | 환자 | 강도형 | 턴 시작 시 오더 −1, 그 후 −1 |
| `hypotension` | 저혈압 | 환자 | 강도형 | 턴 시작 시 승압제가 투여 중이 아니면 활력 −스택. 수액 투여 시 −1 |
| `bleeding_tendency` | 출혈 경향 | 환자 | — | 턴 시작 시 항응고제와 항혈소판제가 모두 투여 중이면 활력 −2, 아니면 사라진다 |
| `fatigue` | 피로 | 환자 | — | 전투 첫 턴 오더 −1, 그 후 사라진다 |

지속형 상태는 라운드 종료에 1씩 줄어든다. 보존은 카드 키워드(`retain`)다.

### 5.8 유물(가이드라인) 17개
| ID | 유물 | 배지 | 등급 | 효과 |
|---|---|---|---|---|
| `intern_notebook` | 인턴 수첩 | 수첩 | 시작 | 전투 시작 시 첫 번째 적 진단 +1 |
| `hand_hygiene` | 손 위생 지침 | HH | 일반 | 전투 시작 시 안정화 6 |
| `news` | 조기 경보 점수 (NEWS) | NEWS | 일반 | 적이 합병증 카운트다운을 시작하면 안정화 5 |
| `five_rights` | 투약 5R 원칙 | 5R | 일반 | 전투마다 첫 약물의 부작용 생성 무효 |
| `sbar` | SBAR 인계 | SBAR | 일반 | 턴 종료 시 손패 1장 보존(선택) |
| `guideline_summary` | 진료 지침 요약본 | GL | 일반 | 적을 확진하면 드로우 1 |
| `fluid_protocol` | 수액 프로토콜 | IVF | 일반 | 전투 종료 시, 이번 전투에서 수액을 투여했다면 활력 3 회복 |
| `dur_system` | DUR 시스템 | DUR | 고급 | 전투마다 첫 위험 상호작용 무효 |
| `asp` | 항생제 관리 프로그램 (ASP) | ASP | 고급 | 획득 내성 증가량 절반(2회마다 1). 확진된 대상에게 항생제 피해 +2 |
| `sepsis_bundle` | 패혈증 1시간 번들 | SEP-1 | 고급 | 전투 첫 턴의 첫 항생제 비용 0 |
| `acls` | ACLS 알고리즘 | ACLS | 고급 | 전투 중 활력이 처음 25% 이하가 되면 안정화 15, 오더 +1 (전투당 1회) |
| `ddx_checklist` | 감별진단 체크리스트 | DDx | 고급 | 진단 포인트를 얻을 때마다 +1 |
| `icu_admission` | 중환자실 입실 | ICU | 보스 | 턴당 오더 +1. 당직실에서 휴식할 수 없다 |
| `mdt` | 다학제 협진 | MDT | 보스 | 턴당 오더 +1. 카드 보상 선택지 2장 |
| `broad_protocol` | 광범위 항생제 프로토콜 | BSA | 보스 | 항생제 피해 ×1.3. 전투 시작 시 뽑을 더미에 장내세균 교란 1장 |
| `thirty_six` | 36시간 연속 당직 | 36H | 보스 | 턴당 오더 +1. 한 턴에 카드를 6장까지만 쓸 수 있다 |
| `cpoe` | 처방 전산화 (CPOE) | CPOE | 보스 | 턴당 오더 +1. 전투 시작 시 뽑을 더미에 오심 2장 |

### 5.9 이벤트 5종
1. **제약회사 샘플** — A. 샘플을 받는다: 무작위 고급 약물 1장 획득 / B. 최신 문헌만 받는다: 덱의 무작위 약물 1장 업그레이드
2. **야간 당직** (R34) — A. 밤새 처방을 다듬는다: 카드 최대 2장 업그레이드(선택), 다음 전투 피로 / B. 잠깐 눈을 붙인다: 활력 8 회복
3. **학회 발표** — A. 발표를 준비한다: 예산 −60, 무작위 일반 유물(예산 60 이상일 때만) / B. 불참한다
4. **보호자 면담** — A. 치료 계획을 설명한다: 활력 10 회복 / B. 불필요한 처방을 정리한다: 카드 1장 제거(선택)
5. **교수님 질문** — 문제 은행(§5.10)에서 1문제(`event` 스트림). 정답: 예산 +40, 무작위 카드 1장 업그레이드 / 오답: 해설만. 어느 쪽이든 해설을 보여 준다

### 5.10 교수님 질문 문제 은행 (10문항)
| # | 질문 | 선택지 | 정답 | 해설 |
|---|---|---|---|---|
| 1 | DKA 환자의 칼륨이 낮다(3.0). 인슐린보다 먼저 할 일은? | 인슐린 즉시 투여 / 칼륨 보충 / 중탄산염 투여 | 칼륨 보충 | 인슐린은 칼륨을 세포 안으로 옮긴다. 칼륨이 3.3 미만이면 먼저 보충한다 |
| 2 | 봉와직염 배양에서 MRSA가 나왔다. 가장 알맞은 항생제는? | 세프트리악손 / 반코마이신 / 메트로니다졸 | 반코마이신 | MRSA에는 일반적인 베타락탐이 듣지 않는다 |
| 3 | 급성 심부전 악화 환자에게 피해야 할 처치는? | 푸로세미드 / 대량 수액 / 산소 | 대량 수액 | 체액 과다가 문제의 중심이다 |
| 4 | 아나필락시스의 1차 약물은? | 항히스타민 / 스테로이드 / 에피네프린 근육주사 | 에피네프린 근육주사 | 항히스타민과 스테로이드는 보조 치료다 |
| 5 | 간성뇌증 환자의 불면에 피해야 할 약은? | 락툴로오스 / 벤조디아제핀 / 리팍시민 | 벤조디아제핀 | 진정제는 간성뇌증을 유발하거나 악화시킨다 |
| 6 | 레보플록사신과 함께 쓸 때 QT 연장 위험이 커지는 약은? | 온단세트론 / 아세트아미노펜 / 판토프라졸 | 온단세트론 | 두 약 모두 QT 간격을 늘린다 |
| 7 | 패혈성 쇼크의 1차 승압제는? | 도파민 / 노르에피네프린 / 페닐에프린 | 노르에피네프린 | 국제 지침은 노르에피네프린을 1차로 권고한다 |
| 8 | 긴장성 기흉이 의심된다. 즉시 할 일은? | 흉부 CT / 바늘 감압 / 기관 삽관 | 바늘 감압 | 임상 진단 후 즉시 감압한다. 양압 환기는 악화시킬 수 있다 |
| 9 | C. difficile 감염의 1차 치료는? | 경구 반코마이신 또는 피닥소마이신 / 정맥 반코마이신 / 세프트리악손 | 경구 반코마이신 또는 피닥소마이신 | 정맥 반코마이신은 대장 안에 충분히 도달하지 않는다 |
| 10 | 급성 뇌경색의 정맥 혈전용해는 발병 후 언제까지? | 4.5시간 / 12시간 / 24시간 | 4.5시간 | 혈전 제거술은 선택된 환자에서 24시간까지 가능하다 |

선택지 순서는 `event` 스트림으로 섞는다.

---

## 6. 테스트 전략

| 종류 | 위치 | 내용 |
|---|---|---|
| 단위 | `tests/unit` | 난수 기준값, 스트림 독립성, 피해 파이프라인 단계별, 값·조건 평가, 명령 실행기, 지도 제약 |
| 시나리오 | `tests/scenario` | "이 상태에서 이 행동들 → 이 결과". 상태 빌더(`makeCombat({ hand, enemies, drugs })`) |
| 결정론 | `tests/determinism` | 고정 시드 + 고정 행동 로그 → 같은 `stateHash`. 저장·복원 왕복 후 동일 |
| 퍼즈 | `tests/fuzz` | 무작위 봇 전투·런. 매 step 불변식 검사 |
| 콘텐츠 | `tests/content` | `validateContent()` 오류 0 |
| 구조 | `tests/arch.test.ts` | 계층 경계 import 규칙 |

**반드시 있어야 할 회귀 테스트** (v1.0의 결함이 다시 생기지 않도록)
- R1: 푸로세미드로 폐렴을 공격하면 피해 0("적응증 아님"), 겐타마이신으로 폐렴알균 폐렴을 공격하면 0
- R2: 노르에피네프린을 쓴 다음 턴 시작에 안정화 3을 얻는다. 패혈성 쇼크 2단계에서 승압제가 투여 중이면 저혈압 피해가 없다
- R3: 포도당 투여 중 인슐린을 쓰면 저혈당 카드가 생기지 않는다. 투약 5R 원칙이 첫 약물의 부작용을 막는다
- R4: `card_played` 반응이 카드 효과 뒤에 기록된다
- R6: 1단계 `EnemyView`에 변이·원인균이 없다
- R20: 확진된 대상에게 세프트리악손을 쓰면 내성이 쌓이지 않고, 확진 전이면 쌓인다

**불변식** (`core/invariants.ts`)
- 0 ≤ 중증도 ≤ 최대 중증도, 0 ≤ 활력 ≤ 최대 활력, 손패 ≤ 10, 오더 ≥ 0
- 모든 수치가 정수(NaN 없음)
- 카드 인스턴스 UID 중복 없음
- 전투 중인데 step 종료 시 모든 적의 중증도가 0인 상태가 없음
- 대기 선택이 없으면 step 종료 시 큐가 비어 있음

기준 해시는 규칙 변경으로 바뀔 수 있다. 그때는 갱신하고 `DECISIONS.md`에 기록한다.

---

## 7. 명령어 (package.json 스크립트)
```
npm run dev              # 브라우저 실행
npm test                 # 전체 테스트
npm run test:fuzz        # 퍼즈 (긴 실행)
npm run content:report   # 콘텐츠 현황, unverified 목록
npm run sim -- combat --deck act1 --encounter n1_cap --n 300 --bot greedy
npm run sim -- run --bot greedy --n 200
npm run build            # 일반 빌드
npm run build:artifact   # 배포용 단일 HTML
npm run replay <file>    # 내보낸 런 재생 검증
npm run shots            # 화면별 스크린숏 (개발 서버 필요, shots/)
npx tsx scripts/ui-smoke.ts             # 실제 클릭으로 한 판 진행하는 연기 검사
npx tsx scripts/gen-disease-table.ts    # §5.5 구현 기준 수치 표
```

**GitHub Actions** (`.github/workflows/ci.yml`): 푸시·PR마다 타입 검사, 테스트, 긴 퍼즈, 두 가지 빌드, 브라우저 클릭 검사, 화면 스크린숏을 돌린다. 기본 브랜치에서 모두 통과하고 Pages 소스가 "GitHub Actions"로 켜져 있으면 웹 빌드를 GitHub Pages에 배포한다. 웹 빌드는 `base: "./"`라 저장소 하위 경로에서도 자원을 찾는다.

---

## 8. 마일스톤

각 마일스톤은 실행해서 눈으로 확인할 수 있는 상태로 끝난다.

| 단계 | 범위 | 확인 |
|---|---|---|
| M0 골격 | Vite + TS + React + Vitest, `rng`, 구조 테스트, `docs/` | 테스트 통과, 빈 화면 |
| M1 전투 코어 | 상태·`step`·턴 흐름·드로우·셔플·피해 파이프라인·불변식·해시 | 무작위 봇 200전투 불변식 위반 0 |
| M2 명령·트리거·상태 | D6 명령 전부, 값·조건, 트리거 순서, 대기 선택, 상태 효과, `describe` | 명령별 단위 테스트, `content:report` |
| M3 약물 | 투여 중 약물, 반감기, 부작용 삽입, 상호작용 17규칙, 미리보기 | 규칙별 발동·비발동 시나리오, R2·R3 회귀 |
| M4 진단·질병 AI | 지식 단계, EnemyView, 반응표·스펙트럼, 금기, 내성, 표적, 변이, 단계, 카운트다운, 질병 27종 | R1·R6·R20 회귀, 파이프라인 수치 테스트 |
| M5 런 구조 | 지도, 보상, 상점, 당직실, 보물, 이벤트, 유물 17개, 막 전환, 저장·리플레이 | 지도 제약(시드 500), 리플레이 결정론 |
| M6 UI | 모든 화면, 비주얼 방향(§3.8), 연출, 툴팁, 덱·더미 보기, 증례집 | 브라우저에서 3막 끝까지 플레이 |
| M7 시뮬레이터·밸런스 | 무작위·탐욕 봇, 실험, 1차 밸런스 | D8 목표 범위 또는 이탈 사유를 `PROGRESS.md`에 |
| M8 배포 | 단일 HTML 빌드, 문서 동기화 | 아티팩트에서 실행 |

---

## 9. 범위 밖 (v1에서 하지 않음)
- 런을 넘는 메타 진행, 해금, 난이도 단계
- 포션류 소모품
- 적 소환
- 다국어
- 모바일 전용 레이아웃(고정 무대 축소로 대응)
- 사운드

---

## 부록 A. 화면 용어집

| 코드 | 화면 | 비고 |
|---|---|---|
| damage | 중증도 감소 | |
| block | 안정화 | |
| energy | 오더 | 도장 모양 표시 |
| HP (player) | 활력 | |
| HP (enemy) | 중증도 | |
| diagnosis | 진단 | 0 미진단 / 1 감별 / 2 확진 |
| effectiveness | 반응표 | 특효 / 우수 / 보통 / 저하 / 무효 / 금기 |
| exhaust | 소진 | |
| retain | 보존 | |
| ethereal | 휘발 | 턴 종료 시 손에 있으면 소진 |
| targeted | 표적 | 확진 대상에게 ×1.5 |
| weak (status) | 위축 | v1.0의 "약화" |
| strength (enemy) | 악화 | |
| draw pile | 대기 처방 | 뽑을 더미 |
| discard pile | 완료 처방 | 버린 더미 |
| exhaust pile | 폐기 | 소진 더미 |
| gold | 예산 | |
| relic | 가이드라인 | |
| battle node | 호출 | |
| elite node | 급변 | |
| event node | 돌발 상황 | |
