"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { revokeInviteCode } from "@/lib/actions/invites"
import { STRINGS } from "@/lib/strings"
import { revokeErrorMessage } from "./generateCodesModel"
import styles from "./RevokeCodeButton.module.css"

const t = STRINGS.admin.codes

export default function RevokeCodeButton({ id }: { id: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function run() {
    setPending(true)
    setError("")
    try {
      const result = await revokeInviteCode({ id })
      if (!result.ok) setError(revokeErrorMessage(result.error))
      setConfirming(false)
      // Also on failure: the row may have changed under us (e.g. it was used).
      router.refresh()
    } catch {
      setError(t.revokeErrorGeneric)
      setConfirming(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={styles.wrap}>
      {confirming ? (
        <>
          <p className={styles.prompt}>{t.revokeConfirmPrompt}</p>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.danger}
              onClick={run}
              disabled={pending}
            >
              {pending ? t.revoking : t.revokeConfirm}
            </button>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              {t.revokeCancel}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            setError("")
            setConfirming(true)
          }}
        >
          {t.revoke}
        </button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
