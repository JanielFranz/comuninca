import { describe, expect, it } from "vitest"
import { inviteCodeCandidates } from "@/lib/inviteCodeInput"

const CANON = "ABCDE-FGHJK-MNPQR-STVWX-YZ012-3"
const BARE = CANON.replaceAll("-", "")

describe("inviteCodeCandidates", () => {
  it("keeps a canonical code as the single candidate", () => {
    expect(inviteCodeCandidates(CANON)).toEqual([CANON])
  })

  it("uppercases and trims, and tries the exact form first (SEED-0001)", () => {
    expect(inviteCodeCandidates("  seed-0001 ")).toEqual(["SEED-0001"])
  })

  it("regroups missing hyphens", () => {
    expect(inviteCodeCandidates(BARE.toLowerCase())).toEqual([BARE, CANON])
  })

  it("tolerates extra spaces and hyphens", () => {
    expect(inviteCodeCandidates(" abcde  fghjk--mnpqr stvwx yz012 3 ")).toEqual(
      ["ABCDE  FGHJK--MNPQR STVWX YZ012 3", CANON],
    )
  })

  it("maps I and L to 1 and O to 0", () => {
    const typo = "ABCDE-FGHJK-MNPQR-STVWX-YZOI2-L"
    expect(inviteCodeCandidates(typo)).toEqual([
      typo,
      "ABCDE-FGHJK-MNPQR-STVWX-YZ012-1",
    ])
  })

  it("does not regroup the wrong length or invalid symbols", () => {
    expect(inviteCodeCandidates("ABCDE-FGHJK")).toEqual(["ABCDE-FGHJK"])
    expect(inviteCodeCandidates("U".repeat(26))).toEqual(["U".repeat(26)])
    expect(inviteCodeCandidates("!!!")).toEqual(["!!!"])
  })

  it("returns nothing for blank input", () => {
    expect(inviteCodeCandidates("")).toEqual([])
    expect(inviteCodeCandidates("   ")).toEqual([])
  })
})
