import type { FormEvent } from "react"
import { STRINGS } from "@/lib/strings"
import styles from "./LoginScreen.module.css"

interface LoginScreenProps {
  email: string
  password: string
  error: string
  isLoggingIn: boolean
  onEmailChange: (value: string) => void
  onPasswordChange: (value: string) => void
  onSubmit: (e: FormEvent) => void
}

export default function LoginScreen({
  email,
  password,
  error,
  isLoggingIn,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: LoginScreenProps) {
  const t = STRINGS.login

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

          <form onSubmit={onSubmit}>
            <label className={styles.label} htmlFor="login-email">
              {t.emailLabel}
            </label>
            <input
              id="login-email"
              type="text"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
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
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder={t.passwordPlaceholder}
              className={styles.passwordInput}
            />

            {error && <div className={styles.error}>{error}</div>}

            <button type="submit" className={styles.submit}>
              {isLoggingIn ? (
                <>
                  <span className={styles.spinner} />
                  <span>{t.signingIn}</span>
                </>
              ) : (
                <span>{t.submit}</span>
              )}
            </button>
          </form>

          <div className={styles.demoTip}>{t.demoTip}</div>
        </div>
      </div>
    </div>
  )
}
