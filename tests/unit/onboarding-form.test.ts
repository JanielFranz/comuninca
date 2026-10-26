import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/lib/actions/onboarding", () => ({ completeOnboarding: vi.fn() }))
vi.mock("@/components/LogoutButton", () => ({ default: () => null }))

import OnboardingForm from "@/components/OnboardingForm"
import { STRINGS } from "@/lib/strings"

const t = STRINGS.onboarding
const html = renderToStaticMarkup(createElement(OnboardingForm))

const FIELDS = [
  { id: "onboarding-profession", hint: t.professionHint },
  { id: "onboarding-occupation", hint: t.occupationHint },
  { id: "onboarding-ikigai", hint: t.ikigaiHint },
]

describe("OnboardingForm field explanations", () => {
  it.each(FIELDS)("$id shows its explanation", ({ id, hint }) => {
    expect(html).toContain(`id="${id}-hint"`)
    expect(html).toMatch(new RegExp(`id="${id}-hint"[^>]*>${hint}</div>`))
  })

  it.each(FIELDS)(
    "$id is described by its explanation (screen readers)",
    ({ id }) => {
      expect(html).toMatch(
        new RegExp(
          `<(?:input|textarea)[^>]*\\bid="${id}"[^>]*\\baria-describedby="${id}-hint"`,
        ),
      )
    },
  )

  it("explains profession as what you studied, occupation as what you do for a living, ikigai as purpose", () => {
    expect(t.professionHint).toMatch(/estudiaste/)
    expect(t.occupationHint).toMatch(/ganarte la vida/)
    expect(t.occupationHint).toMatch(/distinta de tu profesión/)
    expect(t.ikigaiHint).toMatch(/propósito de vida/)
  })

  it("keeps the existing labels and the required marker on occupation", () => {
    for (const label of [t.professionLabel, t.occupationLabel, t.ikigaiLabel]) {
      expect(html).toContain(label)
    }
    expect(html).toMatch(/<input[^>]*id="onboarding-occupation"[^>]*required/)
  })
})
