// 명령 → 한국어 설명문. design.md D6 원칙 5
import { cardDef, categoryName, channelDef, statusDef, tagDef, traitDef } from "./registry";
import type { CardDef, CardFilter, Condition, EffectOp, TargetSel, TriggerDef, ValueExpr } from "./types";

export interface CardText {
  lines: string[];
  /** 선택지 카드: 선택지 이름 (카드 위에 목록으로 보인다) */
  options?: string[];
  picks?: number;
  keywords: string[];
  drugLine?: string;
  sideEffectLine?: string;
  upgradeLine?: string;
  full: string;
}

const GROUP_KO: Record<string, string> = { history: "병력", exam: "진찰", lab: "검사", bedside: "현장 검사", imaging: "영상", micro: "미생물", vitals: "활력" };

const DEST: Record<string, string> = { discard: "완료 처방", draw_random: "대기 처방", hand: "손", draw_top: "대기 처방 맨 위" };

function val(v: ValueExpr): string {
  if (typeof v === "number") return String(v);
  if ("add" in v) return `${val(v.add[0])}+${val(v.add[1])}`;
  if ("mul" in v) return `${val(v.mul[0])}×${val(v.mul[1])}`;
  if ("min" in v) {
    const [a, b] = v.min;
    return typeof b === "number" ? `${val(a)}(최대 ${b})` : `min(${val(a)}, ${val(b)})`;
  }
  switch (v.ref) {
    case "drugs_ended_now":
      return "종료한 약물 수";
    case "hand_size":
      return "손패 수";
    case "side_effects_in_hand":
      return "손의 부작용 카드 수";
    default:
      return v.ref;
  }
}

function josaEunNeun(word: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}은(는)`;
  return (last - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`;
}

function filterName(f: CardFilter): string {
  if (f.ids?.length) return f.ids.map((id) => cardDef(id).nameKo).join("·");
  if (f.sideEffect) return "부작용";
  if (f.tags?.length) return f.tags.map((t) => tagDef(t)?.nameKo ?? t).join("·");
  if (f.kind?.length) return f.kind.map((k) => ({ drug: "약물", procedure: "처치", diagnostic: "진단", side_effect: "부작용" })[k]).join("·");
  return "";
}

function condText(c: Condition): string {
  if ("all" in c) return c.all.map(condText).join(", ");
  if ("any" in c) {
    const parts = c.any.map((x) => {
      if ("targetTrait" in x) return x.targetTrait.map((t) => traitDef(t)?.nameKo ?? t).join("·");
      if ("targetCategory" in x) return x.targetCategory.map((t) => `${categoryName(t)} 질환`).join("·");
      return condText(x);
    });
    return `대상이 ${parts.join(" 또는 ")}이면`;
  }
  if ("not" in c) {
    if ("activeDrugTag" in c.not) return `${tagDef(c.not.activeDrugTag)?.nameKo ?? c.not.activeDrugTag} 투여 중이 아니면`;
    return `(${condText(c.not)}) 아니면`;
  }
  if ("targetTrait" in c) return `대상이 ${c.targetTrait.map((t) => traitDef(t)?.nameKo ?? t).join("·")}이면`;
  if ("targetCategory" in c) return `대상이 ${c.targetCategory.map((t) => categoryName(t)).join("·")} 질환이면`;
  if ("knowledgeAtLeast" in c) return c.knowledgeAtLeast.level >= 2 ? "대상이 확진되었으면" : "대상이 감별 단계 이상이면";
  if ("activeDrugTag" in c) return `${tagDef(c.activeDrugTag)?.nameKo ?? c.activeDrugTag} 투여 중이면`;
  if ("hasStatus" in c) return `${statusDef(c.hasStatus.status).nameKo} 상태이면`;
  if ("vitalityBelowPct" in c) return `활력이 ${c.vitalityBelowPct}% 미만이면`;
  if ("eventDrugTag" in c) return `${tagDef(c.eventDrugTag)?.nameKo ?? c.eventDrugTag} 약물을 쓰면`;
  if ("hasWorkingDx" in c) return "작업 진단이 있으면";
  if ("organismKnown" in c) return "원인균을 알면";
  if ("channelObserved" in c) return `${channelDef(c.channelObserved).nameKo}를 했으면`;
  if ("ordersAtLeast" in c) return `오더가 ${c.ordersAtLeast} 이상이면`;
  if ("pendingResults" in c) return "기다리는 검사 결과가 있으면";
  if ("activeDrugAny" in c) return "투여 중인 약물이 있으면";
  if ("activeDrugBroad" in c) return "광범위 항생제를 투여 중이면";
  if ("suspect" in c) return "관련 가설이 의심되면";
  return "조건을 만족하면";
}

