"use client"

import { useState, useTransition } from "react"
import type { FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { register } from "@/lib/actions/auth"
import { BIRTHDAY_MIN, checkRegisterInput } from "@/lib/validation/auth"
import type { RegisterField } from "@/lib/validation/auth"
import { STRINGS } from "@/lib/strings"
import styles from "./LoginScreen.module.css"

const FIELD_ORDER: RegisterField[] = [
  "fullName",
  "birthday",
  "email",
  "password",
]

export default function RegisterScreen() {
  const t = STRINGS.register
  const router = useRouter()
  const [fullName, setFullName] = useState("")
  const [birthday, setBirthday] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const checked = checkRegisterInput({
      fullName,
      birthday,
      email,
      password,
    })
    if (!checked.valid) {
      const first = FIELD_ORDER.find((f) => checked.errors[f])
      setError(first ? checked.errors[first]! : t.invalidInput)
      return
    }
    setError("")
    startTransition(async () => {
      const result = await register(checked.data)
      if (result.ok) {
        router.push(result.redirectTo)
        router.refresh()
        return
      }
      switch (result.error) {
        case "EMAIL_IN_USE":
          setError(t.emailInUse)
          break
        case "INVALID_INPUT":
          setError(t.invalidInput)
          break
        default:
          setError(t.unexpectedError)
      }
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
          <div className={styles.title}>{t.title}</div>
          <div className={styles.subtitle}>{t.subtitle}</div>

          <form onSubmit={onSubmit} noValidate>
            <label className={styles.label} htmlFor="register-name">
              {t.fullNameLabel}
            </label>
            <input
              id="register-name"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setError("")
              }}
              placeholder={t.fullNamePlaceholder}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="register-birthday">
              {t.birthdayLabel}
            </label>
            <input
              id="register-birthday"
              type="date"
              autoComplete="bday"
              min={BIRTHDAY_MIN}
              value={birthday}
              onChange={(e) => {
                setBirthday(e.target.value)
                setError("")
              }}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="register-email">
              {t.emailLabel}
            </label>
            <input
              id="register-email"
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

            <label className={styles.label} htmlFor="register-password">
              {t.passwordLabel}
            </label>
            <input
              id="register-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setError("")
              }}
              placeholder={t.passwordPlaceholder}
              className={styles.input}
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
                  <span>{t.submitting}</span>
                </>
              ) : (
                <span>{t.submit}</span>
              )}
            </button>
          </form>

          <Link href="/login" className={styles.footerLink}>
            {t.backToLogin}
          </Link>
        </div>
      </div>
    </div>
  )
}
