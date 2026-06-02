import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.spec.ts",
        // 型のみのファイルや純粋宣言は対象外
        "src/schema/index.ts",
      ],
      // 閾値はベースライン取得後に段階的に引き上げる。初期は警告のみ。
      // thresholds: { lines: 60, statements: 60, functions: 50, branches: 50 },
    },
  },
})
