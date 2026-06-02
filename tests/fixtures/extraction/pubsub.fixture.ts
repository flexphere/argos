import type { ExtractionResult } from "../../../src/schema/extraction"

/**
 * フィクスチャ: Pub/Sub 採用に関する設計議論。
 * - 多段階層 (sub-issue-of) を含む現実的なケース
 * - サンプル議事録（架空のチーム議論）
 *
 * 期待される構造:
 *   I1: Pub/Sub vs Cron 採用                             (root)
 *    └─ I2: プル型 vs プッシュ型                          (sub-issue-of I1)
 *        └─ I3: 移行の着手箇所                            (sub-issue-of I2)
 *   I4: ローカルテスト方針                                (independent root)
 */

const transcript = `
A: 今回の機能で Pub/Sub を採用すべきか、Cron ジョブ 1 本で完結させるべきか相談したい。
B: 納期がタイトなので、まずは Cron 1 本でシンプルに実装したい。後から Pub/Sub に移行するのも極端に大変ではない。
A: 確かに Pub/Sub を入れるとインフラが複雑になるね。障害点も増える。
C: でも長期的に見ると Pub/Sub にしたほうが良いと思う。既存システムでは他の外部サービス連携も大抵 Pub/Sub 経由しているので、一貫性が取れる。
A: では今回は Cron で、ゆくゆくは Pub/Sub 化を視野に入れる、という方針で。
B: 採用するとしたらプル型とプッシュ型のどちらにすべきか。
C: プッシュ型に寄せたほうが良い。プル型は誰がプルしたか把握しづらく、ログの所在も追いにくい。
A: それと、プル型は誤って prod に向けると本番メッセージをローカルで消費する事故が起こりうる。
B: なるほど。では将来はプッシュ型で。
A: 移行はいつ・どこから着手すべき?
C: 外部サービス Aの Pub/Sub をプッシュ型化するところから着手するのが良い。外部サービスは障害時にどうしようもないため、リカバリーしやすい Pub/Sub 経由にしておく価値が大きい。
B: ローカル動作確認はどうする?
A: ユニット/統合テストで書き、動作確認は GKE デプロイかエミュレーターで行う方針で。
`.trim()

const extraction: ExtractionResult = {
  issues: [
    {
      ref: "i-1",
      text: "Pub/Sub を採用すべきか、Cron ジョブ 1 本で完結させるべきか",
    },
    {
      ref: "i-2",
      text: "Pub/Sub はプル型とプッシュ型のどちらを使うべきか",
      parent_ref: "i-1",
    },
    {
      ref: "i-3",
      text: "プッシュ型への移行はいつ・どこから着手すべきか",
      parent_ref: "i-2",
    },
    {
      ref: "i-4",
      text: "Pub/Sub を使う場合のローカル動作確認・テストはどうするか",
    },
  ],
  claims: [
    {
      ref: "c-1-cron",
      text: "今回はシンプルに Cron ジョブ 1 本で完結させる",
      addresses: "i-1",
    },
    {
      ref: "c-1-future",
      text: "ゆくゆくは Pub/Sub 化しておくのが望ましい",
      addresses: "i-1",
    },
    {
      ref: "c-2-push",
      text: "Pub/Sub はプッシュ型に寄せて移行していくべき",
      addresses: "i-2",
    },
    {
      ref: "c-3-systema",
      text: "外部サービス Aの Pub/Sub をプッシュ型化するところから着手する",
      addresses: "i-3",
    },
    {
      ref: "c-4-test",
      text: "ローカルではユニット/統合テスト、動作確認は GKE/エミュレーターで",
      addresses: "i-4",
    },
  ],
  arguments: [
    {
      ref: "a-cron-1",
      kind: "pro",
      data: "Pub/Sub を入れるとインフラが複雑になり、障害点が増える",
      targets: "c-1-cron",
    },
    {
      ref: "a-cron-2",
      kind: "pro",
      data: "後から Pub/Sub に移行するのも極端に大変ではない",
      targets: "c-1-cron",
    },
    {
      ref: "a-future-1",
      kind: "pro",
      data: "既存システムでは他の外部サービス連携も大抵 Pub/Sub 経由しており、一貫性の観点で揃えたい",
      targets: "c-1-future",
    },
    {
      ref: "a-push-1",
      kind: "pro",
      data: "プル型は誰がプルしたか把握しづらく、ログの所在も追いにくい",
      targets: "c-2-push",
    },
    {
      ref: "a-push-2",
      kind: "pro",
      data: "プル型はローカルから誤って prod に向けると本番メッセージをローカルで消費する事故が起こり得る",
      targets: "c-2-push",
    },
    {
      ref: "a-systema-1",
      kind: "pro",
      data: "外部サービスは障害時にどうしようもないため、リカバリーしやすい Pub/Sub 経由にしておく価値が大きい",
      targets: "c-3-systema",
    },
  ],
}

const expectations = {
  minIssues: 4,
  maxIssues: 4,
  minClaims: 5,
  maxClaims: 5,
  minArguments: 6,
  maxArguments: 6,
  minSubIssueOfEdges: 2, // i-2→i-1, i-3→i-2
  minAltToEdges: 0, // この fixture には claim_relations 無し
}

export default { transcript, extraction, expectations }
