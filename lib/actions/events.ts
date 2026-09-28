"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createAdminClient } from "@/lib/supabase/admin"
import { parseUtcDateKey, todayKeyInLima } from "@/lib/dateUtils"
import {
  clampEventsWindow,
  collectPeople,
  mapEventRow,
  type EventRow,
  type EventsWindow,
} from "@/lib/eventsQuery"
import { STRINGS } from "@/lib/strings"
import {
  checkEventInput,
  ToggleJoinSchema,
  type EventField,
} from "@/lib/validation/events"
import type { CalendarEvent, User } from "@/lib/types"

const EVENT_PICTURES_BUCKET = "event-pictures"
const PICTURE_DATA_URL_PREFIX = "data:image/jpeg;base64,"
const JPEG_BASE64_MAGIC = "/9j/"
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
/**
 * Sanity ceiling for the DECODED byte length. The client budget is 500 KB
 * (`PICTURE_MAX_OUTPUT_BYTES` in `lib/storage.ts`); this leaves a few
 * percent of headroom for encoding slop without trusting the client's own
 * arithmetic.
 */
const PICTURE_SERVER_MAX_BYTES = 600 * 1024
/**
 * Cheap pre-check on the ENCODED string length (base64 expands 3 bytes to 4
 * characters), so an oversized payload is rejected before `Buffer.from` ever
 * decodes it — decoding is bounded anyway by `next.config.ts`'s 4 MB Server
 * Action body limit, but this keeps the check local and self-contained
 * rather than relying on that out-of-band setting.
 */
const PICTURE_SERVER_MAX_BASE64_LENGTH = Math.ceil(
  (PICTURE_SERVER_MAX_BYTES * 4) / 3,
)

/**
 * Server-side picture validation: never trust the client resize. Confirms
 * the value is a `data:image/jpeg;base64,...` URL, that the payload is
 * actually valid base64, that the decoded bytes start with the real JPEG
 * magic number, and that the decoded size is within the sanity ceiling.
 * Exact pixel dimensions are NOT re-verified here (that would need an
 * image-decoding library this project doesn't have).
 */
function decodeEventPicture(
  input: unknown,
): { ok: true; buffer: Buffer } | { ok: false } {
  if (typeof input !== "string" || !input.startsWith(PICTURE_DATA_URL_PREFIX)) {
    return { ok: false }
  }
  const base64 = input.slice(PICTURE_DATA_URL_PREFIX.length)
  if (
    base64.length === 0 ||
    base64.length > PICTURE_SERVER_MAX_BASE64_LENGTH ||
    !base64.startsWith(JPEG_BASE64_MAGIC) ||
    !BASE64_PATTERN.test(base64)
  ) {
    return { ok: false }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(base64, "base64")
  } catch {
    return { ok: false }
  }
  if (buffer.length === 0 || buffer.length > PICTURE_SERVER_MAX_BYTES) {
    return { ok: false }
  }
  // Authoritative check: the real JPEG SOI marker (0xFFD8FF), not just the
  // base64-text pre-filter above.
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer[2] !== 0xff) {
    return { ok: false }
  }
  return { ok: true, buffer }
}

/**
 * Uploads the picture to `event-pictures/<eventId>.jpg` and patches
 * `Event.pictureUrl`. If the DB update fails after a successful upload, the
 * uploaded object is removed best-effort (never throws, never changes the
 * returned result). Never throws: callers get `{ ok: false }` on any
 * failure and are responsible for rolling back the Event row itself.
 */
async function attachEventPicture(
  eventId: string,
  buffer: Buffer,
): Promise<{ ok: true; url: string } | { ok: false }> {
  const path = `${eventId}.jpg`
  let uploaded = false
  try {
    const admin = createAdminClient()
    const bucket = admin.storage.from(EVENT_PICTURES_BUCKET)
    const { error: uploadError } = await bucket.upload(path, buffer, {
      upsert: true,
      contentType: "image/jpeg",
    })
    if (uploadError) return { ok: false }
    uploaded = true

    const { data } = bucket.getPublicUrl(path)
    const publicUrl = data?.publicUrl
    // Thrown (not returned) so the catch block below also cleans up the
    // object that did make it to storage.
    if (!publicUrl) throw new Error("no public URL returned")

    await prisma.event.update({
      where: { id: eventId },
      data: { pictureUrl: publicUrl },
    })
    return { ok: true, url: publicUrl }
  } catch {
    if (uploaded) {
      try {
        await createAdminClient()
          .storage.from(EVENT_PICTURES_BUCKET)
          .remove([path])
      } catch {
        // Best-effort cleanup only; never mask the original failure.
      }
    }
    return { ok: false }
  }
}

