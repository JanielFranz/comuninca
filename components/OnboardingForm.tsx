"use client"

import { useState, useTransition } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import LogoutButton from "@/components/LogoutButton"
import { completeOnboarding } from "@/lib/actions/onboarding"
import { checkOnboardingInput } from "@/lib/validation/onboarding"
import type { OnboardingField } from "@/lib/validation/onboarding"
import { STRINGS } from "@/lib/strings"
import styles from "./LoginScreen.module.css"
import onboardingStyles from "./OnboardingForm.module.css"

const FIELD_ORDER: OnboardingField[] = ["occupation", "profession", "ikigai"]

export default function OnboardingForm() {
  const t = STRINGS.onboarding
  const router = useRouter()
  const [profession, setProfession] = useState("")
  const [occupation, setOccupation] = useState("")
  const [ikigai, setIkigai] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const checked = checkOnboardingInput({ profession, occupation, ikigai })
    if (!checked.valid) {
      const first = FIELD_ORDER.find((f) => checked.errors[f])
      setError(first ? checked.errors[first]! : t.invalidInput)
      return
    }
    setError("")
    startTransition(async () => {
      const result = await completeOnboarding(checked.data)
      if (result.ok) {
        router.push(result.redirectTo)
        router.refresh()
        return
      }
      switch (result.error) {
        case "INVALID_INPUT":
          setError(t.invalidInput)
          break
        case "UNAUTHENTICATED":
          setError(t.sessionExpired)
          break
        case "FORBIDDEN":
          setError(t.forbidden)
          break
        case "ALREADY_COMPLETED":
          // Nothing left to fill in: the gate lets this user through now.
          router.push("/calendar")
          router.refresh()
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
            <label className={styles.label} htmlFor="onboarding-profession">
              {t.professionLabel}
            </label>
            <div
              id="onboarding-profession-hint"
              className={onboardingStyles.hint}
            >
              {t.professionHint}
            </div>
            <input
              id="onboarding-profession"
              type="text"
              autoComplete="off"
              aria-describedby="onboarding-profession-hint"
              value={profession}
              onChange={(e) => {
                setProfession(e.target.value)
                setError("")
              }}
              placeholder={t.professionPlaceholder}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="onboarding-occupation">
              {t.occupationLabel}
            </label>
            <div
              id="onboarding-occupation-hint"
              className={onboardingStyles.hint}
            >
              {t.occupationHint}
            </div>
            <input
              id="onboarding-occupation"
              type="text"
              autoComplete="off"
              aria-describedby="onboarding-occupation-hint"
              required
              aria-required="true"
              value={occupation}
              onChange={(e) => {
                setOccupation(e.target.value)
                setError("")
              }}
              placeholder={t.occupationPlaceholder}
              className={styles.input}
            />

            <label className={styles.label} htmlFor="onboarding-ikigai">
              {t.ikigaiLabel}
            </label>
            <div id="onboarding-ikigai-hint" className={onboardingStyles.hint}>
              {t.ikigaiHint}
            </div>
            <textarea
              id="onboarding-ikigai"
              rows={4}
              autoComplete="off"
              aria-describedby="onboarding-ikigai-hint"
              value={ikigai}
              onChange={(e) => {
                setIkigai(e.target.value)
                setError("")
              }}
              placeholder={t.ikigaiPlaceholder}
              className={`${styles.input} ${onboardingStyles.textarea}`}
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

          <div className={onboardingStyles.logout}>
            <LogoutButton />
          </div>
        </div>
      </div>
    </div>
  )
}
