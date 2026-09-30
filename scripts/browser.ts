// 브라우저 검사 스크립트가 함께 쓰는 실행기.
// 순서: CHROME_PATH 환경 변수 → 이 작업 환경의 Playwright Chromium → 설치된 Google Chrome(GitHub Actions 러너).
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, LaunchOptions } from "playwright-core";

const LOCAL_CHROMIUM = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export async function launchBrowser(): Promise<Browser> {
  const opts: LaunchOptions = {};
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  else if (existsSync(LOCAL_CHROMIUM)) opts.executablePath = LOCAL_CHROMIUM;
  else opts.channel = "chrome";
  if (process.env.HTTPS_PROXY) opts.proxy = { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" };
  return chromium.launch(opts);
}

/** 배포 페이지가 CDN에서 받는 React UMD를 node_modules의 같은 버전 파일로 대신 준다 (네트워크와 무관하게 검사). */
export async function serveReactLocally(ctx: BrowserContext): Promise<void> {
  await ctx.route(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net/, (route) => {
    const url = route.request().url();
    const lib = url.includes("react-dom") ? "react-dom" : "react";
    return route.fulfill({ path: `node_modules/${lib}/umd/${url.split("/").pop()}`, contentType: "application/javascript" });
  });
}
