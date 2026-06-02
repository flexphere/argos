---
name: quality-check
description: Run all argos quality sensors in fast-fail order (TypeScript → Biome → Vitest → Playwright) and report a concise summary. Use this before committing, after non-trivial edits, or when verifying that recent changes haven't regressed. Trigger phrases include "/quality-check", "全体チェック", "regression 確認", "前のコミット前にチェック".
---

# quality-check: argos 品質ハーネスの一括実行

## このスキルの役割

argos の全 computational sensors を **fast-fail order** (速い順) で実行し、最初に失敗した時点でユーザーに報告する。コミット前や非自明な変更後の最終チェックとして使う。

## 実行順序と理由

| Step | コマンド | 想定時間 | 失敗時の挙動 |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | 数秒 | エラー全部を表示して停止 |
| 2 | `npx biome check .` | 1 秒未満 | 1〜5 件のエラーを表示して停止 |
| 3 | `npm test` (Vitest) | 1〜2 秒 | 失敗テスト名を表示して停止 |
| 4 | `npx playwright test --reporter=line` | 12〜20 秒 | 失敗 spec を表示して停止 |

**Fast-fail 順 (型 → lint → unit → e2e) で実行する理由**: 速いほどフィードバックが早く、agent が次の修正に取り掛かりやすい。

## 実行ステップ

### 1. 型チェック

```bash
npx tsc --noEmit
```

- 出力が空 + exit 0 → ✅ 次へ
- エラーあり → そのまま全文表示し、修正を促す。ここで停止

### 2. Lint

```bash
npx biome check .
```

- "Checked X files. No fixes needed." → ✅ 次へ
- エラーあり → 表示。**自動修正可能なものは `npx biome check --apply .` を提案** (ユーザー許可後に実行)

### 3. Vitest

```bash
npm test
```

- "Tests N passed (N)" → ✅ 次へ
- 失敗あり → 失敗テスト名と差分を表示

### 4. Playwright E2E

```bash
npx playwright test --reporter=line
```

- "N passed (Xs)" → ✅ 全 sensor 通過
- 失敗あり → 失敗 spec 名を表示

## 完了報告フォーマット

全 sensor 通過時:

```
✅ quality-check 全 sensor 通過

  TypeScript: ✓
  Biome:      ✓
  Vitest:     N passed
  Playwright: N passed (Xs)
```

途中失敗時:

```
❌ quality-check: <ステップ名> で失敗

<失敗内容>

修正案: <ユーザーへの提案>
```

## ハマりどころ

| 症状 | 対処 |
|---|---|
| Playwright が起動しない (browser 未インストール) | `npx playwright install chromium` を提案 |
| dev サーバーが先に起動済み | Playwright は webServer config を見るので問題なし。手動起動も Playwright が検知 |
| tsc が遅い | `tsc --noEmit --incremental` を `.tsbuildinfo` 付きで実行する選択肢あり (本スキルでは未採用) |
| biome がフォーマット差分を検出 | 機械的に修正できるので `--apply` 経由で自動修正 |

## このスキルを呼ばないケース

- **超軽微な変更** (typo, コメント追加のみ) — 個別に lint だけ走らせれば十分
- **WIP の途中** — 当然失敗するので、まとまった時点で呼ぶ
- **e2e を意図的にスキップしたい大規模変更途中** — 個別に `npm test` だけ呼ぶ
