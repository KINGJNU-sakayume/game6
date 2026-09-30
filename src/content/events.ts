// 돌발 상황 5종과 교수님 질문. design.md §5.9–5.10
import type { EventDef, QuizQuestion } from "../core/types";

export const EVENTS = [
  {
    id: "pharma_sample",
    title: "제약회사 샘플",
    body: "간호사실 앞에서 영업사원이 서류 가방을 연다. \"신약 샘플이에요. 선생님 환자분께 딱일 것 같아서요.\"",
    options: [
      { id: "a", label: "샘플을 받는다", detail: "아직 처방집에 없는 고급 약물 1개를 처방집에 추가한다.", ops: [{ op: "gain_random_card", rarity: "uncommon", kind: "drug", zone: "formulary" }], result: "샘플 상자를 가운 주머니에 넣었다." },
      { id: "b", label: "최신 문헌만 받는다", detail: "처방집의 무작위 약물 1개를 최적화한다.", ops: [{ op: "upgrade_random", count: 1, kind: "drug" }], result: "리뷰 논문 한 편을 받아 읽었다. 처방이 조금 더 정확해졌다." },
    ],
  },
  {
    id: "night_shift",
    title: "야간 당직",
    body: "새벽 2시. 병동이 잠시 조용하다. 밀린 처방을 손볼지, 당직실에서 눈을 붙일지.",
    options: [
      { id: "a", label: "밤새 처방을 다듬는다", detail: "카드를 최대 2장 골라 최적화한다. 다음 전투 첫 턴 오더 −1(피로).", ops: [{ op: "deck_select", purpose: "upgrade", min: 0, max: 2, prompt: "최적화할 처방을 2장까지 고르세요" }, { op: "set_flag", flag: "fatigue", value: 1 }], result: "동이 틀 무렵 처방이 깔끔해졌다. 눈이 따갑다." },
      { id: "b", label: "잠깐 눈을 붙인다", detail: "활력 8 회복.", ops: [{ op: "heal", amount: 8 }], result: "40분을 잤다. 그사이 환자도 편안히 잤다." },
    ],
  },
  {
    id: "conference",
    title: "학회 발표",
    body: "과장님이 이번 증례로 학회 포스터를 내자고 한다. 등록비는 예산에서 나간다.",
    options: [
      { id: "a", label: "발표를 준비한다", detail: "예산 −60. 무작위 일반 가이드라인 1개를 얻는다.", requires: { goldAtLeast: 60 }, ops: [{ op: "lose_gold", amount: 60 }, { op: "gain_random_relic", tier: "common" }], result: "질의응답에서 받은 질문 하나가 오래 남았다." },
      { id: "b", label: "불참한다", detail: "아무 일도 없다.", ops: [], result: "병동을 지켰다." },
    ],
  },
  {
    id: "family_meeting",
    title: "보호자 면담",
    body: "보호자가 면담실에서 기다린다. 무엇을 먼저 이야기할까.",
    options: [
      { id: "a", label: "치료 계획을 설명한다", detail: "활력 10 회복.", ops: [{ op: "heal", amount: 10 }], result: "보호자가 고개를 끄덕였다. 환자의 표정도 한결 편해졌다." },
      { id: "b", label: "불필요한 처방을 정리한다", detail: "처방 목록에서 카드 1장을 제거한다.", ops: [{ op: "deck_select", purpose: "remove", min: 0, max: 1, prompt: "정리할 처방 1장을 고르세요" }], result: "치료 목표를 다시 세우고 처방을 덜어냈다." },
    ],
  },
  {
    id: "pimping",
    title: "교수님 질문",
    body: "회진 도중 교수님이 걸음을 멈추고 당신을 본다.",
    quiz: true,
    options: [],
  },
] satisfies EventDef[];

export const QUIZ = [
  { id: "q_dka_k", question: "DKA 환자의 칼륨이 낮다(3.0). 인슐린보다 먼저 할 일은?", options: ["인슐린 즉시 투여", "칼륨 보충", "중탄산염 투여"], answer: 1, explanation: "인슐린은 칼륨을 세포 안으로 옮긴다. 칼륨이 3.3 미만이면 인슐린을 미루고 먼저 보충한다." },
  { id: "q_mrsa", question: "봉와직염 배양에서 MRSA가 나왔다. 가장 알맞은 항생제는?", options: ["세프트리악손", "반코마이신", "메트로니다졸"], answer: 1, explanation: "MRSA에는 일반적인 베타락탐이 듣지 않는다. 반코마이신이 표준 선택이다." },
  { id: "q_chf", question: "급성 심부전 악화 환자에게 피해야 할 처치는?", options: ["푸로세미드", "대량 수액", "산소"], answer: 1, explanation: "체액 과다가 문제의 중심이다. 이뇨제로 빼야 할 때 수액을 더하면 폐부종이 심해진다." },
  { id: "q_anaphylaxis", question: "아나필락시스의 1차 약물은?", options: ["항히스타민", "스테로이드", "에피네프린 근육주사"], answer: 2, explanation: "에피네프린 근육주사가 1차다. 항히스타민과 스테로이드는 보조 치료다." },
  { id: "q_he", question: "간성뇌증 환자의 불면에 피해야 할 약은?", options: ["락툴로오스", "벤조디아제핀", "리팍시민"], answer: 1, explanation: "진정제는 간성뇌증을 유발하거나 악화시킨다." },
  { id: "q_qt", question: "레보플록사신과 함께 쓸 때 QT 연장 위험이 커지는 약은?", options: ["온단세트론", "아세트아미노펜", "판토프라졸"], answer: 0, explanation: "레보플록사신과 온단세트론은 모두 QT 간격을 늘린다. 저칼륨혈증이 겹치면 더 위험하다." },
  { id: "q_pressor", question: "패혈성 쇼크의 1차 승압제는?", options: ["도파민", "노르에피네프린", "페닐에프린"], answer: 1, explanation: "국제 패혈증 지침은 노르에피네프린을 1차로 권고한다." },
  { id: "q_ptx", question: "긴장성 기흉이 의심된다. 즉시 할 일은?", options: ["흉부 CT", "바늘 감압", "기관 삽관"], answer: 1, explanation: "임상 진단 후 즉시 감압한다. 양압 환기는 기흉을 키울 수 있다." },
  { id: "q_cdi", question: "C. difficile 감염의 1차 치료는?", options: ["경구 반코마이신 또는 피닥소마이신", "정맥 반코마이신", "세프트리악손"], answer: 0, explanation: "정맥 반코마이신은 대장 안에 충분히 도달하지 않는다. 원인 항생제는 가능하면 끊는다." },
  { id: "q_tpa", question: "급성 뇌경색의 정맥 혈전용해는 발병 후 언제까지?", options: ["4.5시간", "12시간", "24시간"], answer: 0, explanation: "정맥 혈전용해는 4.5시간 이내다. 혈전 제거술은 선택된 환자에서 24시간까지 가능하다." },
] satisfies QuizQuestion[];
