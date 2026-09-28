"use client"

import { useState, useTransition } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { signIn } from "@/lib/actions/auth"
import { STRINGS } from "@/lib/strings"
import styles from "./LoginScreen.module.css"

export default function LoginScreen() {
  const t = STRINGS.login
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError(t.missingFieldsError)
      return
    }
    setError("")
    startTransition(async () => {
      const result = await signIn({ email, password })
      if (result.ok) {
        router.push(result.redirectTo)
        router.refresh()
        return
      }
      setError(
        result.error === "INVALID_CREDENTIALS"
          ? t.invalidCredentialsError
          : result.error === "INVALID_INPUT"
            ? t.missingFieldsError
            : t.unexpectedError,
      )
    })
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.brandRow}>
          <div className={styles.brandMark}>C</div>
          <div className={styles.brandName}>{STRINGS.meta.title}</div>
        </div>

        <div className={styles.card}>
          <div className={styles.title}>{t.welcome}</div>
          <div className={styles.subtitle}>{t.subtitle}</div>

          <form onSubmit={onSubmit} noValidate>
            <label className={styles.label} htmlFor="login-email">
              {t.emailLabel}
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError("")
              }}
              placeholder={t.emailPlaceholder}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="login-password">
              {t.passwordLabel}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              placeholder={t.passwordPlaceholder}
              className={styles.passwordInput}
            />

            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}

            <button
              type="submit"
              className={styles.submit}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <span className={styles.spinner} />
                  <span>{t.signingIn}</span>
                </>
              ) : (
                <span>{t.submit}</span>
              )}
            </button>
          </form>

          <Link href="/register" className={styles.footerLink}>
            {t.registerLink}
          </Link>
        </div>
      </div>
    </div>
  )
}
