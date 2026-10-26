import { describe, expect, it } from "vitest"
import { STRINGS } from "@/lib/strings"
import {
  checkEventInput,
  createEventSchema,
  isValidGroupUrl,
  isValidMeetingUrl,
} from "@/lib/validation/events"

const t = STRINGS.addEventModal.errors
// 2026-09-26 15:30 in Lima (UTC-5)
const NOW = new Date("2026-09-26T20:30:00Z")

const valid = {
  title: "Feria de barrio",
  category: "workshop",
  date: "2026-09-27",
  startTime: "18:00",
  endTime: "19:00",
  modality: "IN_PERSON",
  location: "Av. Larco 123",
  meetingUrl: "",
  description: "Ven con tu familia",
}
const msg = (over: Record<string, unknown>, now = NOW) => {
  const r = checkEventInput({ ...valid, ...over }, now)
  return r.valid ? "OK" : r.message
}

describe("eventSchema messages", () => {
  it("accepts a valid Presencial event and trims", () => {
    const r = checkEventInput(
      {
        ...valid,
        title: "  Hola  ",
        location: " Calle 1 ",
        description: " d ",
      },
      NOW,
    )
    expect(r).toEqual({
      valid: true,
      data: {
        ...valid,
        title: "Hola",
        location: "Calle 1",
        meetingUrl: null,
        groupUrl: null,
        description: "d",
      },
    })
  })

  it.each([
    "title",
    "category",
    "date",
    "startTime",
    "endTime",
    "description",
    "location",
  ])("empty %s -> required message", (f) => {
    expect(msg({ [f]: "" })).toBe(t.required)
    expect(msg({ [f]: "   " })).toBe(t.required)
    expect(msg({ [f]: undefined })).toBe(t.required)
  })

  it("missing/invalid modality -> required", () => {
    expect(msg({ modality: "" })).toBe(t.required)
    expect(msg({ modality: "HYBRID" })).toBe(t.required)
  })

  it("category outside the seven -> required", () => {
    expect(msg({ category: "party" })).toBe(t.required)
    for (const c of [
      "workshop",
      "webinar",
      "masterclass",
      "networking",
      "expoferia",
      "voluntariado",
      "convivencia",
    ]) {
      expect(msg({ category: c })).toBe("OK")
    }
  })

  it.each(["social", "music", "sports", "food"])(
    "retired category %j is no longer accepted",
    (c) => {
      expect(msg({ category: c })).toBe(t.required)
    },
  )

  it.each(["2026-02-30", "2026-13-01", "2026-9-5", "27/09/2026"])(
    "invalid calendar date %s -> required",
    (date) => expect(msg({ date })).toBe(t.required),
  )
  it.each(["24:00", "9:5", "12:60", "25:00", "18"])(
    "invalid time %s -> required",
    (time) => {
      expect(msg({ startTime: time })).toBe(t.required)
      expect(msg({ endTime: time })).toBe(t.required)
    },
  )

  it("past date", () => {
    expect(msg({ date: "2026-09-25" })).toBe(t.pastDate)
  })
  it("today: start one minute earlier rejected, equal accepted, later accepted", () => {
    const today = { date: "2026-09-26", endTime: "16:00" }
    expect(msg({ ...today, startTime: "15:29" })).toBe(t.pastStart)
    expect(msg({ ...today, startTime: "15:30" })).toBe("OK")
    expect(msg({ ...today, startTime: "15:31" })).toBe("OK")
  })
  it("end equal to or earlier than start", () => {
    expect(msg({ startTime: "18:00", endTime: "18:00" })).toBe(t.endBeforeStart)
    expect(msg({ startTime: "18:00", endTime: "17:59" })).toBe(t.endBeforeStart)
    expect(msg({ startTime: "18:00", endTime: "18:01" })).toBe("OK")
  })

  it("precedence: required > past date > past start > end", () => {
    expect(msg({ title: "", date: "2020-01-01" })).toBe(t.required)
    expect(
      msg({ date: "2020-01-01", startTime: "10:00", endTime: "09:00" }),
    ).toBe(t.pastDate)
    expect(
      msg({ date: "2026-09-26", startTime: "10:00", endTime: "09:00" }),
    ).toBe(t.pastStart)
    expect(
      msg({ date: "2026-09-27", startTime: "10:00", endTime: "09:00" }),
    ).toBe(t.endBeforeStart)
  })

  it("Lima midnight edge and UTC-vs-Lima date", () => {
    const lima0000 = new Date("2026-09-26T05:00:00Z") // 00:00 Lima
    expect(
      msg(
        { date: "2026-09-26", startTime: "00:00", endTime: "01:00" },
        lima0000,
      ),
    ).toBe("OK")
    expect(
      msg(
        { date: "2026-09-25", startTime: "23:00", endTime: "23:30" },
        lima0000,
      ),
    ).toBe(t.pastDate)
    const utcNextDay = new Date("2026-10-01T03:00:00Z") // 2026-09-30 22:00 Lima
    expect(
      msg(
        { date: "2026-09-30", startTime: "21:59", endTime: "23:00" },
        utcNextDay,
      ),
    ).toBe(t.pastStart)
    expect(
      msg(
        { date: "2026-09-30", startTime: "22:00", endTime: "23:00" },
        utcNextDay,
      ),
    ).toBe("OK")
    expect(
      msg(
        { date: "2026-10-01", startTime: "01:00", endTime: "02:00" },
        utcNextDay,
      ),
    ).toBe("OK")
    expect(
      msg(
        { date: "2026-09-29", startTime: "23:00", endTime: "23:30" },
        utcNextDay,
      ),
    ).toBe(t.pastDate)
  })

  it("length caps", () => {
    expect(msg({ title: "a".repeat(120) })).toBe("OK")
    expect(msg({ title: "a".repeat(121) })).toBe(t.titleTooLong)
    expect(msg({ location: "a".repeat(200) })).toBe("OK")
    expect(msg({ location: "a".repeat(201) })).toBe(t.locationTooLong)
    expect(msg({ description: "a".repeat(2000) })).toBe("OK")
    expect(msg({ description: "a".repeat(2001) })).toBe(t.descriptionTooLong)
  })
})

