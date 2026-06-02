# 分析指示 (semantic analysis)

このドキュメントは、argos skill の **分析ステップ** (任意) で agent が従う指示と JSON スキーマを self-contained に記述したもの。
SKILL.md の Step 7 から参照される。

## 前提

直前ステップで作成された **ExtractionResult JSON** (`out/extraction-<page_id>.raw.json`) を入力に取り、以下の 2 タスクを実行する。Issue / Claim / Argument の参照は **ref** ベース（`"issue-1"` のような人間可読 ID）で行う。

## タスク 1: 論点ズレ検出 (drift)

ExtractionResult の各 Claim について、`addresses` で指している Issue に対する **関連度 (relevance) を 0〜1 で評価**する。

- 関連度 **0.5 未満** (=議題からズレている) と判断したペアだけを `driftFindings` に含める
- 0.5 以上のものは含めない
- `addresses` が `null` の Claim は対象外（紐づき先がないので評価不能）

判定の観点:
- Claim の主題が Issue の問いに直接答えているか
- 話題が広がりすぎて Issue から逸れていないか
- 「結論」「決まり事」のように Issue とは別軸の発話は drift と判定して良い

## タスク 2: Argument 接続先見直し (misplacement)

各 Argument について、現在の `targets` Claim より候補 Claim の方が **より自然に pro/con できる** ものがあるか判定する。

### 候補 Claim の定義（候補集合）

ある Argument `A` (target = Claim `C`) について、候補 Claim 集合は次のいずれか:

1. **Sibling**: `C` と同じ Issue を addressing する他の Claim
2. **Alternative**: `C` と `claim_relations` で繋がっている Claim

候補集合が空の Argument は判定対象外。

### 判定基準（厳密に）

- Argument の `data` の内容が、現 target Claim を supports/attacks するより、候補 Claim を supports/attacks する方が **論理的に自然に成立する** 場合のみ `misplacementFindings` に含める
- 候補に対する pro/con (supports/attacks) を `candidateKind` で指定:
  - data が候補を支持しているなら `"supports"`
  - data が候補を反論しているなら `"attacks"`
- 自信が低い場合は含めない（過剰指摘より無印を優先）
- 現状の接続が違和感無い場合は何も出力しない

## 注意

- 推測でデータを増やさない（与えられた ref・テキスト以外は使わない）
- 該当する項目が無ければそれぞれの配列は空 `[]` のままで OK
- ref は ExtractionResult 内の値をそのまま使う（UUID への変換はブラウザ側で行われる）

## 出力スキーマ

```jsonc
{
  "driftFindings": [
    {
      "claimRef": "claim-1",       // ExtractionResult.claims[].ref
      "issueRef": "issue-1",       // ExtractionResult.issues[].ref
      "relevance": 0.3,            // 0..1
      "reason": "なぜそう判断したか 1〜2 文で"
    }
  ],
  "misplacementFindings": [
    {
      "argumentRef": "arg-1",      // ExtractionResult.arguments[].ref
      "candidateClaimRef": "claim-2",
      "candidateKind": "supports", // "supports" | "attacks"
      "reason": "なぜ候補の方が自然か 1〜2 文で"
    }
  ]
}
```

## 出力方法

意味分析結果の JSON を **`out/semantic-<page_id>.raw.json`** に書き出す（`Write` ツール使用）。
インデント 2、UTF-8。

save スクリプトが zod 検証 + ExtractionResult と結合して `extractions/<page_id>.json` に保存する。

## 自己チェック (出力前に確認)

- [ ] `driftFindings` の `claimRef` / `issueRef` の組が ExtractionResult 内に存在するか
- [ ] `driftFindings` の `relevance` がすべて 0.5 未満か
- [ ] `misplacementFindings` の `argumentRef` / `candidateClaimRef` が ExtractionResult 内に存在するか
- [ ] `misplacementFindings` の各候補が、対象 Argument の候補集合 (sibling または alternative) に含まれているか
- [ ] `candidateKind` が `"supports"` か `"attacks"` のどちらか
