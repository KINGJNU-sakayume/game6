// 화면별 스크린숏. 탐욕 봇으로 각 단계의 상태를 만든 뒤 개발 서버에 주입해 찍는다.
// 사용: npx vite --port 5173 & npm run shots -- [--url http://localhost:5173] [--only combat,map]
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Page } from "playwright-core";
import { CONTENT } from "../src/content";
import { installContent, newRun, step } from "../src/core";
import type { GameState } from "../src/core";
import { GreedyBot } from "../src/sim/bots/greedy";

installContent(CONTENT);

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : def;
}
const URL = arg("url", "http://localhost:5173");
const ONLY = arg("only", "").split(",").filter(Boolean);
const OUT = arg("out", "shots");
mkdirSync(OUT, { recursive: true });

type Key = "map" | "combat" | "combat2" | "combat_act2" | "boss" | "reward" | "shop" | "rest" | "event" | "boss_relic" | "gameover" | "victory" | "map_act2" | "pending";

function collect(): Partial<Record<Key, GameState>> {
  const got: Partial<Record<Key, GameState>> = {};
  const want: Key[] = ["map", "combat", "combat2", "combat_act2", "boss", "reward", "shop", "rest", "event", "boss_relic", "gameover", "victory", "map_act2", "pending"];
  for (let i = 0; i < 60 && want.some((k) => !got[k]); i++) {
    const seed = `shot-${i}`;
    let s = newRun(seed);
    const bot = new GreedyBot(seed, 120);
    let guard = 0;
    while (guard++ < 4000) {
      const put = (k: Key) => {
        if (!got[k]) got[k] = structuredClone(s);
      };
      if (s.pending) put("pending");
      else if (s.phase === "map") s.run.act === 1 ? put("map") : put("map_act2");
      else if (s.phase === "combat" && s.combat && s.combat.turn >= 2) {
        const n = s.combat.enemies.length;
        if (s.combat.kind === "boss") put("boss");
        else if (n >= 2) put("combat2");
        else if (s.run.act >= 2) put("combat_act2");
        else if (s.combat.turn === 2) put("combat");
      } else if (s.phase === "reward") put("reward");
      else if (s.phase === "shop") put("shop");
      else if (s.phase === "rest") put("rest");
      else if (s.phase === "event") put("event");
      else if (s.phase === "boss_relic") put("boss_relic");
      else if (s.phase === "gameover") {
        put("gameover");
        break;
      } else if (s.phase === "victory") {
        put("victory");
        break;
      }
      s = step(s, bot.choose(s)).state;
    }
  }
  return got;
}

async function shoot(page: Page, name: string) {
  // 한글 글꼴은 글자 범위별로 늦게 받아지므로 두 번 기다린다
  await page.waitForTimeout(500);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("shot", name);
}

async function main() {
  const states = collect();
  console.log("captured:", Object.keys(states).join(", "));
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
  });
  const open = async (state: GameState | null, viewport = { width: 1280, height: 720 }) => {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    if (state) await ctx.addInitScript((data) => {
      (window as unknown as { claude: unknown }).claude = { hot: { data } };
    }, { state, log: [] });
    // 테스트 환경에서는 CDN이 막혀 있어 같은 버전의 로컬 UMD 파일을 대신 준다
    await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (route) => {
      const url = route.request().url();
      const lib = url.includes("react-dom") ? "react-dom" : "react";
      return route.fulfill({ path: `node_modules/${lib}/umd/${url.split("/").pop()}`, contentType: "application/javascript" });
    });
    // 브라우저는 프록시 CA를 모르므로 글꼴은 Node 쪽에서 받아 넘긴다 (NODE_EXTRA_CA_CERTS로 검증된다)
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
      try {
        const resp = await route.fetch();
        await route.fulfill({ response: resp });
      } catch (e) {
        console.error("font fetch failed:", (e as Error).message);
        await route.abort();
      }
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error("pageerror:", e.message));
    page.on("console", (m) => {
      if (m.type() === "error") console.error("console:", m.text());
    });
    await page.goto(URL);
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    return { page, ctx };
  };
  const want = (k: string) => ONLY.length === 0 || ONLY.includes(k);

  if (want("title")) {
    const { page, ctx } = await open(null);
    await shoot(page, "01-title");
    await page.getByRole("button", { name: /진료 안내/ }).first().click().catch(() => undefined);
    await shoot(page, "01b-help");
    await ctx.close();
  }
  const order: [Key, string][] = [
    ["map", "02-map"],
    ["combat", "03-combat"],
    ["combat2", "04-combat-pair"],
    ["combat_act2", "05-combat-act2"],
    ["boss", "06-boss"],
    ["reward", "07-reward"],
    ["shop", "09-shop"],
    ["rest", "10-rest"],
    ["event", "11-event"],
    ["boss_relic", "12-boss-relic"],
    ["map_act2", "13-map-act2"],
    ["pending", "14-pending"],
    ["gameover", "15-gameover"],
    ["victory", "16-victory"],
  ];
  for (const [k, name] of order) {
    const st = states[k];
    if (!st || !want(k)) continue;
    const { page, ctx } = await open(st);
    await shoot(page, name);
    if (k === "combat" || k === "combat2") {
      // 손패 위에 커서: 확대 + DUR 창
      const slots = page.locator(".hand-slot .card");
      const count = await slots.count();
      for (let i = 0; i < count; i++) {
        const cls = (await slots.nth(i).getAttribute("class")) ?? "";
        if (cls.includes("card-drug")) {
          await slots.nth(i).hover();
          await shoot(page, `${name}-hover-drug`);
          await slots.nth(i).click();
          await page.locator(".disease").first().hover();
          await shoot(page, `${name}-target`);
          break;
        }
      }
      await page.mouse.move(10, 10);
      await page.keyboard.press("Escape");
      const tipHost = page.locator(".dz-table-btn").first();
      if (await tipHost.count()) {
        await tipHost.hover();
        await shoot(page, `${name}-table`);
      }
      await page.locator(".log-tab").click().catch(() => undefined);
      await shoot(page, `${name}-log`);
    }
    if (k === "reward") {
      await page.locator(".reward-row", { hasText: "처방 추가" }).first().click().catch(() => undefined);
      await shoot(page, "08-card-pick");
    }
    if (k === "pending") {
      await page.locator(".ov-sheet .grid-cell .card[role=button]").first().click().catch(() => undefined);
      await shoot(page, "14b-pending-picked");
    }
    if (k === "map") {
      await page.locator(".emr-actions button").first().click().catch(() => undefined);
      await shoot(page, "02b-deck");
    }
    await ctx.close();
  }
  if (want("phone") && states.combat) {
    const { page, ctx } = await open(states.combat, { width: 390, height: 844 });
    await shoot(page, "20-phone-portrait");
    await ctx.close();
    const l = await open(states.combat, { width: 844, height: 390 });
    await shoot(l.page, "21-phone-landscape");
    await l.ctx.close();
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
