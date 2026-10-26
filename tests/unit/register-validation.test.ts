import { describe, expect, it } from "vitest"
import { todayKeyInLima } from "@/lib/dateUtils"
import { BIRTHDAY_MIN, checkRegisterInput } from "@/lib/validation/auth"
import { STRINGS } from "@/lib/strings"

const ok = {
  fullName: " Ana ",
  birthday: " 1990-05-15 ",
  email: " a@b.co ",
  password: "12345678",
}

describe("checkRegisterInput", () => {
  it("trims and strips unknown keys such as role", () => {
    expect(checkRegisterInput({ ...ok, role: "ADMIN" })).toEqual({
      valid: true,
      data: {
        fullName: "Ana",
        birthday: "1990-05-15",
        email: "a@b.co",
        password: "12345678",
      },
    })
  })

  it("no invite code is needed: a missing or junk `code` neither blocks nor survives", () => {
    const expected = {
      valid: true,
      data: {
        fullName: "Ana",
        birthday: "1990-05-15",
        email: "a@b.co",
        password: "12345678",
      },
    }
    expect(checkRegisterInput(ok)).toEqual(expected)
    expect(checkRegisterInput({ ...ok, code: "" })).toEqual(expected)
    expect(checkRegisterInput({ ...ok, code: "A".repeat(500) })).toEqual(
      expected,
    )
  })

  it("reports the exact es-PE message per field", () => {
    const r = checkRegisterInput({
      fullName: "",
      birthday: " ",
      email: "x",
      password: "1",
    })
    expect(r).toEqual({
      valid: false,
      errors: {
        fullName: STRINGS.register.fullNameRequired,
        birthday: STRINGS.register.birthdayRequired,
        email: STRINGS.register.emailInvalid,
        password: STRINGS.register.passwordTooShort,
      },
    })
  })

  it("a missing birthday key is the required error, not a raw Zod message", () => {
    const withoutBirthday = {
      fullName: ok.fullName,
      email: ok.email,
      password: ok.password,
    }
    expect(checkRegisterInput(withoutBirthday)).toEqual({
      valid: false,
      errors: { birthday: STRINGS.register.birthdayRequired },
    })
  })

  it.each([
    ["day-first format", "15/05/1990"],
    ["not a date", "abc"],
    ["day that does not exist", "1990-02-30"],
    ["month 13", "1990-13-01"],
    ["before the minimum", "1899-12-31"],
    ["two-digit year", "90-05-15"],
  ])("birthday %s is birthdayInvalid", (_label, birthday) => {
    expect(checkRegisterInput({ ...ok, birthday })).toEqual({
      valid: false,
      errors: { birthday: STRINGS.register.birthdayInvalid },
    })
  })

  it("birthday bounds: the minimum and today (Lima) are accepted, anything later is birthdayFuture", () => {
    expect(checkRegisterInput({ ...ok, birthday: BIRTHDAY_MIN }).valid).toBe(
      true,
    )
    expect(
      checkRegisterInput({ ...ok, birthday: todayKeyInLima() }).valid,
    ).toBe(true)
    expect(checkRegisterInput({ ...ok, birthday: "2999-01-01" })).toEqual({
      valid: false,
      errors: { birthday: STRINGS.register.birthdayFuture },
    })
  })

  it("accepts a leap-day birthday only in a leap year", () => {
    expect(checkRegisterInput({ ...ok, birthday: "2000-02-29" }).valid).toBe(
      true,
    )
    expect(checkRegisterInput({ ...ok, birthday: "1999-02-29" })).toMatchObject(
      { valid: false, errors: { birthday: STRINGS.register.birthdayInvalid } },
    )
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
