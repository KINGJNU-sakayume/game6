// 실제 클릭으로 한 판을 진행해 보는 연기 검사.
// 실패 조건: 페이지 오류·콘솔 오류, 또는 전투에서 한 번도 이기지 못함(보상 화면에 닿지 못함).
// 사용: npx vite --port 5173 & npx tsx scripts/ui-smoke.ts [--url URL] [--steps 400] [--shots]
import { appendFileSync, mkdirSync } from "node:fs";
import type { Page } from "playwright-core";
import { launchBrowser, serveReactLocally } from "./browser";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const URL = arg("url", "http://localhost:5173");
const STEPS = Number(arg("steps", "400"));
const SHOTS = process.argv.includes("--shots");
const OUT = arg("out", "shots/smoke");
mkdirSync(OUT, { recursive: true });

async function phase(page: Page): Promise<string> {
  const cls = (await page.locator("main.screen").getAttribute("class")) ?? "";
  return cls.replace(/.*screen-/, "").trim();
}

/** 카드를 쓴 뒤 화면이 바뀔 때까지 잠깐 기다린다 (느린 CI 러너 대비) */
async function waitPlayed(page: Page, handBefore: number): Promise<boolean> {
  for (let t = 0; t < 12; t++) {
    await page.waitForTimeout(25);
    if ((await phase(page)) !== "combat") return true;
    if ((await page.locator(".ov-sheet[role=dialog]").count()) > 0) return true;
    if ((await page.locator(".decision").count()) > 0) return true;
    if ((await page.locator(".hand-slot").count()) !== handBefore) return true;
  }
  return false;
}

