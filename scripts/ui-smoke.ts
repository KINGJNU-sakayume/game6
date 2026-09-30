// 실제 클릭으로 한 판을 진행해 보는 연기 검사. 오류가 나면 실패한다.
// 사용: npx vite --port 5173 & npx tsx scripts/ui-smoke.ts [--steps 400] [--shots]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Page } from "playwright-core";

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const URL = arg("url", "http://localhost:5173");
const STEPS = Number(arg("steps", "400"));
const SHOTS = process.argv.includes("--shots");
mkdirSync("shots/smoke", { recursive: true });

async function phase(page: Page): Promise<string> {
  const cls = (await page.locator("main.screen").getAttribute("class")) ?? "";
  return cls.replace(/.*screen-/, "").trim();
}

async function main() {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // 테스트 환경에서는 CDN이 막혀 있어 같은 버전의 로컬 UMD 파일을 대신 준다
  await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (route) => {
    const url = route.request().url();
    const lib = url.includes("react-dom") ? "react-dom" : "react";
    return route.fulfill({ path: `node_modules/${lib}/umd/${url.split("/").pop()}`, contentType: "application/javascript" });
  });

  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("net::ERR_FAILED")) errors.push(`console: ${m.text()}`);
  });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill(".field-input", "SMOKE-0001");
  await page.click("button[type=submit]");

  const seen: Record<string, number> = {};
  let shot = 0;
  for (let i = 0; i < STEPS; i++) {
    const ph = await phase(page);
    seen[ph] = (seen[ph] ?? 0) + 1;
    if (SHOTS && seen[ph] === 1) await page.screenshot({ path: `shots/smoke/${String(shot++).padStart(2, "0")}-${ph}.png` });
    if (errors.length) break;

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
      const node = page.locator(".map-node.is-avail, .map-boss.is-avail").first();
      await node.click();
      continue;
    }
    if (ph === "combat") {
      // 쓸 수 있는 카드를 하나 쓰고, 없으면 턴 종료
      const cards = page.locator(".hand-slot .card:not(.is-dim)");
      const n = await cards.count();
      let played = false;
      for (let k = 0; k < n && !played; k++) {
        const before = await page.locator(".hand-slot").count();
        const card = cards.nth(k);
        await card.click();
        // 대상이 필요한 카드는 질병을 누른다
        if (await page.locator(".disease.is-targetable").count()) {
          await page.locator(".disease.is-targetable .lightbox").first().click();
        } else if (await page.locator(".hand-slot.is-sel").count()) {
          await page.locator(".hand-slot.is-sel .card").click();
        }
        await page.waitForTimeout(30);
        const after = await page.locator(".hand-slot").count().catch(() => before);
        played = after !== before || (await phase(page)) !== "combat" || (await page.locator(".ov-sheet[role=dialog]").count()) > 0;
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
  console.log("phases seen:", JSON.stringify(seen));
  console.log("final:", final);
  await page.screenshot({ path: "shots/smoke/final.png" });
  await browser.close();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
