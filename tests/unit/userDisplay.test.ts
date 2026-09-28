import { describe, expect, it } from "vitest"
import { displayName, initialsFor } from "@/lib/userDisplay"

describe("displayName", () => {
  it("prefers the full name", () => {
    expect(displayName("Ava Torres", "ava@x.test")).toBe("Ava Torres")
  })
  it("falls back to the email when the name is blank", () => {
    expect(displayName("   ", "ava@x.test")).toBe("ava@x.test")
  })
})

describe("initialsFor", () => {
  it("uses the first two words", () => {
    expect(initialsFor("Ava Torres Ruiz")).toBe("AT")
  })
  it("handles a single word", () => {
    expect(initialsFor("marco")).toBe("M")
  })
  it("derives from the local part of an email", () => {
    expect(initialsFor("priya.nair@seed.comuninca.test")).toBe("PN")
    expect(initialsFor("jonas@seed.comuninca.test")).toBe("J")
  })
  it("returns an empty string for empty input", () => {
    expect(initialsFor("")).toBe("")
  })
})
