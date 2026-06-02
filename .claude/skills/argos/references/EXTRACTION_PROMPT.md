# 議事録 → ExtractionResult JSON 抽出指示

このドキュメントは、argos skill の **抽出ステップ** で agent が従う指示と JSON スキーマを self-contained に記述したもの。
SKILL.md の Step 6 から参照される。

## あなたの役割

議事録テキストを読んで、議論の構造を抽出する議論可視化アシスタント。

## 抽出する要素

### 必須 3 種

1. **Issue（議題）**: 解決すべき問い（例: "新ツールを採用すべきか？"）
2. **Claim（主張）**: Issue に対する立場・命題（例: "採用すべき" / "段階的に試行すべき"）
3. **Argument（論証）**: Claim を支持(pro)または反論(con)する根拠

各要素には一意な `ref` を付与する（例: `"issue-1"`, `"claim-1"`, `"arg-1"`）。

- Claim は `addresses` で関連する Issue の ref を指定（無ければ `null`）
- Argument は `targets` で支持/反論する Claim の ref を**必ず**指定

### 任意 (確信がなければ省略)

- **Criterion（評価軸）**: 議論で明示的に使われた評価観点
- **Reference（参照）**: 議論内で事実主張 / 外部参照として持ち出されたもの

## 詳細ルール

### Issue 間の親子関係 (`parent_ref`)

Issue 同士に **論理的従属関係** がある場合、子 Issue に `parent_ref` で親 Issue の ref を指定する。

**親子化する条件 (厳密)**: 親 Issue の結論が出なければ子 Issue が無意味になる関係のときだけ。

良い例:
- "Pub/Sub を採用すべきか" — 親
- "プル型/プッシュ型どちらを使うか" (`parent_ref`: 上の Issue)
  → Pub/Sub を採用しない場合、この子 Issue 自体が無意味になる
- "プッシュ型移行はいつ着手するか" (`parent_ref`: 上の Issue)
  → プル/プッシュの決着がついていなければ議論できない

親子化しない例（並列扱い）:
- 単に話題が時系列で続いただけ ("次にこの話を…")
- テーマが近いが、結論が独立して出せるもの
- 同じ会議で別個に話された複数の独立した議題

制約: 1 つの Issue に親は 1 つだけ。循環参照禁止。確信が持てない場合は `parent_ref` を省略する（過剰な親子化より、フラットでも正しい方を優先）。

### Claim 間の排他関係 (`claim_relations`)

同じ Issue を addressing する複数 Claim 間で、**両立不可能 (どちらか一方しか採用できない)** と明らかに読み取れる場合のみ `claim_relations` 配列に追加する。

良い例:
- I "移行はいつ着手すべきか" の下に、C_a "システム X 移行後にやる" / C_b "システム Y から先に着手" — 着手順を選ぶので排他
- I "新ライブラリ採用?" の下に、C_x "A を採用" / C_y "B を採用" — 同時採用しないなら排他

排他にしない例:
- 時間軸が違う Claim ("今回は X、ゆくゆくは Y") は両立する
- 異なる Issue を addressing している Claim 同士は無関係
- 「補完的に両方やる」と読める Claim 同士は両立
- 確信が持てない場合 (過剰指定より無印を優先)

形式:
```json
"claim_relations": [{ "ref_a": "claim-3", "ref_b": "claim-4" }]
```

`ref_a` / `ref_b` の順序は問わない (内部で正規化される)。同じペアを 2 回入れない。

### 評価軸 (Criterion)

議論内で **評価軸** として明示的に使われた概念のみを `criteria` 配列に抽出する。Argument が依拠する Criterion は `evaluates_by` (ref 配列) で指定。

良い例:
- 「コスト面ではどうか」「保守性が高い方がいい」「納期に影響しないか」「将来性で見ると」
- これらに紐づく Pro/Con 論証は `"evaluates_by": ["criterion-..."]` で繋ぐ

抽出しない例:
- 単に話題に出ただけ・一度きりの感想
- 同義語の言い換え (同じ評価軸は 1 つにまとめる)

### 参照 (Reference)

議論内で **事実主張 / 外部参照** として持ち出されたものを `references` 配列に抽出する。Argument が引用する Reference は `cites` (ref 配列) で指定。

良い例:
- 「他のプロダクトは全てプッシュ型らしい」「既存システムでは Pub/Sub 経由でやってる」「あの記事に書いてあった」
- これらを根拠にする論証は `"cites": ["reference-..."]` で繋ぐ

抽出しない例:
- 個人の経験談・推測 (= 検証可能な外部情報ではない)
- 主観的な評価 ("良いと思う" 等)

確信が持てない場合は省略する (過剰抽出より無印を優先)。

### 全体方針

- 議事録に書かれた内容のみを抽出 (推測で作らない)
- 1 つの発言に複数の Claim や Argument が含まれる場合は分割する
- 同じ意味の主張は 1 つにまとめる
- 関連性が薄い雑談は除外

## 出力スキーマ

トップレベルは以下の形の JSON オブジェクト:

```jsonc
{
  "issues": [
    { "ref": "issue-1", "text": "..." },
    { "ref": "issue-2", "text": "...", "parent_ref": "issue-1" }
  ],
  "claims": [
    { "ref": "claim-1", "text": "...", "addresses": "issue-1" }
  ],
  "arguments": [
    {
      "ref": "arg-1",
      "kind": "pro",                       // "pro" | "con"
      "data": "...",                       // 根拠の本文（文字列）
      "targets": "claim-1",                // 必須
      "evaluates_by": ["criterion-1"],     // 任意
      "cites": ["reference-1"]             // 任意
    }
  ],
  "claim_relations": [                     // 任意（無ければ省略）
    { "ref_a": "claim-3", "ref_b": "claim-4" }
  ],
  "criteria": [                            // 任意
    { "ref": "criterion-1", "text": "コスト", "weight": "strong" }
                                           // weight: "strong" | "moderate" | "weak"（任意）
  ],
  "references": [                          // 任意
    {
      "ref": "reference-1",
      "title": "他社事例",
      "uri": "https://...",                // 任意
      "excerpt": "..."                     // 任意
    }
  ]
}
```

省略可能なフィールド（任意）: `parent_ref`, `claim_relations`, `criteria`, `references`, `evaluates_by`, `cites`, Criterion の `weight`, Reference の `uri` / `excerpt`。

## 出力方法

抽出結果の JSON を **`out/extraction-<page_id>.raw.json`** に書き出す（`Write` ツール使用）。
インデント 2、UTF-8。

書き出し後、save スクリプト (SKILL.md 後続ステップ) が zod 検証 + 保存する。検証エラーが出たら指摘箇所を修正して再出力する。

## 自己チェック (出力前に確認)

- [ ] すべての `ref` が一意か
- [ ] すべての Claim の `addresses` が、存在する Issue の ref（または `null`）か
- [ ] すべての Argument の `targets` が、存在する Claim の ref か
- [ ] `claim_relations` の `ref_a` / `ref_b` が、同じ Issue を addressing する Claim 同士か
- [ ] `evaluates_by` / `cites` の各 ref が、`criteria` / `references` 配列内に存在するか
- [ ] Issue の `parent_ref` に循環がないか
