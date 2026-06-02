---
name: code-review
description: Review code changes (staged diff or recent commit) for implementation-level concerns — logic correctness, edge cases, test gaps, security risks, performance hot spots — that biome/tsc/architecture-test cannot catch. Use as the last Inferential Feedback gate before merge. Trigger phrases include "/code-review", "コードレビュー", "ロジック確認", "PR レビュー".
---

# code-review: 実装レベルの懸念点を見る AI レビュー

## このスキルの役割

argos の harness は以下の Sensors を持つ:

| Sensor | 種別 | 検出対象 |
|---|---|---|
| `tsc --noEmit` | Computational | 型エラー |
| `biome check` | Computational | format / lint / 軽い anti-pattern |
| `vitest` / `playwright` | Computational | テストで守られている振る舞いの回帰 |
| `tests/architecture/dependencies.test.ts` | Computational | モジュール境界違反 |
| `/architecture-review` | Inferential | 責任の越境 / 命名 / アーキテクチャドリフト |
| **`/code-review`** | **Inferential** | **実装レベルの懸念点 (本スキル)** |
| `knip` (`check:dead`) | Computational | 未使用 export |

本スキルは「コードのロジック・実装品質」に集中し、`/architecture-review` (構造的) と相補的に動く。

## レビュー観点

### 1. ロジックの正確性

- **境界条件**: 空配列 / null / undefined / 0 件 / 1 件 / 大量件数の各ケースで挙動が変か
- **off-by-one**: 配列 index、loop 範囲、slice の終端
- **非同期処理**: race condition、Promise.all 内の例外伝播、await 漏れ
- **状態遷移**: store の mutator が想定外の中間状態を作らないか
- **エラー処理**: catch で握り潰していないか、ユーザーに見える形か

### 2. エッジケース

- **不正入力への耐性**: 外部 (LLM / Notion API / file import) からのデータ
- **localStorage 不可環境**: プライベートブラウジング、ストレージ満杯
- **空グラフ / 巨大グラフ**: パフォーマンスやレンダリングが崩れないか
- **時刻系**: タイムゾーン、夏時間、`Date.now()` の決定性

### 3. テストカバレッジ

- 振る舞いが変わった部分にテストが追加されているか
- ハッピーパス / 失敗系 / エッジケースが網羅されているか
- E2E と Unit の使い分けが適切か (DOM 操作は E2E、純粋関数は Unit)
- 既存テストが壊されていないか — `/quality-check` で確認

### 4. セキュリティ

- 外部入力をそのまま innerHTML / eval / Function constructor に渡していないか
- LLM への prompt injection リスク (ユーザー入力 → prompt 連結)
- API key / token をクライアントバンドルに含めていないか
- localStorage に機微情報を保存していないか

### 5. パフォーマンス

- React の **不要な再レンダー**: useMemo / useCallback の漏れ、Zustand selector の粒度
- **無限ループ**: useEffect 依存配列の不備
- **巨大計算の同期実行**: 数千ノードのグラフで毎フレーム走るような計算
- **メモリリーク**: addEventListener / setInterval の cleanup 漏れ
- **bundle 肥大化**: import の hoisting 漏れで動的 import が無効化

### 6. argos 固有の慣習

- **Hydration mismatch ガード**: `localStorage` / `matchMedia` 由来の state は mount 後 useEffect で反映 (CLAUDE.md §6-4)
- **ConfirmDialog 使用**: 破壊的操作で `window.confirm` を新規追加しない (CLAUDE.md §6-5)
- **CSS variable 使用**: hex hardcode しない (CLAUDE.md §5)
- **`applyExtraction` 経由**: 抽出結果を直接 graph store に書かない

## 実行ステップ

### 1. レビュー対象の決定

優先順:
1. ユーザー指定 (引数で commit hash / file path / branch range)
2. staged diff (`git diff --cached`)
3. 直近 1 コミット (`git show HEAD`)
4. 直近 N コミット (ユーザー指定があれば)

差分が 50 ファイル超のときは精度が落ちるので分割を提案。

### 2. 各観点に従ってチェック

優先度の重み付け:
- **必須 (must fix)**: バグ確実、データ破損、セキュリティ
- **推奨 (should fix)**: 顕著な anti-pattern、テスト不足、パフォーマンス懸念
- **任意 (nice to have)**: 改善提案、読みやすさ

### 3. 報告フォーマット

```
🔍 code-review レポート

【対象】<staged | HEAD | 範囲> — N ファイル変更

【検出した懸念事項】

#1 [<severity>] <観点カテゴリ> — <file>:<line>
  内容: <具体的な指摘>
  根拠: <なぜそれが問題か>
  提案: <修正案>
  (もしテスト追加が必要なら): <テスト追加案>

#2 ...

【良かった点】

- <ポジティブな観察 1>

【追加で確認したい点】

- <質問形式の不明点>
```

### 4. レビュー後のアクション

- 必須項目があれば修正を提案 (ユーザー確認後、別途修正タスクとして実行)
- テスト追加が必要なら `tests/` への追加案を出す
- `/architecture-review` も並行で呼ぶ価値があるか判断 (構造的観点が必要そうな差分なら推奨)

## このスキルを呼ばないケース

- 機械検査 (`/quality-check`) が落ちている時 — まずそちらを直す
- 1〜2 行の typo 修正 — レビュー不要
- 自動生成ファイル (next-env.d.ts 等) のみの変更
- リファクタ途中の WIP — 区切りがついてから

## 補足: false positive を減らすため

LLM レビューは **過剰検出しがち**。以下を意識する:
- **確信度の低い指摘は出さない** (テンプレ的に "考慮してください" を出力すると価値が薄れる)
- **既存パターンに準じている** ものは指摘しない (例: 既存の useState パターンと同じならスルー)
- **観点別に重複指摘しない** (1 つの問題に「これも問題」「これも違反」と複数記載しない)

## `/architecture-review` との使い分け

| シーン | `/architecture-review` | `/code-review` |
|---|---|---|
| 新規 module 追加 | ◎ | ○ |
| 既存 module のロジック修正 | △ | ◎ |
| バグフィックス | △ | ◎ |
| 新規 UI コンポーネント | ◎ | ○ |
| パフォーマンス改善 | ○ | ◎ |
| セキュリティ修正 | ○ | ◎ |

両方呼ぶのは大規模リファクタなど一部のケース。通常は片方で十分。
