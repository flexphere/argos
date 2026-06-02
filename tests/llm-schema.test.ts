import { describe, expect, it } from "vitest"
import { extractionResultSchema } from "../src/schema/extraction"

describe("extractionResultSchema", () => {
  it("accepts a valid extraction", () => {
    const result = extractionResultSchema.safeParse({
      issues: [{ ref: "i-1", text: "I" }],
      claims: [{ ref: "c-1", text: "C", addresses: "i-1" }],
      arguments: [
        {
          ref: "a-1",
          kind: "pro",
          data: "d",
          targets: "c-1",
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects argument with invalid kind", () => {
    const result = extractionResultSchema.safeParse({
      issues: [],
      claims: [{ ref: "c-1", text: "C", addresses: null }],
      arguments: [
        {
          ref: "a-1",
          kind: "neutral", // 不正
          data: "d",
          targets: "c-1",
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("requires targets for arguments", () => {
    const result = extractionResultSchema.safeParse({
      issues: [],
      claims: [],
      arguments: [{ ref: "a-1", kind: "pro", data: "d" }],
    })
    expect(result.success).toBe(false)
  })
})
