import { describe, expect, it } from "vitest"
import { checkRegisterInput } from "@/lib/validation/auth"
import { STRINGS } from "@/lib/strings"

const ok = {
  fullName: " Ana ",
  email: " a@b.co ",
  password: "12345678",
  code: " X ",
}

describe("checkRegisterInput", () => {
  it("trims and strips unknown keys such as role", () => {
    expect(checkRegisterInput({ ...ok, role: "ADMIN" })).toEqual({
      valid: true,
      data: {
        fullName: "Ana",
        email: "a@b.co",
        password: "12345678",
        code: "X",
      },
    })
  })

  it("reports the exact es-PE message per field", () => {
    const r = checkRegisterInput({
      fullName: "",
      email: "x",
      password: "1",
      code: " ",
    })
    expect(r).toEqual({
      valid: false,
      errors: {
        fullName: STRINGS.register.fullNameRequired,
        email: STRINGS.register.emailInvalid,
        password: STRINGS.register.passwordTooShort,
        code: STRINGS.register.codeRequired,
      },
    })
  })

  it("password bounds are 8 and 72", () => {
    expect(checkRegisterInput({ ...ok, password: "1234567" }).valid).toBe(false)
    expect(checkRegisterInput({ ...ok, password: "x".repeat(72) }).valid).toBe(
      true,
    )
    expect(
      checkRegisterInput({ ...ok, password: "x".repeat(73) }),
    ).toMatchObject({
      valid: false,
      errors: { password: STRINGS.register.passwordTooLong },
    })
  })
})
