import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { STRINGS } from "@/lib/strings"

const requireUser = vi.fn()
const create = vi.fn()
const update = vi.fn()
const del = vi.fn()
const createAdminClient = vi.fn()
const upload = vi.fn()
const getPublicUrl = vi.fn()
const remove = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("@/lib/auth", () => ({ requireUser: () => requireUser() }))
vi.mock("@/lib/db", () => ({
  prisma: {
    event: {
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}))
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClient(),
}))

import { createEvent } from "@/lib/actions/events"
import { mapEventRow } from "@/lib/eventsQuery"

const t = STRINGS.addEventModal.errors
const me = {
  id: "me-id",
  email: "me@x.test",
  fullName: "Luz Quispe",
  role: "USER",
  onboardingCompleted: true,
}
const input = {
  title: "  Feria  ",
  category: "food",
  date: "2026-09-27",
  startTime: "18:00",
  endTime: "19:00",
  modality: "IN_PERSON",
  location: " Av. Larco 1 ",
  meetingUrl: "",
  description: " Rica comida ",
}
const createdData = () => create.mock.calls[0][0].data
// "/9j/" is the shortest base64 string decoding to exactly the JPEG SOI
// marker (0xFF 0xD8 0xFF): a minimal, valid picture payload for tests.
const validPicture = "data:image/jpeg;base64,/9j/"

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-09-26T20:30:00Z")) // 15:30 Lima
  requireUser.mockResolvedValue({ ok: true, user: me })
  create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "ev-1",
      pictureUrl: null,
      ...data,
    }),
  )
  update.mockResolvedValue({})
  del.mockResolvedValue({})
  upload.mockResolvedValue({ error: null })
  getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://cdn.test/storage/v1/object/public/event-pictures/ev-1.jpg" },
  })
  remove.mockResolvedValue({ error: null })
  createAdminClient.mockReturnValue({
    storage: { from: () => ({ upload, getPublicUrl, remove }) },
  })
})
afterEach(() => vi.useRealTimers())

describe("createEvent guard", () => {
  it("UNAUTHENTICATED first, Prisma untouched, even with garbage", async () => {
    requireUser.mockResolvedValue({ ok: false, error: "UNAUTHENTICATED" })
    expect(await createEvent({ title: {} } as never)).toEqual({
      ok: false,
      error: "UNAUTHENTICATED",
    })
    expect(create).not.toHaveBeenCalled()
  })
  it("USER not onboarded -> FORBIDDEN, nothing created", async () => {
    requireUser.mockResolvedValue({
      ok: true,
      user: { ...me, onboardingCompleted: false },
    })
    expect(await createEvent(input)).toEqual({ ok: false, error: "FORBIDDEN" })
    expect(create).not.toHaveBeenCalled()
  })
  it("ADMIN not onboarded is allowed", async () => {
    requireUser.mockResolvedValue({
      ok: true,
      user: { ...me, role: "ADMIN", onboardingCompleted: false },
    })
    expect((await createEvent(input)).ok).toBe(true)
  })
})

describe("createEvent validation", () => {
  it("invalid input -> exact message and nothing created", async () => {
    const r = await createEvent({ ...input, date: "2026-09-25" })
    expect(r).toEqual({
      ok: false,
      error: "INVALID_INPUT",
      message: t.pastDate,
      field: "date",
    })
    expect(create).not.toHaveBeenCalled()
  })
  it("uses the server (Lima) clock for past start", async () => {
    const r = await createEvent({
      ...input,
      date: "2026-09-26",
      startTime: "15:29",
    })
    expect(r).toMatchObject({ ok: false, message: t.pastStart })
    expect(create).not.toHaveBeenCalled()
  })
  it("required beats past date", async () => {
    const r = await createEvent({ ...input, title: "", date: "2020-01-01" })
    expect(r).toMatchObject({ ok: false, message: t.required })
  })
})