describe("modality rules", () => {
  it("Presencial without location rejected (required)", () => {
    expect(msg({ location: "" })).toBe(t.required)
  })
  it("Virtual without location or link accepted; location null", () => {
    const r = checkEventInput(
      { ...valid, modality: "VIRTUAL", location: "", meetingUrl: "" },
      NOW,
    )
    expect(r).toMatchObject({
      valid: true,
      data: { location: null, meetingUrl: null, modality: "VIRTUAL" },
    })
  })
  it("Virtual with https link stores meetingUrl, location null (even if location sent)", () => {
    const r = checkEventInput(
      {
        ...valid,
        modality: "VIRTUAL",
        location: "Calle 9",
        meetingUrl: " https://meet.example.com/x ",
      },
      NOW,
    )
    expect(r).toMatchObject({
      valid: true,
      data: { location: null, meetingUrl: "https://meet.example.com/x" },
    })
  })
  it("Presencial ignores a supplied link (even an invalid one)", () => {
    const r = checkEventInput(
      { ...valid, meetingUrl: "javascript:alert(1)" },
      NOW,
    )
    expect(r).toMatchObject({ valid: true, data: { meetingUrl: null } })
  })
  it("Virtual with invalid link -> invalidMeetingUrl", () => {
    expect(
      msg({ modality: "VIRTUAL", location: "", meetingUrl: "ftp://x" }),
    ).toBe(t.invalidMeetingUrl)
  })
})

describe("groupUrl (optional WhatsApp/group link)", () => {
  const wa = "https://chat.whatsapp.com/AbCdEf123456"
  it("is optional: missing, empty and whitespace-only all store null", () => {
    for (const groupUrl of [undefined, "", "   ", null]) {
      expect(checkEventInput({ ...valid, groupUrl }, NOW)).toMatchObject({
        valid: true,
        data: { groupUrl: null },
      })
    }
  })
  it("is stored trimmed for Presencial and for Virtual events alike", () => {
    expect(
      checkEventInput({ ...valid, groupUrl: ` ${wa} ` }, NOW),
    ).toMatchObject({ valid: true, data: { groupUrl: wa } })
    expect(
      checkEventInput(
        { ...valid, modality: "VIRTUAL", location: "", groupUrl: wa },
        NOW,
      ),
    ).toMatchObject({ valid: true, data: { groupUrl: wa, meetingUrl: null } })
  })
  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,x"],
    ["ftp://x.com/g"],
    ["chat.whatsapp.com/AbCdEf"],
    ["https://user:pass@x.com/g"],
    ["https://x.com/a b"],
    ["https://x.com/" + "a".repeat(500)],
  ])("invalid link %j -> invalidGroupUrl", (groupUrl) => {
    expect(msg({ groupUrl })).toBe(t.invalidGroupUrl)
    expect(checkEventInput({ ...valid, groupUrl }, NOW)).toMatchObject({
      valid: false,
      field: "groupUrl",
    })
  })
  it("a missing required field is reported before a bad group link", () => {
    expect(msg({ title: "", groupUrl: "nope" })).toBe(t.required)
  })
  it("uses the same rules as the meeting link", () => {
    for (const u of [wa, "javascript:alert(1)", "http://a.b", "", "//x.com"]) {
      expect(isValidGroupUrl(u)).toBe(isValidMeetingUrl(u))
    }
  })
})

describe("isValidMeetingUrl", () => {
  const prefix = "https://x.com/"
  it.each([
    ["https://meet.example.com/x", true],
    ["http://a.b", true],
    ["HTTPS://Meet.Example.com/x?y=1#z", true],
    ["javascript:alert(1)", false],
    ["data:text/html,x", false],
    ["ftp://x", false],
    ["file:///etc/passwd", false],
    ["//x.com", false],
    ["meet.example.com", false],
    ["https:example.com", false],
    ["https://user:pass@x.com", false],
    ["https://user@x.com", false],
    ["https://a b.com", false],
    ["", false],
    [prefix + "a".repeat(500), false],
    [prefix + "a".repeat(500 - prefix.length), true],
  ])("%s -> %s", (u, ok) => expect(isValidMeetingUrl(u)).toBe(ok))
})

