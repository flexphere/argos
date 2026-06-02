import { describe, expect, it } from "vitest"
import { resolveConnection } from "../src/graph/edgeKind"

const issue = { id: "i1", type: "issue" as const }
const issue2 = { id: "i2", type: "issue" as const }
const claim = { id: "c1", type: "claim" as const }
const claim2 = { id: "c2", type: "claim" as const }
const proArg = { id: "a1", type: "argument" as const, argKind: "pro" as const }
const conArg = { id: "a2", type: "argument" as const, argKind: "con" as const }
const criterion = { id: "cr1", type: "criterion" as const }
const reference = { id: "r1", type: "reference" as const }

describe("resolveConnection", () => {
  it("Claim ↔ Issue: どちら方向でも addresses (claim→issue) になる", () => {
    expect(resolveConnection(claim, issue)).toEqual({
      kind: "addresses",
      from: "c1",
      to: "i1",
    })
    expect(resolveConnection(issue, claim)).toEqual({
      kind: "addresses",
      from: "c1",
      to: "i1",
    })
  })

  it("Argument(pro) ↔ Claim: supports", () => {
    expect(resolveConnection(proArg, claim)).toEqual({
      kind: "supports",
      from: "a1",
      to: "c1",
    })
    expect(resolveConnection(claim, proArg)).toEqual({
      kind: "supports",
      from: "a1",
      to: "c1",
    })
  })

  it("Argument(con) ↔ Claim: attacks", () => {
    expect(resolveConnection(conArg, claim)).toEqual({
      kind: "attacks",
      from: "a2",
      to: "c1",
    })
  })

  it("Issue ↔ Issue: sub-issue-of", () => {
    const r = resolveConnection(issue, issue2)
    expect(r?.kind).toBe("sub-issue-of")
  })

  it("Criterion ↔ Claim: evaluates-by（Claim が from, Criterion が to）", () => {
    expect(resolveConnection(criterion, claim)).toEqual({
      kind: "evaluates-by",
      from: "c1",
      to: "cr1",
    })
  })

  it("Reference ↔ 何か: cites（ref が常に to）", () => {
    expect(resolveConnection(reference, issue)?.kind).toBe("cites")
    expect(resolveConnection(reference, claim)?.kind).toBe("cites")
    expect(resolveConnection(reference, proArg)?.kind).toBe("cites")
    expect(resolveConnection(reference, criterion)?.kind).toBe("cites")
    expect(resolveConnection(claim, reference)).toEqual({
      kind: "cites",
      from: "c1",
      to: "r1",
    })
  })

  it("禁止ペアは null を返す", () => {
    // Claim 同士
    expect(resolveConnection(claim, claim2)).toBeNull()
    // Argument 同士
    expect(resolveConnection(proArg, conArg)).toBeNull()
    // Issue ↔ Argument
    expect(resolveConnection(issue, proArg)).toBeNull()
    // Issue ↔ Criterion
    expect(resolveConnection(issue, criterion)).toBeNull()
    // Argument ↔ Criterion
    expect(resolveConnection(proArg, criterion)).toBeNull()
    // Reference 同士
    const r2 = { id: "r2", type: "reference" as const }
    expect(resolveConnection(reference, r2)).toBeNull()
  })

  it("同一ノードへの接続は null", () => {
    expect(resolveConnection(claim, { ...claim })).toBeNull()
  })
})