describe("createEvent persistence", () => {
  it("exact create data; hostId from session even when smuggled", async () => {
    const r = await createEvent({
      ...input,
      hostId: "attacker",
      id: "x",
      createdAt: "2000-01-01",
      pictureUrl: "https://evil/x.png",
      attendeeIds: ["a"],
      status: "APPROVED",
    } as never)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create.mock.calls[0][0]).toEqual({
      data: {
        title: "Feria",
        category: "food",
        date: new Date("2026-09-27T00:00:00.000Z"),
        startTime: "18:00",
        endTime: "19:00",
        modality: "IN_PERSON",
        location: "Av. Larco 1",
        meetingUrl: null,
        description: "Rica comida",
        hostId: "me-id",
      },
    })
    expect(r).toEqual({
      ok: true,
      event: mapEventRow({
        id: "ev-1",
        title: "Feria",
        category: "food",
        date: new Date("2026-09-27T00:00:00.000Z"),
        startTime: "18:00",
        endTime: "19:00",
        modality: "IN_PERSON",
        location: "Av. Larco 1",
        meetingUrl: null,
        description: "Rica comida",
        pictureUrl: null,
        host: { id: "me-id", fullName: "Luz Quispe" },
        attendees: [],
      }),
    })
  })
  it("Virtual without address: location null", async () => {
    await createEvent({
      ...input,
      modality: "VIRTUAL",
      location: "",
      meetingUrl: "",
    })
    expect(createdData()).toMatchObject({
      modality: "VIRTUAL",
      location: null,
      meetingUrl: null,
    })
  })
  it("Virtual with https link stores meetingUrl", async () => {
    const r = await createEvent({
      ...input,
      modality: "VIRTUAL",
      location: "",
      meetingUrl: "https://meet.example.com/x",
    })
    expect(createdData()).toMatchObject({
      location: null,
      meetingUrl: "https://meet.example.com/x",
    })
    expect(r).toMatchObject({
      ok: true,
      event: { meetingUrl: "https://meet.example.com/x", location: "" },
    })
  })
  it("javascript: link rejected", async () => {
    const r = await createEvent({
      ...input,
      modality: "VIRTUAL",
      location: "",
      meetingUrl: "javascript:alert(1)",
    })
    expect(r).toMatchObject({ ok: false, message: t.invalidMeetingUrl })
    expect(create).not.toHaveBeenCalled()
  })
  it("Presencial ignores a supplied link", async () => {
    await createEvent({ ...input, meetingUrl: "https://x.com" })
    expect(createdData().meetingUrl).toBeNull()
  })
  it("thrown error -> UNEXPECTED without leaking text", async () => {
    create.mockRejectedValue(new Error("secret db detail"))
    const r = await createEvent(input)
    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(JSON.stringify(r)).not.toContain("secret")
  })
})

describe("createEvent invisible/control input", () => {
  it.each([
    ["title", "​"],
    ["title", "a\u0000b"],
    ["description", "⠀"],
    ["description", "a\u0001b"],
    ["location", "ㅤ"],
    ["location", "a\u0000b"],
  ])("%s %j -> required message, nothing created", async (field, value) => {
    const r = await createEvent({ ...input, [field]: value })
    expect(r).toMatchObject({
      ok: false,
      error: "INVALID_INPUT",
      message: t.required,
      field,
    })
    expect(create).not.toHaveBeenCalled()
  })
  it("control char inside a link -> invalid link, nothing created", async () => {
    const r = await createEvent({
      ...input,
      modality: "VIRTUAL",
      location: "",
      meetingUrl: "https://x.com/a\u0000",
    })
    expect(r).toMatchObject({ ok: false, message: t.invalidMeetingUrl })
    expect(create).not.toHaveBeenCalled()
  })
})

describe("createEvent invisible text with inner whitespace", () => {
  it.each([
    ["title", "​ ‍ㅤ"],
    ["description", "ㅤ ⠀"],
    ["location", " ​\t­ "],
    ["title", "‍  ‌ ⁠"],
  ])("%s %j -> required, nothing created", async (field, value) => {
    const r = await createEvent({ ...input, [field]: value })
    expect(r).toMatchObject({ ok: false, message: t.required, field })
    expect(create).not.toHaveBeenCalled()
  })
})

