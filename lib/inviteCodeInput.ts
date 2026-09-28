import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_GROUP_SIZE,
} from "@/lib/inviteCode"

/**
 * NOTE: `@/lib/inviteCode` imports node:crypto for its generator, so this
 * helper must only be imported from server code (Server Actions, tests).
 */

const ALPHABET_SET = new Set(INVITE_ALPHABET)

/**
 * Turns whatever a person typed or pasted into the lookup candidates for an
 * invite code, in the order they should be tried:
 * 1. the trimmed, uppercased input as-is (so short codes like `SEED-0001` work);
 * 2. when the input has the shape of a generated code (26 Crockford symbols,
 *    hyphens/spaces optional), the canonical grouped form. Per the Crockford
 *    rules, I and L read as 1 and O reads as 0.
 * Returns an empty list for blank input.
 */
export function inviteCodeCandidates(raw: string): string[] {
  const exact = raw.trim().toUpperCase()
  if (exact === "") return []

  const compact = exact
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")

  const candidates = [exact]
  if (
    compact.length === INVITE_CODE_LENGTH &&
    [...compact].every((c) => ALPHABET_SET.has(c))
  ) {
    const grouped = compact
      .match(new RegExp(`.{1,${INVITE_GROUP_SIZE}}`, "g"))!
      .join("-")
    if (grouped !== exact) candidates.push(grouped)
  }
  return candidates
}
