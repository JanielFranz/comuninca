export type CategoryKey =
  | "workshop"
  | "webinar"
  | "masterclass"
  | "networking"
  | "expoferia"
  | "voluntariado"
  | "convivencia"

export interface CategoryMeta {
  label: string
  color: string
}

export interface User {
  id: string
  name: string
  initials: string
}

export interface CurrentUser extends User {
  email: string
}

export type EventModality = "IN_PERSON" | "VIRTUAL"

export interface CalendarEvent {
  id: string
  title: string
  category: CategoryKey
  /** ISO date key, e.g. "2026-07-17" */
  date: string
  /** "HH:MM" 24h */
  startTime: string
  /** "HH:MM" 24h */
  endTime: string
  /** Empty string when the event has no physical location. */
  location: string
  description: string
  /** Carried for features #15/#16/#20; not rendered yet. */
  modality: EventModality
  meetingUrl: string | null
  /**
   * WhatsApp (or other) group link. Private: the server only fills it in for
   * the host and the people who joined; null for everyone else.
   */
  groupUrl: string | null
  pictureUrl: string | null
  /** Real User["id"] of the host. */
  hostId: string
  /** Real User["id"]s of the attendees. */
  attendeeIds: string[]
}

export type PictureStatus = "idle" | "processing" | "ready" | "error"

export interface EventFormState {
  title: string
  category: CategoryKey
  date: string
  startTime: string
  endTime: string
  modality: EventModality
  /** One input: the address (Presencial) or the optional meeting link (Virtual). */
  location: string
  /** Optional WhatsApp (or other) group link; "" when none. */
  groupUrl: string
  description: string
  error: string
  /** Base64 `data:image/jpeg;base64,...` URL once resized; "" when none (feature #16). */
  picture: string
  /** es-PE message for a picture-specific problem; "" when none. */
  pictureError: string
  /** Client-side picture pipeline state; "processing"/"error" block submission. */
  pictureStatus: PictureStatus
  /** Object URL for the thumbnail preview; "" when none. Revoked when replaced/cleared. */
  picturePreviewUrl: string
}

/**
 * A join/leave click flips this instantly so the button feels responsive,
 * ahead of the server round trip (see `applyOptimisticJoin`).
 */
export interface OptimisticJoin {
  eventId: string
  joined: boolean
  /** Group link handed back by `toggleJoin` once the join succeeded. */
  groupUrl?: string | null
}

export type CalendarView = "month" | "week"
export type WeekStart = "sunday" | "monday"

// ---- View-model shapes returned by lib/selectors.ts ----

export interface MonthCell {
  key: string
  dateStr: string
  dayNum: number
  cellBg: string
  cellOpacity: number
  numBg: string
  numColor: string
  hasCount: boolean
  count: number
  previews: { id: string; title: string; color: string }[]
  hasMore: boolean
  moreCount: number
  hasDotsOnly: boolean
  dots: string[]
  hasEvents: boolean
}

export interface WeekBlock {
  id: string
  title: string
  color: string
  bg: string
  timeLabel: string
  top: number
  height: number
  /** CSS percentage (0-100): horizontal offset within the day column, for side-by-side overlap layout (feature #18). */
  left: number
  /** CSS percentage (0-100): horizontal width within the day column, for side-by-side overlap layout (feature #18). */
  width: number
}

export interface WeekDayColumn {
  key: string
  dateStr: string
  label: string
  dayNum: number
  numBg: string
  numColor: string
  isToday: boolean
  showNow: boolean
  blocks: WeekBlock[]
}

export interface WeekHour {
  key: number
  label: string
}

export interface WeekData {
  days: WeekDayColumn[]
  hours: WeekHour[]
  nowTop: number
}

export interface CategoryOption {
  key: CategoryKey
  label: string
  dot: string
  bg: string
  border: string
  textColor: string
}

export interface AttendeeOption {
  id: string
  name: string
  initials: string
  bg: string
  border: string
  textColor: string
}

export interface DayModalEventView {
  id: string
  title: string
  color: string
  timeLabel: string
  location: string
}

export interface ActiveEventView {
  id: string | null
  title: string
  categoryLabel: string
  color: string
  tagBg: string
  dateLabel: string
  timeLabel: string
  location: string
  description: string
  /** Public Storage URL of the uploaded picture, or null when none (feature #16). */
  pictureUrl: string | null
  /** Direct pass-through from CalendarEvent; decides which location branch renders (feature #20). */
  modality: EventModality
  /** Virtual only; null for IN_PERSON or when no link was provided (feature #20). */
  meetingUrl: string | null
  /** Group link, only for the host and attendees; null for everyone else. */
  groupUrl: string | null
  hostInitials: string
  hostName: string
  attendees: { initials: string }[]
  attendeeCount: number
  noAttendees: boolean
  isGoing: boolean
  joinLabel: string
  joinBg: string
  joinColor: string
}
