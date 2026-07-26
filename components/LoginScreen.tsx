"use client"

import { type FormEvent, useActionState, useCallback } from "react"
import { STRINGS } from "@/lib/strings"
import styles from "./LoginScreen.module.css"

type LoginState = { error: string } | null

/**
 * Server Action shape for the login form.
 * Matches the signature expected by React 19 `useActionState`.
 */
export type LoginAction = (
  prevState: LoginState,
  formData: FormData,
) => Promise<{ error: string }>

interface LoginScreenProps {
  /** Server Action — when provided, the form runs entirely via Server Action. */
  loginAction?: LoginAction
  /* ── Controlled props (backward-compat with CalendarApp prototype) ── */
  email?: string
  password?: string
  error?: string
  isLoggingIn?: boolean
  onEmailChange?: (value: string) => void
  onPasswordChange?: (value: string) => void
  onSubmit?: (e: FormEvent) => void
}

export default function LoginScreen({
  loginAction,
  email,
  password,
  error: errorProp,
  isLoggingIn,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  const t = STRINGS.login

  // Always call the hook — when no Server Action is provided use a noop
  // that satisfies the type contract without ever being called.
  const noop = useCallback(
    async (_prev: LoginState, _formData: FormData) => ({ error: "" }),
    [],
  )
  const [serverState, formAction, isPending] = useActionState(
    loginAction ?? noop,
    null,
  )

  const isServerActionMode = loginAction !== undefined
  const error = isServerActionMode
    ? (serverState?.error ?? "")
    : (errorProp ?? "")
  const loading = isServerActionMode ? isPending : (isLoggingIn ?? false)

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

          {isServerActionMode ? (
            // ── Server Action mode (app/(auth)/login/page.tsx) ──
            <form action={formAction}>
              <label className={styles.label} htmlFor="login-email">
                {t.emailLabel}
              </label>
              <input
                id="login-email"
                name="email"
                type="text"
                placeholder={t.emailPlaceholder}
                className={styles.input}
                required
              />

              <label className={styles.label} htmlFor="login-password">
                {t.passwordLabel}
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder={t.passwordPlaceholder}
                className={styles.passwordInput}
                required
              />

              {error && <div className={styles.error}>{error}</div>}

              <button
                type="submit"
                className={styles.submit}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    <span>{t.signingIn}</span>
                  </>
                ) : (
                  <span>{t.submit}</span>
                )}
              </button>
            </form>
          ) : (
            // ── Controlled mode (CalendarApp prototype) ──
            <form onSubmit={onSubmit}>
              <label className={styles.label} htmlFor="login-email">
                {t.emailLabel}
              </label>
              <input
                id="login-email"
                type="text"
                value={email}
                onChange={(e) => onEmailChange?.(e.target.value)}
                placeholder={t.emailPlaceholder}
                className={styles.input}
              />

              <label className={styles.label} htmlFor="login-password">
                {t.passwordLabel}
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange?.(e.target.value)}
                placeholder={t.passwordPlaceholder}
                className={styles.passwordInput}
              />

              {error && <div className={styles.error}>{error}</div>}

              <button type="submit" className={styles.submit}>
                {loading ? (
                  <>
                    <span className={styles.spinner} />
                    <span>{t.signingIn}</span>
                  </>
                ) : (
                  <span>{t.submit}</span>
                )}
              </button>
            </form>
          )}

          {!isServerActionMode && (
            <div className={styles.demoTip}>{t.demoTip}</div>
          )}
        </div>
      </div>
    </div>
  )
}
