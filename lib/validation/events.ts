import { z } from "zod"
import { CATEGORY_ORDER } from "@/lib/constants"
import { parseUtcDateKey, timeKeyInLima, todayKeyInLima } from "@/lib/dateUtils"
import { STRINGS } from "@/lib/strings"
import type { CategoryKey, EventModality } from "@/lib/types"

const t = STRINGS.addEventModal.errors

export const EVENT_TITLE_MAX = 120
export const EVENT_LOCATION_MAX = 200
export const EVENT_DESCRIPTION_MAX = 2000
export const EVENT_MEETING_URL_MAX = 500

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const HTTP_URL_PREFIX = /^https?:\/\//i

/** Absolute http(s) URL, no credentials, no whitespace, bounded length. */
export function isValidMeetingUrl(value: string): boolean {
  if (value.length === 0 || value.length > EVENT_MEETING_URL_MAX) return false
  if (/\s/.test(value) || !HTTP_URL_PREFIX.test(value)) return false
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return false
    if (url.username !== "" || url.password !== "") return false
    if (/[\p{Cc}\p{Cf}]/u.test(value)) return false
    return url.hostname !== ""
  } catch {
    return false
  }
}

/**
 * Group link (WhatsApp, Telegram, Discord...): same rules as the meeting link —
 * an absolute http(s) URL, so `javascript:` and similar can never be stored.
 */
export const isValidGroupUrl = isValidMeetingUrl

/** Only invisible/format/control/blank-glyph characters: nothing visible. */
const INVISIBLE_ONLY = /^[\s\p{Cf}\p{Cc}\u115F\u1160\u3164\uFFA0\u2800]*$/u
const ANY_CONTROL = /\p{Cc}/u
/** Description may keep line breaks and tabs, no other control character. */
const CONTROL_EXCEPT_BREAKS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/

/** Non-strings (missing, null, objects) count as empty; so does text with no visible glyph. */
const text = z.preprocess(
  (v) =>
    typeof v === "string" && !INVISIBLE_ONLY.test(v.trim()) ? v.trim() : "",
  z.string(),
)
/** Like `text` but keeps invisible-only input so link validation rejects it. */
const rawText = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : ""),
  z.string(),
)

const isCategory = (v: string): v is CategoryKey =>
  (CATEGORY_ORDER as readonly string[]).includes(v)
const isModality = (v: string): v is EventModality =>
  v === "IN_PERSON" || v === "VIRTUAL"

export type EventField =
  | "title"
  | "category"
  | "date"
  | "startTime"
  | "endTime"
  | "modality"
  | "location"
  | "meetingUrl"
  | "groupUrl"
  | "description"

export interface EventData {
  title: string
  category: CategoryKey
  /** "YYYY-MM-DD" */
  date: string
  startTime: string
  endTime: string
  modality: EventModality
  /** Presencial only; null for Virtual. */
  location: string | null
  /** Virtual only, http(s); null otherwise. */
  meetingUrl: string | null
  /** Optional group link (either modality), http(s); null when not provided. */
  groupUrl: string | null
  description: string
}

/**
 * One schema for client and server. `now` is injectable so the "past" rules
 * (evaluated on the Lima clock) are testable; unknown keys are stripped.
 * Rule precedence: required fields, past date, past start time, end after
 * start; the issue list is ordered so the first issue is the one to show.
 */
export function createEventSchema(now: Date = new Date()) {
  return z
    .preprocess(
      // Non-object input counts as an empty form (never raw Zod text).
      (v) =>
        typeof v === "object" && v !== null && !Array.isArray(v) ? v : {},
      z.object({
        title: text,
        category: text,
        date: text,
        startTime: text,
        endTime: text,
        modality: text,
        location: text,
        meetingUrl: rawText,
        groupUrl: rawText,
        description: text,
      }),
    )
    .superRefine((v, ctx) => {
      const fail = (message: string, path: EventField) => {
        ctx.addIssue({ code: "custom", message, path: [path] })
      }
      const inPerson = v.modality === "IN_PERSON"
      const required: [EventField, boolean][] = [
        ["title", v.title !== "" && !ANY_CONTROL.test(v.title)],
        ["category", isCategory(v.category)],
        ["date", parseUtcDateKey(v.date) !== null],
        ["startTime", TIME_PATTERN.test(v.startTime)],
        ["endTime", TIME_PATTERN.test(v.endTime)],
        ["modality", isModality(v.modality)],
        [
          "location",
          !inPerson || (v.location !== "" && !ANY_CONTROL.test(v.location)),
        ],
        [
          "description",
          v.description !== "" && !CONTROL_EXCEPT_BREAKS.test(v.description),
        ],
      ]
      const missing = required.find(([, ok]) => !ok)
      if (missing) return fail(t.required, missing[0])

      const today = todayKeyInLima(now)
      if (v.date < today) return fail(t.pastDate, "date")
      if (v.date === today && v.startTime < timeKeyInLima(now)) {
        return fail(t.pastStart, "startTime")
      }
      if (v.endTime <= v.startTime) return fail(t.endBeforeStart, "endTime")

      if (v.title.length > EVENT_TITLE_MAX) return fail(t.titleTooLong, "title")
      if (inPerson && v.location.length > EVENT_LOCATION_MAX) {
        return fail(t.locationTooLong, "location")
      }
      if (v.description.length > EVENT_DESCRIPTION_MAX) {
        return fail(t.descriptionTooLong, "description")
      }
      if (
        !inPerson &&
        v.meetingUrl !== "" &&
        !isValidMeetingUrl(v.meetingUrl)
      ) {
        return fail(t.invalidMeetingUrl, "meetingUrl")
      }
      if (v.groupUrl !== "" && !isValidGroupUrl(v.groupUrl)) {
        return fail(t.invalidGroupUrl, "groupUrl")
      }
    })
    .transform((v): EventData => ({
      title: v.title,
      category: v.category as CategoryKey,
      date: v.date,
      startTime: v.startTime,
      endTime: v.endTime,
      modality: v.modality as EventModality,
      location: v.modality === "IN_PERSON" ? v.location : null,
      meetingUrl:
        v.modality === "VIRTUAL" && v.meetingUrl !== "" ? v.meetingUrl : null,
      groupUrl: v.groupUrl !== "" ? v.groupUrl : null,
      description: v.description,
    }))
}

export const EVENT_ID_MAX_LENGTH = 100

/** `toggleJoin`'s only input: a non-empty, reasonably-bounded event id. */
export const ToggleJoinSchema = z.object({
  eventId: z.string().min(1).max(EVENT_ID_MAX_LENGTH),
})

export type EventCheck =
  | { valid: true; data: EventData }
  | { valid: false; message: string; field?: EventField }

/** Validates the form; on failure only the FIRST message (es-PE). */
export function checkEventInput(
  input: unknown,
  now: Date = new Date(),
): EventCheck {
  const parsed = createEventSchema(now).safeParse(input)
  if (parsed.success) return { valid: true, data: parsed.data }
  const issue = parsed.error.issues[0]
  const field = issue?.path[0]
  return {
    valid: false,
    message: issue?.message ?? t.required,
    field: typeof field === "string" ? (field as EventField) : undefined,
  }
}