function who(t: TargetSel | undefined, def: CardDef): string {
  if (t === "all_enemies") return "모든 질병 ";
  if (t === "random_enemy") return "무작위 질병 ";
  if (t === "patient") return "환자 ";
  return def.target === "enemy" ? "" : "";
}

function opText(op: EffectOp, def: CardDef, extra = false): string {
  const plus = extra ? "+" : "";
  switch (op.op) {
    case "damage": {
      const hits = op.hits && op.hits > 1 ? ` ×${op.hits}회` : "";
      const tags = op.tags?.length ? ` [${op.tags.map((t) => tagDef(t)?.nameKo ?? t).join("·")}]` : "";
      return `${who(op.target, def)}질병 부담 ${plus}${val(op.amount)} 감소${hits}${tags}`;
    }
    case "gain_stability":
      return `안정화 ${plus}${val(op.amount)}`;
    case "heal":
      return op.target && op.target !== "patient" ? `질병 부담 ${val(op.amount)} 증가` : `활력 ${val(op.amount)} 회복`;
    case "lose_vitality":
      return `활력 −${val(op.amount)}`;
    case "draw":
      return `카드 ${val(op.amount)}장 뽑기`;
    case "draw_filtered":
      return `대기 처방에서 ${filterName(op.filter)} 카드 ${op.amount}장을 손으로`;
    case "gain_orders": {
      const n = typeof op.amount === "number" ? op.amount : 0;
      return n >= 0 ? `오더 +${val(op.amount)}` : `이번 턴 오더 ${n}`;
    }
    case "reveal_intent":
      return "다음 의도 공개";
    case "apply_status": {
      const st = statusDef(op.status).nameKo;
      if (op.target === "patient") return `환자에게 ${st} ${val(op.stacks)}`;
      return `${who(op.target, def)}${st} ${val(op.stacks)} 부여`;
    }
    case "remove_status": {
      const st = statusDef(op.status).nameKo;
      if (op.target === "patient") return op.stacks === "all" ? `환자의 ${st} 제거` : `환자의 ${st} ${op.stacks} 제거`;
      return op.stacks === "all" ? `대상의 ${st} 전부 제거` : `대상의 ${st} ${op.stacks} 제거`;
    }
    case "exhaust_cards": {
      const name = filterName(op.filter);
      const where = op.from.length === 1 && op.from[0] === "hand" ? "손의 " : "";
      return op.amount === "all" ? `${where}${name} 카드 전부 소진` : `${where}${name} 카드 ${op.amount}장 소진`;
    }
    case "add_card":
      return `${DEST[op.dest]}에 ${cardDef(op.cardId).nameKo} ${op.count}장`;
    case "cost_modifier": {
      const name = filterName(op.filter);
      const scope = op.scope === "turn" ? "이번 턴 " : "";
      const sign = op.delta < 0 ? `−${-op.delta}` : `+${op.delta}`;
      return `${scope}다음 ${name} 카드${op.uses > 1 ? ` ${op.uses}장` : ""} 비용 ${sign}`;
    }
    case "combat_flag":
      if (op.flag === "drugHalfLifeBonus") return `이번 전투 동안 이후 투여하는 약물의 지속 +${op.delta}`;
      if (op.flag === "orderSetArmed") return "다음에 쓰는 약물 카드가 한 번 더 발동한다(투여·상호작용·부작용 포함)";
      if (op.flag === "retainAll") return "이번 턴 종료 시 손패 전부 보존";
      return op.flag;
    case "plan_bonus":
      return `이번 전투 동안 이 문제의 치료 계획 배율 +${op.pct}%`;
    case "cancel_countdowns":
      return "예고된 합병증 취소";
    case "choose_option": {
      const n = op.picks ?? 1;
      return `${n > 1 ? `${n}개 선택` : "선택"}: ${op.options.map((o) => `${o.label}${o.cost ? `(+${o.cost})` : ""}`).join(" / ")}`;
    }
    case "investigate":
      return `${channelDef(op.channel).nameKo} 소견 확인`;
    case "investigate_best":
      return `감별력이 가장 높은 ${op.groups.map((g) => GROUP_KO[g] ?? g).join("·")} 소견 ${op.count}개 확인`;
    case "culture":
      return `${channelDef(`cx_${op.specimen}`).nameKo}: 그람 염색 즉시, 결과 ${op.delay}턴 뒤`;
    case "advance_results":
      return `기다리는 검사 결과를 ${op.turns}턴 앞당긴다`;
    case "discover":
      return `${op.pool === "drug" ? "처방집(약물)" : "시술 목록"}에서 ${op.count}개 중 1개를 골라 손으로 (이번 턴 비용 0)`;
    case "consult":
      return `진료과 ${op.count}곳 중 하나를 고르고, 그 과의 권고 중 하나를 따른다`;
    case "stop_drug_choice":
      return "투여 중 약물 하나를 골라 중단하고 카드 1장 뽑기";
    case "targeted_antibiotic":
      return "확인된 원인균에 맞는 가장 좁은 항생제를 손에";
    case "deescalate":
      return "범위 축소: 광범위 항생제 중단. 원인균을 알면 장내세균 교란 정리";
    case "end_drug":
      if (op.filter.all) return "투여 중 약물 전부 종료";
      return `투여 중인 ${(op.filter.tags ?? []).map((t) => tagDef(t)?.nameKo ?? t).join("·")} 종료`;
    case "extend_drug":
      return `투여 중 약물 지속 +${op.turns}`;
    case "gain_gold":
      return `예산 +${op.amount}`;
    case "delay":
      return `${op.turns}턴 뒤 같은 대상 ${op.effects.map((x) => opText(x, def)).join(", ")}`;
    case "select_cards": {
      if (op.then.some((x) => x.op === "exhaust_selected")) {
        const name = op.filter ? filterName(op.filter) : "";
        return `손의 ${name} 카드 ${op.max}장${op.min === 0 ? "까지" : ""} 골라 소진`;
      }
      if (op.then.some((x) => x.op === "discard_selected")) return `손패 ${op.max}장 버리기`;
      if (op.then.some((x) => x.op === "retain_selected")) return `손패 ${op.max}장 보존`;
      return op.prompt;
    }
    case "if": {
      const cond = condText(op.cond);
      if (op.else && op.then.length === 1 && op.else.length === 1) {
        const t = op.then[0]!;
        const e = op.else[0]!;
        if (t.op === "damage" && e.op === "damage") return `질병 부담 ${val(e.amount)} 감소. ${cond} 대신 ${val(t.amount)}`;
      }
      return `${cond} ${op.then.map((x) => opText(x, def, true)).join(", ")}`;
    }
    case "repeat":
      return `${op.times}회: ${op.effects.map((x) => opText(x, def)).join(", ")}`;
    case "modify_current":
      return `이번 카드 배율 ${op.pct}%`;
    case "custom":
      if (op.id === "random_discard") return "손패 무작위 1장 버림";
      if (op.id === "draw_penalty") return `다음 턴 드로우 −${op.params?.n ?? 1}`;
      return "";
    default:
      return "";
  }
}

