import { randomBytes } from "node:crypto"

/** Crockford base32: no I, L, O, U. Exactly 32 symbols (5 bits each). */
export const INVITE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
/** 26 symbols x 5 bits = 130 bits of entropy (>= 128, US 4.1.4). */
export const INVITE_CODE_LENGTH = 26
export const INVITE_GROUP_SIZE = 5

export type RandomSource = (size: number) => Uint8Array

const defaultSource: RandomSource = (size) => randomBytes(size)

/**
 * One invite code, e.g. `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X`.
 * `byte & 31` maps a uniform byte onto 32 symbols without modulo bias.
 */
export function generateInviteCode(
  random: RandomSource = defaultSource,
): string {
  const bytes = random(INVITE_CODE_LENGTH)
  let out = ""
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    if (i > 0 && i % INVITE_GROUP_SIZE === 0) out += "-"
    out += INVITE_ALPHABET[bytes[i] & 31]
  }
  return out
}

/** Exactly `count` distinct codes (de-duplicated in memory). */
export function generateUniqueInviteCodes(
  count: number,
  random: RandomSource = defaultSource,
): string[] {
  const codes = new Set<string>()
  while (codes.size < count) codes.add(generateInviteCode(random))
  return [...codes]
}