export type ListEventsResult =
  | {
      ok: true
      events: CalendarEvent[]
      people: User[]
      /** Server "today" in Lima time, "YYYY-MM-DD". */
      today: string
      window: EventsWindow
    }
  | { ok: false; error: "UNAUTHENTICATED" | "UNEXPECTED" }

/**
 * Community calendar read: any authenticated user (admins included).
 * Only `id` and `fullName` of hosts/attendees are ever selected (no emails).
 */
export async function listEvents(input?: {
  from?: unknown
  to?: unknown
}): Promise<ListEventsResult> {
  const guard = await requireUser()
  if (!guard.ok) return { ok: false, error: guard.error }

  try {
    const today = todayKeyInLima()
    const window = clampEventsWindow(today, input)
    const gte = parseUtcDateKey(window.from)
    const lte = parseUtcDateKey(window.to)
    if (!gte || !lte) return { ok: false, error: "UNEXPECTED" }

    const rows: EventRow[] = await prisma.event.findMany({
      where: { date: { gte, lte } },
      select: {
        id: true,
        title: true,
        category: true,
        date: true,
        startTime: true,
        endTime: true,
        modality: true,
        location: true,
        meetingUrl: true,
        description: true,
        pictureUrl: true,
        host: { select: { id: true, fullName: true } },
        attendees: {
          select: { userId: true, user: { select: { fullName: true } } },
          orderBy: { userId: "asc" },
        },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }],
    })

    return {
      ok: true,
      events: rows.map(mapEventRow),
      people: collectPeople(rows, guard.user),
      today,
      window,
    }
  } catch {
    return { ok: false, error: "UNEXPECTED" }
  }
}

export type CreateEventInput = {
  title: unknown
  category: unknown
  date: unknown
  startTime: unknown
  endTime: unknown
  modality: unknown
  /** Presencial: the physical address. Ignored for Virtual. */
  location?: unknown
  /** Virtual: optional meeting link. Ignored for Presencial. */
  meetingUrl?: unknown
  description: unknown
  /** Optional: a `data:image/jpeg;base64,...` URL from `lib/storage.ts`. */
  picture?: unknown
}

export type CreateEventResult =
  | { ok: true; event: CalendarEvent }
  | {
      ok: false
      error: "INVALID_INPUT"
      message: string
      field?: EventField
    }
  | { ok: false; error: "INVALID_PICTURE"; message: string }
  | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" | "UNEXPECTED" }

/**
 * Creates an event hosted by the signed-in user. Guard first; then the shared
 * schema on the server (Lima) clock. `hostId` only ever comes from the
 * session; unknown input keys are stripped by the schema.
 *
 * The optional picture is validated BEFORE any DB write (alongside the rest
 * of the form). On a valid submission: the Event row is created first
 * (without `pictureUrl`), then — only if a picture was provided — it is
 * uploaded and the row is patched with the public URL. If that upload/patch
 * fails, the just-created Event row is deleted so nothing is left behind
 * (mirroring the rollback pattern in `register`, feature #10).
 */
export async function createEvent(
  input: CreateEventInput,
): Promise<CreateEventResult> {
  const guard = await requireUser()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { user } = guard
  if (user.role !== "ADMIN" && !user.onboardingCompleted) {
    return { ok: false, error: "FORBIDDEN" }
  }

  const checked = checkEventInput(input)
  if (!checked.valid) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: checked.message,
      field: checked.field,
    }
  }
  const data = checked.data

  const rawPicture = (input as { picture?: unknown }).picture
  let pictureBuffer: Buffer | null = null
  if (rawPicture !== undefined && rawPicture !== null && rawPicture !== "") {
    const decoded = decodeEventPicture(rawPicture)
    if (!decoded.ok) {
      return {
        ok: false,
        error: "INVALID_PICTURE",
        message: STRINGS.addEventModal.errors.invalidPicture,
      }
    }
    pictureBuffer = decoded.buffer
  }

  try {
    const date = parseUtcDateKey(data.date)
    if (!date) return { ok: false, error: "UNEXPECTED" }
    const row = await prisma.event.create({
      data: {
        title: data.title,
        category: data.category,
        date,
        startTime: data.startTime,
        endTime: data.endTime,
        modality: data.modality,
        location: data.location,
        meetingUrl: data.meetingUrl,
        description: data.description,
        hostId: user.id,
      },
    })

    let pictureUrl: string | null = null
    if (pictureBuffer) {
      const attached = await attachEventPicture(row.id, pictureBuffer)
      if (!attached.ok) {
        await prisma.event.delete({ where: { id: row.id } })
        return { ok: false, error: "UNEXPECTED" }
      }
      pictureUrl = attached.url
    }

    return {
      ok: true,
      event: mapEventRow({
        ...row,
        pictureUrl,
        host: { id: user.id, fullName: user.fullName },
        attendees: [],
      }),
    }
  } catch {
    return { ok: false, error: "UNEXPECTED" }
  }
}