function triggerText(t: TriggerDef, def: CardDef): string {
  const effects = t.effects.map((x) => opText(x, def)).filter(Boolean).join(", ");
  switch (t.on) {
    case "turn_end":
      return `턴 종료 시 손에 있으면 ${effects}`;
    case "card_drawn":
      return `뽑을 때 ${effects}`;
    case "drug_administered":
      return t.condition ? `손에 있는 동안 ${condText(t.condition).replace("약물을 쓰면", "약물을 쓰면")} ${effects}` : `약물 투여 시 ${effects}`;
    case "turn_start":
      return `투여 중: 턴 시작 시 ${effects}`;
    default:
      return effects;
  }
}

export function describeCard(cardId: string, upgraded = false): CardText {
  const def = cardDef(cardId, upgraded);
  const lines: string[] = [];
  let options: string[] | undefined;
  let picks: number | undefined;
  if (def.procedure) lines.push(`결정: 즉시 시행 / ${channelDef(def.procedure.confirm).nameKo} 확인 후(+1) / 보류`);
  if (def.textOverride) lines.push(def.textOverride);
  else {
    for (const op of def.effects) {
      if (op.op === "choose_option") {
        options = op.options.map((o) => `${o.label}${o.cost ? ` (+${o.cost})` : ""}`);
        picks = op.picks ?? 1;
        lines.push(picks > 1 ? `${picks}개를 차례로 고른다:` : "하나를 고른다:");
        continue;
      }
      const t = opText(op, def);
      if (t) lines.push(t);
    }
  }
  const keywords: string[] = [];
  if (def.keywords?.includes("retain")) keywords.push("보존");
  if (def.keywords?.includes("ethereal")) keywords.push("휘발");
  if (def.keywords?.includes("power")) keywords.push("지속 효과");
  if (def.keywords?.includes("exhaust") && !def.keywords.includes("power")) keywords.push("소진");
  const out: CardText = { lines, keywords, full: "" };
  if (options) {
    out.options = options;
    out.picks = picks;
  }
  if (def.upgradeText) out.upgradeLine = def.upgradeText;
  if (def.sideEffect) {
    const se = def.sideEffect;
    const seLines: string[] = ["사용 불가"];
    if (se.persistent) seLines.push("지속: 처방 목록에 남는다");
    for (const t of se.behavior) seLines.push(triggerText(t, def));
    if (se.passive === "abx_cost_up") seLines.push("손에 있는 동안 항생제 카드 비용 +1");
    if (se.passive === "infection_attack_up") seLines.push("손에 있는 동안 감염 질환의 공격 +2");
    if (se.purgeCost !== undefined) seLines.push(`오더 ${se.purgeCost}을 내면 정리(소진)할 수 있다`);
    out.lines = seLines;
  }
  if (def.drug) {
    const parts = [`반감기 ${def.drug.halfLife}턴`];
    for (const t of def.drug.whileActive ?? []) parts.push(triggerText(t, def));
    out.drugLine = parts.join(" · ");
    if (def.drug.sideEffects.length) {
      out.sideEffectLine = `부작용: ${def.drug.sideEffects
        .map((s) => `${cardDef(s.card).nameKo}${s.count > 1 ? ` ${s.count}장` : ""} → ${DEST[s.dest]}${cardDef(s.card).sideEffect?.persistent ? " (지속)" : ""}`)
        .join(", ")}`;
    } else out.sideEffectLine = "부작용 없음";
  }
  // 선택지는 "하나를 고른다: A · B · C" 한 문장으로
  const body = out.options?.length ? [...out.lines.slice(0, -1), `${out.lines.at(-1) ?? ""} ${out.options.join(" · ")}`.trim()] : out.lines;
  out.full = [...body, out.keywords.join(". "), out.drugLine, out.sideEffectLine].filter(Boolean).join(". ");
  return out;
}

export { josaEunNeun };
