---
name: architecture-review
description: Review code changes (staged diff or recent commit) for architectural drift in argos. Use after significant changes or before merging to detect: (1) module boundary violations beyond what tests/architecture catches mechanically, (2) inappropriate responsibility crossing, (3) naming convention deviations, (4) emerging anti-patterns. Trigger phrases include "/architecture-review", "アーキテクチャレビュー", "境界違反していないか確認", "設計的に大丈夫か".
---

# architecture-review: 機械検出を超えるアーキテクチャドリフトの LLM レビュー

## このスキルの役割

`tests/architecture/dependencies.test.ts` (Phase 2-A) はモジュール **間の import 関係** を機械検証する。しかし以下は機械検出できない:

- **責任の越境**: 例: `store/` に "UI で都合がいいだけの helper" が混入
- **暗黙的なドメイン漏れ**: 例: `signals/` に Signal とは無関係な計算ロジックが追加
- **命名規約逸脱**: 例: 既存の `*Node`, `*Store`, `*Service` 等のパターン破り
- **アンチパターンの萌芽**: 例: `useEffect` で重い計算、prop drilling の deep nest

このスキルは LLM 視点でこれらを検出し、ユーザーへの修正提案を出す。

## 実行ステップ

### 1. レビュー対象の特定

ユーザー指定がなければデフォルトは:
- staged な diff (`git diff --cached`)
- staged が空なら直近 1 コミット (`git show HEAD`)

差分が大きい (50 ファイル超など) ときは「広い範囲を一度にレビューするのは精度が落ちる」と注意した上で続行。

### 2. レビューポイント (LLM がチェックすべき観点)

#### 2-A. レイヤー責任の整合性

| 層 | 期待する役割 | NG パターン |
|---|---|---|
| `schema/` | 型・zod スキーマのみ | 関数ロジック、副作用 |
| `store/` | Zustand state とその純粋 mutator | React hooks、DOM 操作、LLM 呼び出し |
| `graph/` | React Flow との橋渡し、layout 計算 | UI イベント処理、LLM 呼び出し |
| `ui/` | React コンポーネント、ユーザー操作受付 | ビジネスロジック、直接 fetch |
| `io/` | 外部データ ↔ 内部状態の変換 (jsonIO, markdown, mermaid, applyExtraction 等) | ビジネスルール判定 |
| `llm/` | LLM 呼び出しと structured output 取得 | graph/store への書き込み |
| `signals/` | 構造系・意味系シグナル検出 | UI 表示、shape mutation |

#### 2-B. 命名・配置の慣習

argos の確立されたパターン:
- ノード型: `*Node` (IssueNode, ClaimNode 等)
- React Flow ノード View: `*NodeView` (IssueNodeView 等)
- ストア: `*Store` (graphStore, uiStore)
- スキル: `.claude/skills/<name>/SKILL.md` に YAML frontmatter
- ADR: `docs/adr/NNNN-{kebab-case}.md` (Proposed/Accepted 二状態)

これらから外れる新規追加は理由を聞く。

#### 2-C. アンチパターン検出

- **deep prop drilling**: 3 段以上の props 受け渡しは Zustand に上げる検討
- **巨大 useEffect**: 依存配列が 5 個超は分割するか useMemo へ
- **`any` の使用**: 型推論で救えないか確認
- **DOM 直接操作**: ref 経由でないなら避ける
- **`console.log` の残存**: テスト or デバッグ目的なら削除
- **ハードコード hex color**: CSS variable を使う (Catppuccin theme)
- **`window.confirm/alert` の新規追加**: `ConfirmDialog` を使う

#### 2-D. テスト追加の妥当性

- 振る舞いが変わったコードに対応するテストが追加されているか
- テストの粒度が適切か (E2E でしか守れないものを unit で書こうとしていないか)
- 既存テストを壊していないか (`/quality-check` で実行)

### 3. 報告フォーマット

```
🏛️ architecture-review レポート

【対象】<staged | HEAD | 範囲> — N ファイル変更

【検出した懸念事項】

#1 [<severity: 必須/推奨/任意>] <観点カテゴリ>
  ファイル: <path>:<line>
  内容: <具体的な指摘>
  提案: <改善案>

#2 ...

【良かった点】

- <ポジティブな観察 1>
- ...

【追加で確認したい点 (もしあれば)】

- <質問形式で示す不明点>
```

### 4. 重要度の判定基準

- **必須 (must fix)**: 機械的にも検出できる規約違反 (テストが落ちるべき)、データ破損リスク、セキュリティ懸念
- **推奨 (should fix)**: 明らかな anti-pattern、保守性低下、命名規約破り
- **任意 (nice to have)**: スタイル、コメント追加、より良い書き方の提案

## このスキルを呼ばないケース

- 機械検査 (`/quality-check`) が落ちている時 — まずそちらを直す
- 1〜2 行の typo 修正 — レビュー不要
- ドキュメント・コメントだけの変更 — レビュー不要
- 計画外の大規模リファクタ中 — 区切りがついてから

## 補足: 機械化候補

このスキルで「定型的に出てくる指摘」は、`tests/architecture/dependencies.test.ts` や biome rule、linter に組み込むべき。LLM の inferential 判断は最後の砦であって、機械でできることは機械でやる。
