import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/lib/actions/auth", () => ({
  register: vi.fn(),
  signIn: vi.fn(),
}))

import LoginScreen from "@/components/LoginScreen"
import RegisterScreen from "@/components/RegisterScreen"
import { STRINGS } from "@/lib/strings"

const registerHtml = renderToStaticMarkup(createElement(RegisterScreen))
const loginHtml = renderToStaticMarkup(createElement(LoginScreen))

describe("RegisterScreen (open registration)", () => {
  it.each([
    "register-name",
    "register-birthday",
    "register-email",
    "register-password",
  ])("still asks for %s", (id) => {
    expect(registerHtml).toContain(`id="${id}"`)
  })

  it("has no invite code field and never mentions invitations", () => {
    expect(registerHtml).not.toContain('id="register-code"')
    expect(registerHtml).not.toMatch(/c[óo]digo/i)
    expect(registerHtml).not.toMatch(/invitaci[óo]n/i)
  })

  it("its only inputs are name, birthday, email and password", () => {
    const inputs = [...registerHtml.matchAll(/<input[^>]*\bid="([^"]+)"/g)].map(
      (m) => m[1],
    )
    expect(inputs).toEqual([
      "register-name",
      "register-birthday",
      "register-email",
      "register-password",
    ])
  })

  it("subtitle no longer says a code is needed", () => {
    expect(STRINGS.register.subtitle).not.toMatch(/c[óo]digo|invitaci[óo]n/i)
  })
})

describe("LoginScreen register link", () => {
  it("invites anyone without an account to register, not only code holders", () => {
    expect(loginHtml).toContain(STRINGS.login.registerLink)
    expect(STRINGS.login.registerLink).not.toMatch(/c[óo]digo|invitaci[óo]n/i)
    expect(loginHtml).toContain('href="/register"')
  })
})
