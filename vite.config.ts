/// <reference types="vitest" />
import { defineConfig } from "vite";

// 클래식 JSX 변환: 배포용 단일 HTML(artifact 모드)에서 React를 CDN UMD 전역으로 쓰기 위해서다 (design §3.11).
export default defineConfig(({ mode }) => ({
  // 상대 경로: GitHub Pages(https://<사용자>.github.io/<저장소>/)처럼 하위 경로에 올려도 자원을 찾는다
  base: "./",
  esbuild: { jsx: "transform", jsxFactory: "React.createElement", jsxFragment: "React.Fragment" },
  define: mode === "artifact" ? { "process.env.NODE_ENV": JSON.stringify("production") } : undefined,
  build:
    mode === "artifact"
      ? {
          outDir: "dist-artifact",
          emptyOutDir: true,
          cssCodeSplit: false,
          assetsInlineLimit: 100_000_000,
          modulePreload: false,
          target: "es2020",
          rollupOptions: {
            input: "src/ui/main.tsx",
            external: ["react", "react-dom", "react-dom/client"],
            output: {
              format: "iife",
              globals: { react: "React", "react-dom": "ReactDOM", "react-dom/client": "ReactDOM" },
              inlineDynamicImports: true,
              entryFileNames: "app.js",
              assetFileNames: "app.[ext]",
            },
          },
        }
      : { outDir: "dist" },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
}));
