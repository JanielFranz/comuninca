"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, type FormEvent } from "react"
import Modal, { ModalCloseButton } from "@/components/Modal"
import Toast from "@/components/Toast"
import { generateInviteCodes, type GeneratedCode } from "@/lib/actions/invites"
import { STRINGS } from "@/lib/strings"
import { checkQuantityInput } from "@/lib/validation/invites"
import {
  copyToClipboard,
  generationErrorMessage,
  joinCodes,
} from "./generateCodesModel"
import styles from "./GenerateCodesModal.module.css"

const t = STRINGS.admin.codes
const TOAST_MS = 2600

export default function GenerateCodesModal() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [codes, setCodes] = useState<GeneratedCode[] | null>(null)
  const [toast, setToast] = useState("")
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const check = checkQuantityInput(raw)
  const showHint = raw !== ""
  const canSubmit = check.valid && !pending

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  useEffect(() => {
    if (open && codes === null) inputRef.current?.focus()
  }, [open, codes])

  function showToast(message: string) {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), TOAST_MS)
  }

  function openModal() {
    setRaw("")
    setError("")
    setCodes(null)
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    setRaw("")
    setError("")
    setCodes(null)
    setPending(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!check.valid || pending) return
    setPending(true)
    setError("")
    try {
      const result = await generateInviteCodes({ count: check.count })
      if (result.ok) {
        setCodes(result.codes)
        // Refresh the server-rendered list underneath; the modal stays open.
        router.refresh()
      } else setError(generationErrorMessage(result.error))
    } catch {
      setError(t.errorGeneric)
    } finally {
      setPending(false)
    }
  }

  async function handleCopy(text: string, successMessage: string) {
    const outcome = await copyToClipboard(
      text,
      typeof navigator === "undefined" ? undefined : navigator.clipboard,
    )
    showToast(outcome === "ok" ? successMessage : t.copyFailed)
  }

  const hintIsError = showHint && !check.valid

  return (
    <>
      <button type="button" className={styles.trigger} onClick={openModal}>
        {t.generateButton}
      </button>

      {open && (
        <Modal
          onClose={closeModal}
          maxWidth={480}
          maxHeight="88vh"
          zIndex={100}
          closeLabel={t.close}
        >
          <div className={styles.headerRow}>
            <div className={styles.title}>
              {codes ? t.resultsTitle : t.modalTitle}
            </div>
            <ModalCloseButton onClick={closeModal} label={t.close} />
          </div>

          {codes === null ? (
            <form onSubmit={handleSubmit} noValidate>
              <label className={styles.label} htmlFor="codes-quantity">
                {t.quantityLabel}
              </label>
              <input
                id="codes-quantity"
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                aria-invalid={hintIsError}
                aria-describedby="codes-quantity-hint"
                className={styles.input}
              />
              <p
                id="codes-quantity-hint"
                className={hintIsError ? styles.hintError : styles.hint}
              >
                {!check.valid && showHint ? check.hint : t.quantityHint}
              </p>
              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={closeModal}
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className={styles.primary}
                  disabled={!canSubmit}
                >
                  {pending ? t.generating : t.confirm}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className={styles.description}>
                {t.resultsDescription(codes.length)}
              </p>
              <ul className={styles.list}>
                {codes.map((c) => (
                  <li key={c.code} className={styles.row}>
                    <code className={styles.code}>{c.code}</code>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={() => handleCopy(c.code, t.copiedOne)}
                    >
                      {t.copyOne}
                    </button>
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={closeModal}
                >
                  {t.close}
                </button>
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() =>
                    handleCopy(joinCodes(codes.map((c) => c.code)), t.copiedAll)
                  }
                >
                  {t.copyAll}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {toast && <Toast message={toast} />}
    </>
  )
}