function isPrismaErrorCode(e: unknown, code: string): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: unknown }).code === code
  )
}

export type ToggleJoinInput = { eventId: unknown }

export type ToggleJoinResult =
  | { ok: true; joined: boolean }
  | {
      ok: false
      error:
        | "UNAUTHENTICATED"
        | "INVALID_INPUT"
        | "EVENT_NOT_FOUND"
        | "UNEXPECTED"
    }

/**
 * Toggles the current user's attendance on an event (US 3.2). Guard first;
 * then Zod validates `eventId` — either failure leaves Prisma untouched.
 * `userId` always comes from the session, never from `input`.
 *
 * `EventAttendee`'s primary key IS the `(eventId, userId)` pair, which is
 * what makes this design race-safe. A naive toggle would first READ whether
 * the row exists and then decide to create or delete — a
 * check-then-act shape with a TOCTOU window: two concurrent requests could
 * both read "not attending" and both attempt a `create`, and whichever one
 * loses would either crash on an unhandled unique-violation or (with a
 * sloppier check) silently produce two rows. Instead this always ATTEMPTS
 * the `create` first and lets the database itself be the single source of
 * truth for which request "won":
 *   - `create` succeeds -> the row did not exist before -> the user just
 *     joined. Returns `{ ok: true, joined: true }`.
 *   - `create` throws Prisma's unique-violation `P2002` -> the row already
 *     existed, so this click means "leave": `delete` the same composite
 *     key.
 *     - `delete` succeeds -> `{ ok: true, joined: false }`.
 *     - `delete` ALSO fails, with `P2025` ("record to delete does not
 *       exist") -> a concurrent request removed the row in the tiny window
 *       between our failed `create` and our `delete`. The end state (not
 *       attending) is exactly what that other request also produced, so
 *       this is treated as a successful leave too, not an error.
 *   - Any other error from `create` returns `UNEXPECTED` immediately;
 *     `delete` is never attempted in that case.
 *   - Any other (non-`P2025`) error from `delete` after a `P2002` also
 *     returns `UNEXPECTED`, with no error text leaked either way.
 *
 * Two rapid clicks from the SAME browser before the first request resolves
 * race the same `create`: the composite PK guarantees exactly one of them
 * succeeds, and the other falls into the `P2002` -> `delete` branch above.
 * The two requests always converge to one consistent, real database state
 * (one create followed by one delete — i.e. left not-attending) — neither
 * ever throws to the caller and neither ever reports `ok: true` with a
 * `joined` value that does not match what actually happened.
 */
export async function toggleJoin(
  input: ToggleJoinInput,
): Promise<ToggleJoinResult> {
  const guard = await requireUser()
  if (!guard.ok) return { ok: false, error: guard.error }
  const { user } = guard

  const parsed = ToggleJoinSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" }
  const { eventId } = parsed.data

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    })
    if (!event) return { ok: false, error: "EVENT_NOT_FOUND" }

    try {
      await prisma.eventAttendee.create({
        data: { eventId, userId: user.id },
      })
      revalidatePath("/calendar")
      return { ok: true, joined: true }
    } catch (createError) {
      if (!isPrismaErrorCode(createError, "P2002")) {
        return { ok: false, error: "UNEXPECTED" }
      }
      try {
        await prisma.eventAttendee.delete({
          where: { eventId_userId: { eventId, userId: user.id } },
        })
      } catch (deleteError) {
        if (!isPrismaErrorCode(deleteError, "P2025")) {
          return { ok: false, error: "UNEXPECTED" }
        }
        // Already removed by a concurrent request; the end state (not
        // attending) matches what we're about to report.
      }
      revalidatePath("/calendar")
      return { ok: true, joined: false }
    }
  } catch {
    return { ok: false, error: "UNEXPECTED" }
  }
}
