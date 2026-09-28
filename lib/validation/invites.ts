import { z } from "zod"
import { STRINGS } from "@/lib/strings"

export const MIN_CODES = 1
export const MAX_CODES = 50

const t = STRINGS.admin.codes

export const GenerateCodesSchema = z.object({
  count: z
    .number(t.quantityNotInteger)
    .int(t.quantityNotInteger)
    .min(MIN_CODES, t.quantityTooLow)
    .max(MAX_CODES, t.quantityTooHigh),
})

export type QuantityCheck =
  { valid: true; count: number } | { valid: false; hint: string }

/** Turns the raw text of the quantity field into a count or a hint. */
export function checkQuantityInput(raw: string): QuantityCheck {
  const text = raw.trim()
  if (text === "") return { valid: false, hint: t.quantityRequired }
  if (!/^[+-]?\d+(\.\d+)?$/.test(text)) {
    return { valid: false, hint: t.quantityNotInteger }
  }
  const n = Number(text)
  if (!Number.isInteger(n)) return { valid: false, hint: t.quantityNotInteger }
  if (n < MIN_CODES) return { valid: false, hint: t.quantityTooLow }
  if (n > MAX_CODES) return { valid: false, hint: t.quantityTooHigh }
  return { valid: true, count: n }
}

export const REVOKE_ID_MAX_LENGTH = 100

export const RevokeCodeSchema = z.object({
  id: z.string().min(1).max(REVOKE_ID_MAX_LENGTH),
})
