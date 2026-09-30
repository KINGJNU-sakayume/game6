import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
const imports = (src: string) => [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]!);

describe("계층 경계 (design §3.2)", () => {
  it("core는 content·ui·sim을 import하지 않고 금지 API를 쓰지 않는다", () => {
    for (const f of files("src/core")) {
      const src = readFileSync(f, "utf8");
      for (const i of imports(src)) expect(i, f).not.toMatch(/(^|\/)(content|ui|sim)(\/|$)/);
      expect(src, f).not.toMatch(/Math\.random|Date\.now|new Date\(|document\.|window\./);
    }
  });
  it("content는 core/types만 import한다", () => {
    for (const f of files("src/content")) {
      for (const i of imports(readFileSync(f, "utf8"))) {
        if (i.startsWith(".") && !i.includes("core")) continue;
        expect(i, f).toMatch(/core\/types$/);
      }
    }
  });
  it("ui는 core의 공개 API(core/index)만 쓴다", () => {
    for (const f of files("src/ui")) {
      for (const i of imports(readFileSync(f, "utf8"))) {
        if (!i.includes("core")) continue;
        expect(i, f).toMatch(/core(\/index)?$/);
      }
    }
  });
});