/** 손패 카드의 아래쪽 가장자리에 커서를 두어도 확대 상태가 흔들리지 않아야 한다 (회귀 검사) */
async function checkHoverStable(page: Page): Promise<string | null> {
  const slot = page.locator(".hand-slot").nth(1);
  if (!(await slot.count())) return null;
  const box = await slot.boundingBox();
  if (!box) return null;
  const y = Math.min(box.y + box.height - 10, 712);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.waitForTimeout(400);
  const samples: boolean[] = [];
  for (let i = 0; i < 10; i++) {
    samples.push(((await slot.getAttribute("class")) ?? "").includes("is-hover"));
    await page.waitForTimeout(40);
  }
  await page.mouse.move(640, 300);
  await page.waitForTimeout(200);
  return samples.every(Boolean) ? null : `손패 카드 아래쪽에 커서를 두면 확대가 오르내린다 (${samples.map((b) => (b ? 1 : 0)).join("")})`;
}

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await serveReactLocally(ctx);

  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("net::ERR_FAILED")) errors.push(`console: ${m.text()}`);
  });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill("#seed", "SMOKE-0001");
  await page.click("button[type=submit]");

  const seen: Record<string, number> = {};
  let shot = 0;
  for (let i = 0; i < STEPS; i++) {
    const ph = await phase(page);
    seen[ph] = (seen[ph] ?? 0) + 1;
    if (SHOTS && seen[ph] === 1) await page.screenshot({ path: `${OUT}/${String(shot++).padStart(2, "0")}-${ph}.png` });
    if (errors.length) break;

    // 임상 결정 창: 고를 수 있는 첫 선택지(없으면 그만두기)
    if (await page.locator(".decision").count()) {
      seen.decision = (seen.decision ?? 0) + 1;
      if (SHOTS && seen.decision === 1) await page.screenshot({ path: `${OUT}/${String(shot++).padStart(2, "0")}-decision.png` });
      const opt = page.locator(".decision .opt:not(:disabled)");
      if (await opt.count()) await opt.first().click();
      else await page.locator(".decision-foot .btn").click();
      continue;
    }
    // 대기 선택 창이 떠 있으면 먼저 처리
    if (await page.locator(".ov-sheet[role=dialog]").count()) {
      const cells = page.locator(".ov-sheet .grid-cell .card[role=button]");
      if (await cells.count()) await cells.first().click();
      const ok = page.locator(".ov-foot .btn-primary");
      if (await ok.isEnabled()) await ok.click();
      else await page.locator(".ov-foot .btn").first().click();
      continue;
    }
    if (ph === "title") break;
    if (ph === "map") {
      await page.locator(".map-node.is-avail, .map-boss.is-avail").first().click();
      continue;
    }
    if (ph === "combat") {
      if (seen.combat === 1) {
        await page.waitForTimeout(500); // 손패가 들어오는 연출이 끝난 뒤
        const hover = await checkHoverStable(page);
        if (hover) errors.push(hover);
      }
      // 작업 진단이 없고 의심 이상인 가설이 있으면 정한다 (감별 목록 클릭 경로 검사)
      if (!(await page.locator(".hyp.is-wd").count())) {
        const lead = page.locator(".hyp.lv-strong .hyp-btn:not(:disabled), .hyp.lv-suspected .hyp-btn:not(:disabled)");
        if (await lead.count()) {
          await lead.first().click();
          seen.commit = (seen.commit ?? 0) + 1;
          continue;
        }
      }
      // 쓸 수 있는 카드를 하나 쓰고, 없으면 턴 종료
      const cards = page.locator(".hand-slot .card:not(.is-dim)");
      const n = await cards.count();
      let played = false;
      for (let k = 0; k < n && !played; k++) {
        const before = await page.locator(".hand-slot").count();
        await cards.nth(k).click();
        // 대상이 필요한 카드는 질병을 누르고, 아니면 한 번 더 눌러 쓴다
        if (await page.locator(".disease.is-targetable").count()) {
          await page.locator(".disease.is-targetable .lightbox").first().click();
        } else if (await page.locator(".hand-slot.is-sel").count()) {
          await page.locator(".hand-slot.is-sel .card").click();
        }
        played = await waitPlayed(page, before);
        if (!played) await page.keyboard.press("Escape");
      }
      if (!played && (await phase(page)) === "combat") await page.click(".end-turn");
      continue;
    }
    if (ph === "reward") {
      const rows = page.locator(".reward-row:not(:disabled)");
      if (await rows.count()) {
        await rows.first().click();
        if (await page.locator(".pick-sheet").count()) await page.locator(".pick-card .card").first().click();
      } else await page.locator(".reward-foot .stamp-btn").click();
      continue;
    }
    if (ph === "shop") {
      const item = page.locator(".shop-item .card").first();
      if (await item.count()) await item.click();
      await page.locator(".shop-bottom .stamp-btn").click();
      continue;
    }
    if (ph === "rest") {
      const note = page.locator(".postit:not(:disabled)").first();
      if (await note.count()) await note.click();
      else await page.locator(".rest-foot .stamp-btn").click();
      if ((await phase(page)) === "rest" && (await page.locator(".rest-foot .stamp-btn").count())) await page.locator(".rest-foot .stamp-btn").click();
      continue;
    }
    if (ph === "event") {
      const opt = page.locator(".event-opt:not(:disabled), .quiz-opt:not(:disabled)").first();
      if (await opt.count()) await opt.click();
      else await page.locator(".event-foot .stamp-btn").click();
      continue;
    }
    if (ph === "boss_relic") {
      await page.locator(".boss-opt").first().click();
      continue;
    }
    if (ph === "gameover" || ph === "victory") break;
  }
  const final = await phase(page);
  await page.screenshot({ path: `${OUT}/final.png` });
  await browser.close();

  if (!seen.combat) errors.push("전투 화면에 닿지 못했다");
  else if (!seen.reward) errors.push("전투에서 한 번도 이기지 못했다(보상 화면에 닿지 못함)");
  if (seen.combat && !seen.decision) errors.push("임상 결정 창이 한 번도 뜨지 않았다");

  const report = `phases seen: ${JSON.stringify(seen)}\nfinal: ${final}`;
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### 클릭 연기 검사 (${URL})\n\n| 화면 | 방문 |\n|---|---|\n${Object.entries(seen)
        .map(([k, v]) => `| ${k} | ${v} |`)
        .join("\n")}\n\n마지막 화면: \`${final}\` · 오류 ${errors.length}건\n\n`,
    );
  }
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
