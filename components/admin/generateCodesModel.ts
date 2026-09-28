import { STRINGS } from "@/lib/strings"
import type {
  GenerateInviteCodesResult,
  RevokeInviteCodeResult,
} from "@/lib/actions/invites"

const t = STRINGS.admin.codes

type ActionError = Extract<GenerateInviteCodesResult, { ok: false }>["error"]

/** es-PE message shown inside the modal for a failed generation. */
export function generationErrorMessage(error: ActionError): string {
  if (error === "UNAUTHENTICATED") return t.errorUnauthenticated
  if (error === "FORBIDDEN") return t.errorForbidden
  return t.errorGeneric
}

type RevokeError = Extract<RevokeInviteCodeResult, { ok: false }>["error"]

/** es-PE message shown next to a row when a revoke fails. */
export function revokeErrorMessage(error: RevokeError): string {
  if (error === "UNAUTHENTICATED") return t.revokeErrorUnauthenticated
  if (error === "FORBIDDEN") return t.revokeErrorForbidden
  if (error === "NOT_FOUND") return t.revokeErrorNotFound
  if (error === "NOT_REVOKABLE") return t.revokeErrorNotRevokable
  return t.revokeErrorGeneric
}

/** Clipboard payload for "copy all": one code per line. */
export function joinCodes(codes: readonly string[]): string {
  return codes.join("\n")
}

export type CopyOutcome = "ok" | "failed"

/** Writes to the clipboard; never claims success when it was not written. */
export async function copyToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<CopyOutcome> {
  if (!clipboard || typeof clipboard.writeText !== "function") return "failed"
  try {
    await clipboard.writeText(text)
    return "ok"
  } catch {
    return "failed"
  }
}
