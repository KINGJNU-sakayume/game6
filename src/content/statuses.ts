// 상태 효과와 키워드. design.md §5.7, 부록 A
import type { KeywordDef, StatusDef } from "../core/types";

export const STATUSES = [
  { id: "vulnerable", nameKo: "취약", owner: "both", stacking: "duration", decay: "round_end", debuff: true, description: "받는 피해 ×1.5. 라운드가 끝날 때마다 1 줄어든다." },
  { id: "weak", nameKo: "위축", owner: "both", stacking: "duration", decay: "round_end", debuff: true, description: "주는 피해 ×0.75. 라운드가 끝날 때마다 1 줄어든다." },
  { id: "aggravation", nameKo: "악화", owner: "enemy", stacking: "intensity", decay: "none", debuff: false, description: "공격 피해에 스택만큼 더한다." },
  { id: "inflammation", nameKo: "염증", owner: "enemy", stacking: "intensity", decay: "custom", debuff: false, description: "질병의 턴이 끝날 때 스택만큼 중증도를 회복하고 1 줄어든다." },
  { id: "acidosis", nameKo: "산증", owner: "enemy", stacking: "intensity", decay: "none", debuff: false, description: "공격 피해에 스택만큼 더한다. 수액을 투여하면 2 줄어든다.", medical: { fidelity: "simplified", note: "DKA의 대사성 산증. 수액과 인슐린으로 교정된다" } },
  { id: "dehydration", nameKo: "탈수", owner: "patient", stacking: "duration", decay: "round_end", debuff: true, description: "안정화 획득 ×0.75. 라운드가 끝날 때마다 1 줄어든다." },
  { id: "hypoxia", nameKo: "저산소", owner: "patient", stacking: "intensity", decay: "custom", debuff: true, description: "턴이 시작될 때 오더 −1, 그 후 1 줄어든다. 산소 투여·기관 삽관으로 없앤다." },
  { id: "hypotension", nameKo: "저혈압", owner: "patient", stacking: "intensity", decay: "none", debuff: true, description: "턴이 시작될 때 승압제가 투여 중이 아니면 활력을 스택만큼 잃는다. 수액을 투여하면 1 줄어든다.", medical: { fidelity: "simplified", note: "쇼크의 저관류. 수액과 승압제로 유지한다" } },
  { id: "bleeding_tendency", nameKo: "출혈 경향", owner: "patient", stacking: "intensity", decay: "custom", debuff: true, description: "턴이 시작될 때 항응고제와 항혈소판제가 모두 투여 중이면 활력 −2. 아니면 사라진다.", medical: { fidelity: "accurate", note: "이중 항혈전 요법의 출혈 위험" } },
  { id: "active_bleeding", nameKo: "활동성 출혈", owner: "enemy", stacking: "intensity", decay: "none", debuff: false, description: "플레이어 턴이 시작될 때마다 환자 활력 −1. 결정적 지혈로 멈춘다.", medical: { fidelity: "unverified", note: "v2.0 신규, v2.1에서 DIC에도 씀(v2.0 표시: simplified). 결정적 지혈(내시경) 또는 혈액제제 보충 전까지 계속되는 출혈" } },
  { id: "fatigue", nameKo: "피로", owner: "patient", stacking: "intensity", decay: "custom", debuff: true, description: "전투 첫 턴 오더 −1. 그 후 사라진다." },
] satisfies StatusDef[];

export const KEYWORDS = [
  { id: "exhaust", nameKo: "소진", description: "사용하면 이번 전투 동안 폐기 더미로 간다." },
  { id: "retain", nameKo: "보존", description: "턴이 끝나도 버려지지 않는다." },
  { id: "ethereal", nameKo: "휘발", description: "턴이 끝날 때 손에 있으면 소진된다." },
  { id: "power", nameKo: "지속 효과", description: "사용하면 이번 전투 동안 효과가 이어지고, 카드는 폐기 더미로 간다." },
  { id: "half_life", nameKo: "반감기", description: "투여 중으로 남는 턴 수. 턴이 시작될 때 1 줄어든다. 투여 중인 약물끼리 상호작용한다." },
  { id: "indication", nameKo: "적응증", description: "약물과 결정적 시술은 적응이 되는 질병에만 듣는다. 듣지 않으면 '반응 없음'이 소견으로 남는다." },
  { id: "contraindication", nameKo: "금기", description: "금기인 약물을 투여하면 그 질병이 악화된다(질병 부담 증가, 악화 +1). 대상이 아니어도 전신에 작용한다." },
  { id: "resistance", nameKo: "획득 내성", description: "원인균을 배양으로 확인하기 전(경험적)이나 광범위 항생제를 쓰면 그 계열에 내성이 쌓인다. 스택당 −20%, 최소 40%." },
  { id: "differential", nameKo: "감별 진단", description: "소견이 가설의 예상과 맞으면 지지, 어긋나면 반대 근거가 된다. 반대 근거가 쌓이면 배제된다. 하나만 남으면 확진." },
  { id: "working_dx", nameKo: "작업 진단", description: "지금 이 진단으로 치료하겠다는 결정. 처방집이 그 진단에 맞춰 열리고, 1차 치료는 ×1.3. 바꾸려면 오더 1." },
  { id: "return", nameKo: "처방 반납", description: "맞지 않는 치료 처방을 거두고 카드 1장을 뽑는다. 턴당 1회, 치료가 아니다." },
] satisfies KeywordDef[];