describe("shared schema", () => {
  it("client helper and raw schema produce identical messages", () => {
    const schema = createEventSchema(NOW)
    for (const over of [
      { title: "" },
      { date: "2020-01-01" },
      { endTime: "17:00" },
    ]) {
      const raw = schema.safeParse({ ...valid, ...over })
      const helper = checkEventInput({ ...valid, ...over }, NOW)
      expect(raw.success).toBe(false)
      expect(helper.valid ? "" : helper.message).toBe(
        raw.success ? "" : raw.error.issues[0].message,
      )
    }
  })
  it("strips unknown keys", () => {
    const r = createEventSchema(NOW).parse({
      ...valid,
      hostId: "x",
      id: "y",
      pictureUrl: "z",
    })
    expect(r).not.toHaveProperty("hostId")
    expect(r).not.toHaveProperty("id")
    expect(r).not.toHaveProperty("pictureUrl")
  })
  it("garbage input never throws", () => {
    for (const g of [null, undefined, 5, "x", [], { title: {} }]) {
      expect(checkEventInput(g, NOW)).toMatchObject({
        valid: false,
        message: t.required,
      })
    }
  })
})

describe("invisible and control characters", () => {
  const INVISIBLE = ["​", "‍", "⁠", "­", "ㅤ", "⠀", "​‍⁠"]
  it.each(INVISIBLE)("only-invisible %j counts as empty", (c) => {
    for (const f of ["title", "description", "location"]) {
      expect(msg({ [f]: c })).toBe(t.required)
      expect(msg({ [f]: ` ${c} ` })).toBe(t.required)
    }
    expect(msg({ category: c })).toBe(t.required)
    expect(msg({ date: c })).toBe(t.required)
    expect(msg({ startTime: c })).toBe(t.required)
    expect(msg({ endTime: c })).toBe(t.required)
  })
  it("U+0000 alone is empty; inside visible text is rejected", () => {
    for (const f of ["title", "description", "location"]) {
      expect(msg({ [f]: "\u0000" })).toBe(t.required)
      expect(msg({ [f]: "a\u0000b" })).toBe(t.required)
    }
  })
  it("virtual location is ignored, so control chars there are not stored", () => {
    const r = checkEventInput(
      { ...valid, modality: "VIRTUAL", location: "a\u0000b" },
      NOW,
    )
    expect(r).toMatchObject({ valid: true, data: { location: null } })
  })
  it("title and location reject every control character", () => {
    for (const c of ["\n", "\t", "\u0001", "\u007F"]) {
      expect(msg({ title: `a${c}b` })).toBe(t.required)
      expect(msg({ location: `a${c}b` })).toBe(t.required)
    }
  })
  it("description allows line breaks and tabs, rejects other controls", () => {
    expect(msg({ description: "a\nb\r\nc\td" })).toBe("OK")
    expect(msg({ description: "a\u0000b" })).toBe(t.required)
    expect(msg({ description: "a\u0001b" })).toBe(t.required)
    expect(msg({ description: "a\u007Fb" })).toBe(t.required)
  })
  it("format characters inside visible text are kept (emoji ZWJ, flags, accents)", () => {
    const title = "Fiesta \u{1F468}‍\u{1F469}‍\u{1F467}"
    const r = checkEventInput({ ...valid, title }, NOW)
    expect(r).toMatchObject({ valid: true, data: { title } })
    expect(msg({ title: "Café de niños 🇵🇪" })).toBe("OK")
  })
  it("control or format character inside a link is rejected", () => {
    for (const c of ["\u0000", "\u0001", "\u007F", "​", "‍"]) {
      expect(isValidMeetingUrl(`https://x.com/a${c}b`)).toBe(false)
      expect(isValidMeetingUrl(`https://x${c}.com`)).toBe(false)
      expect(
        msg({
          modality: "VIRTUAL",
          location: "",
          meetingUrl: `https://x.com/a${c}`,
        }),
      ).toBe(c === "​" || c === "‍" ? t.invalidMeetingUrl : t.invalidMeetingUrl)
    }
  })
})

describe("invisible text with inner whitespace", () => {
  const VALUES = ["​ ‍ㅤ", "ㅤ ⠀", "‍  ‌ ⁠", " ​\t­ ", "​ \n ‍"]
  it.each(VALUES)("%j counts as empty in title, description, location", (v) => {
    for (const f of ["title", "description", "location"]) {
      expect(msg({ [f]: v })).toBe(t.required)
    }
  })
  it("normal text with inner spaces and ZWJ emoji still accepted", () => {
    expect(msg({ title: "Fiesta de barrio" })).toBe("OK")
    expect(msg({ title: "Fiesta \u{1F468}‍\u{1F469}‍\u{1F467}" })).toBe("OK")
    expect(msg({ description: "línea uno\nlínea dos" })).toBe("OK")
  })
})
