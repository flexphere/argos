import type { ExtractionResult } from "../../../src/schema/extraction"

/**
 * フィクスチャ: 新アプリのデプロイ先選定。3 つの選択肢が pairwise に
 * alternative-to で繋がる「明確な排他関係」のケース。
 *
 * 期待される構造:
 *   I1: "デプロイ先として何を採用するか" (root)
 *   C1: Vercel に乗せる
 *   C2: AWS App Runner に乗せる
 *   C3: 既存の K8s クラスタに乗せる
 *
 *   alt-to (pairwise):
 *     C1 ↔ C2
 *     C1 ↔ C3
 *     C2 ↔ C3
 */

const transcript = `
A: 新アプリのデプロイ先として何を採用するか相談したい。
B: Vercel に乗せるのが最速だと思う。開発体験が良いし Next.js とも相性がいい。
C: でも AWS App Runner なら他の AWS リソースとの連携が楽じゃない?
B: それはあるね。ただ Vercel の方が運用負荷が低い。
A: 一方で既存の K8s クラスタはどう? 既存インフラを活用できるしコストも抑えられる。
B: 確かにコストは魅力的だけど、運用工数が増える。
C: 結局どれか 1 つに決めるしかない。同時運用は無理。
A: では Vercel か App Runner か K8s の 3 択で、それぞれの観点を比較しよう。
`.trim()

const extraction: ExtractionResult = {
  issues: [
    {
      ref: "i-1",
      text: "新アプリのデプロイ先として何を採用すべきか",
    },
  ],
  claims: [
    {
      ref: "c-vercel",
      text: "Vercel に乗せる",
      addresses: "i-1",
    },
    {
      ref: "c-apprunner",
      text: "AWS App Runner に乗せる",
      addresses: "i-1",
    },
    {
      ref: "c-k8s",
      text: "既存の K8s クラスタに乗せる",
      addresses: "i-1",
    },
  ],
  arguments: [
    {
      ref: "a-vercel-1",
      kind: "pro",
      data: "開発体験が良く、Next.js との相性が高い",
      targets: "c-vercel",
    },
    {
      ref: "a-vercel-2",
      kind: "pro",
      data: "運用負荷が低い (フルマネージド)",
      targets: "c-vercel",
    },
    {
      ref: "a-apprunner-1",
      kind: "pro",
      data: "他の AWS リソースとの連携が楽",
      targets: "c-apprunner",
    },
    {
      ref: "a-k8s-1",
      kind: "pro",
      data: "既存インフラを活用でき、コスト面で有利",
      targets: "c-k8s",
    },
    {
      ref: "a-k8s-2",
      kind: "con",
      data: "運用工数が増える",
      targets: "c-k8s",
    },
  ],
  claim_relations: [
    { ref_a: "c-vercel", ref_b: "c-apprunner" },
    { ref_a: "c-vercel", ref_b: "c-k8s" },
    { ref_a: "c-apprunner", ref_b: "c-k8s" },
  ],
}

const expectations = {
  minIssues: 1,
  maxIssues: 1,
  minClaims: 3,
  maxClaims: 3,
  minArguments: 5,
  maxArguments: 5,
  minSubIssueOfEdges: 0, // 階層は無い
  minAltToEdges: 3, // pairwise = 3
}

export default { transcript, extraction, expectations }