describe("createEvent picture validation (server-side, never trusts the client)", () => {
  it.each([
    ["missing prefix", "aGVsbG8="],
    ["wrong mime prefix", "data:image/png;base64,/9j/"],
    ["not a string", 12345],
    ["empty string is treated as no picture, not invalid", ""],
  ])("%s", async (_label, value) => {
    const r = await createEvent({ ...input, picture: value })
    if (value === "") {
      // Empty string means "no picture" (AC: form submits fine with none).
      expect(r).toMatchObject({ ok: true })
      expect(createAdminClient).not.toHaveBeenCalled()
      return
    }
    expect(r).toEqual({
      ok: false,
      error: "INVALID_PICTURE",
      message: t.invalidPicture,
    })
    expect(create).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it("wrong magic bytes (valid base64, not a JPEG) -> INVALID_PICTURE, nothing created", async () => {
    const r = await createEvent({
      ...input,
      picture: "data:image/jpeg;base64,AAAA",
    })
    expect(r).toEqual({
      ok: false,
      error: "INVALID_PICTURE",
      message: t.invalidPicture,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("invalid base64 characters -> INVALID_PICTURE, nothing created", async () => {
    const r = await createEvent({
      ...input,
      picture: "data:image/jpeg;base64,/9j/$$$not-base64$$$",
    })
    expect(r).toEqual({
      ok: false,
      error: "INVALID_PICTURE",
      message: t.invalidPicture,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("decoded payload over the server sanity ceiling -> INVALID_PICTURE, nothing created", async () => {
    // 900 KB of decoded bytes: over the 600 KB ceiling despite a valid JPEG
    // magic-byte prefix and otherwise well-formed base64.
    const oversizedBase64 = "/9j/" + "A".repeat(1_200_000)
    const r = await createEvent({
      ...input,
      picture: `data:image/jpeg;base64,${oversizedBase64}`,
    })
    expect(r).toEqual({
      ok: false,
      error: "INVALID_PICTURE",
      message: t.invalidPicture,
    })
    expect(create).not.toHaveBeenCalled()
  })

  it("required-field errors are still checked before the picture", async () => {
    const r = await createEvent({
      ...input,
      title: "",
      picture: "not-a-data-url",
    })
    expect(r).toMatchObject({
      ok: false,
      error: "INVALID_INPUT",
      message: t.required,
    })
    expect(create).not.toHaveBeenCalled()
    expect(createAdminClient).not.toHaveBeenCalled()
  })
})

describe("createEvent with a valid picture", () => {
  it("uploads to event-pictures/<id>.jpg, patches pictureUrl, returns it in the view model", async () => {
    const r = await createEvent({ ...input, picture: validPicture })

    expect(create).toHaveBeenCalledTimes(1)
    expect(createAdminClient).toHaveBeenCalled()
    expect(upload).toHaveBeenCalledTimes(1)
    const [path, body, options] = upload.mock.calls[0]
    expect(path).toBe("ev-1.jpg")
    expect(Buffer.isBuffer(body)).toBe(true)
    expect((body as Buffer).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true)
    expect(options).toEqual({ upsert: true, contentType: "image/jpeg" })

    expect(update).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledWith({
      where: { id: "ev-1" },
      data: {
        pictureUrl:
          "https://cdn.test/storage/v1/object/public/event-pictures/ev-1.jpg",
      },
    })

    expect(del).not.toHaveBeenCalled()
    expect(r).toMatchObject({
      ok: true,
      event: {
        pictureUrl:
          "https://cdn.test/storage/v1/object/public/event-pictures/ev-1.jpg",
      },
    })
  })

  it("no picture: unchanged #15 behavior, pictureUrl null, storage client never touched", async () => {
    const r = await createEvent(input)
    expect(r).toMatchObject({ ok: true, event: { pictureUrl: null } })
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe("createEvent picture upload/update failures roll back the event", () => {
  it("upload returns an error -> event deleted, UNEXPECTED, no partial event", async () => {
    upload.mockResolvedValue({ error: { message: "network down" } })
    const r = await createEvent({ ...input, picture: validPicture })

    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({ where: { id: "ev-1" } })
    expect(update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled() // nothing was actually uploaded
    expect(JSON.stringify(r)).not.toContain("network down")
  })

  it("upload throws -> event deleted, UNEXPECTED, no leaked error text", async () => {
    upload.mockRejectedValue(new Error("secret storage detail"))
    const r = await createEvent({ ...input, picture: validPicture })

    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({ where: { id: "ev-1" } })
    expect(remove).not.toHaveBeenCalled()
    expect(JSON.stringify(r)).not.toContain("secret")
  })

  it("DB update after a successful upload throws -> event deleted, best-effort storage cleanup, UNEXPECTED", async () => {
    update.mockRejectedValue(new Error("db detail"))
    const r = await createEvent({ ...input, picture: validPicture })

    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(upload).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith(["ev-1.jpg"])
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({ where: { id: "ev-1" } })
    expect(JSON.stringify(r)).not.toContain("db detail")
  })

  it("cleanup itself failing never changes the returned result", async () => {
    update.mockRejectedValue(new Error("db detail"))
    remove.mockRejectedValue(new Error("cleanup also failed"))
    const r = await createEvent({ ...input, picture: validPicture })

    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(del).toHaveBeenCalledTimes(1)
  })

  it("no public URL returned -> treated as a failure, event deleted and object removed", async () => {
    getPublicUrl.mockReturnValue({ data: { publicUrl: null } })
    const r = await createEvent({ ...input, picture: validPicture })

    expect(r).toEqual({ ok: false, error: "UNEXPECTED" })
    expect(remove).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledTimes(1)
  })

  it("the compensating delete ITSELF throwing still returns UNEXPECTED, not an uncaught error", async () => {
    upload.mockResolvedValue({ error: { message: "network down" } })
    del.mockRejectedValue(new Error("db unreachable during rollback"))

    await expect(
      createEvent({ ...input, picture: validPicture }),
    ).resolves.toEqual({ ok: false, error: "UNEXPECTED" })
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith({ where: { id: "ev-1" } })
  })
})
