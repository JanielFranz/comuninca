/** Pure helpers for the calendar data layer (no I/O). */
import { CATEGORY_ORDER, DEFAULT_CATEGORY } from "./constants"
import { parseUtcDateKey, utcDateKey } from "./dateUtils"
import { STRINGS } from "./strings"
import type {
  CalendarEvent,
  CategoryKey,
  EventModality,
  User,
} from "./types"
import { displayName, initialsFor } from "./userDisplay"

/** How many calendar months around today's month may be fetched. */
export const EVENTS_WINDOW_MONTHS = 3

export interface EventsWindow {
  from: string
  to: string
}

/** Maps a free-form DB category to a known key; unknown -> DEFAULT_CATEGORY. */
export function toCategoryKey(value: unknown): CategoryKey {
  return (CATEGORY_ORDER as readonly unknown[]).includes(value)
    ? (value as CategoryKey)
    : DEFAULT_CATEGORY
}

/**
 * Hard cap for any fetch: from the first day of the month 3 months before
 * today's month to the last day of the month 3 months after it.
 */
export function maxEventsWindow(todayKey: string): EventsWindow {
  const today = parseUtcDateKey(todayKey)
  if (!today) throw new Error("Invalid today key")
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth()
  const from = new Date(Date.UTC(y, m - EVENTS_WINDOW_MONTHS, 1))
  // Day 0 of the following month = last day of the target month.
  const to = new Date(Date.UTC(y, m + EVENTS_WINDOW_MONTHS + 1, 0))
  return { from: utcDateKey(from), to: utcDateKey(to) }
}

/**
 * Validates and clamps a requested window. Untrusted input: malformed values
 * fall back to the cap, reversed ranges are swapped, and the result never
 * exceeds `maxEventsWindow(todayKey)`. Keys compare lexicographically.
 */
export function clampEventsWindow(
  todayKey: string,
  input?: { from?: unknown; to?: unknown },
): EventsWindow {
  const max = maxEventsWindow(todayKey)
  const requestedFrom = parseUtcDateKey(input?.from) ? String(input?.from) : max.from
  const requestedTo = parseUtcDateKey(input?.to) ? String(input?.to) : max.to
  const [lo, hi] =
    requestedFrom <= requestedTo
      ? [requestedFrom, requestedTo]
      : [requestedTo, requestedFrom]
  const clamp = (k: string) => (k < max.from ? max.from : k > max.to ? max.to : k)
  return { from: clamp(lo), to: clamp(hi) }
}

export interface EventRow {
  id: string
  title: string
  category: string
  date: Date
  startTime: string
  endTime: string
  modality: EventModality
  location: string | null
  meetingUrl: string | null
  groupUrl: string | null
  description: string
  pictureUrl: string | null
  host: { id: string; fullName: string }
  attendees: { userId: string; user: { fullName: string } }[]
}

/**
 * The group link is private: only the host and the people who joined may
 * receive it. Fails closed — with no `viewerId` nobody does.
 */
function canSeeGroupUrl(row: EventRow, viewerId: string | undefined): boolean {
  if (viewerId === undefined) return false
  return (
    row.host.id === viewerId || row.attendees.some((a) => a.userId === viewerId)
  )
}

/** `viewerId` is the signed-in user; it decides whether `groupUrl` is revealed. */
export function mapEventRow(row: EventRow, viewerId?: string): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    category: toCategoryKey(row.category),
    date: utcDateKey(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location ?? "",
    description: row.description,
    modality: row.modality,
    meetingUrl: row.meetingUrl,
    groupUrl: canSeeGroupUrl(row, viewerId) ? row.groupUrl : null,
    pictureUrl: row.pictureUrl,
    hostId: row.host.id,
    attendeeIds: row.attendees.map((a) => a.userId),
  }
}

export function toPerson(id: string, fullName: string, email = ""): User {
  const name = displayName(fullName, email) || STRINGS.fallbackUserName
  return {
    id,
    name,
    initials: initialsFor(name) || initialsFor(STRINGS.fallbackUserName),
  }
}

/** Every distinct host/attendee of the rows plus the current user. */
export function collectPeople(
  rows: EventRow[],
  currentUser: { id: string; fullName: string; email: string },
): User[] {
  const people = new Map<string, User>()
  people.set(
    currentUser.id,
    toPerson(currentUser.id, currentUser.fullName, currentUser.email),
  )
  for (const row of rows) {
    if (!people.has(row.host.id)) {
      people.set(row.host.id, toPerson(row.host.id, row.host.fullName))
    }
    for (const a of row.attendees) {
      if (!people.has(a.userId)) {
        people.set(a.userId, toPerson(a.userId, a.user.fullName))
      }
    }
  }
  return [...people.values()]
}
