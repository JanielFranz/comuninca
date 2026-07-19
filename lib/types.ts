export type CategoryKey =
  | "social"
  | "music"
  | "workshop"
  | "sports"
  | "food"
  | "networking";

export interface CategoryMeta {
  label: string;
  color: string;
}

export interface User {
  id: string;
  name: string;
  initials: string;
}

export interface CurrentUser extends User {
  email: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: CategoryKey;
  /** ISO date key, e.g. "2026-07-17" */
  date: string;
  /** "HH:MM" 24h */
  startTime: string;
  /** "HH:MM" 24h */
  endTime: string;
  location: string;
  description: string;
  /** "me" for the signed-in user, otherwise a User["id"] */
  hostId: string;
  attendeeIds: string[];
}

export interface EventFormState {
  title: string;
  category: CategoryKey;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  attendeeIds: string[];
  error: string;
}

export type CalendarView = "month" | "week";
export type WeekStart = "sunday" | "monday";
export type Screen = "login" | "calendar";

// ---- View-model shapes returned by lib/selectors.ts ----

export interface MonthCell {
  key: string;
  dateStr: string;
  dayNum: number;
  cellBg: string;
  cellOpacity: number;
  numBg: string;
  numColor: string;
  hasCount: boolean;
  count: number;
  previews: { id: string; title: string; color: string }[];
  hasMore: boolean;
  moreCount: number;
  hasDotsOnly: boolean;
  dots: string[];
  hasEvents: boolean;
}

export interface WeekBlock {
  id: string;
  title: string;
  color: string;
  bg: string;
  timeLabel: string;
  top: number;
  height: number;
}

export interface WeekDayColumn {
  key: string;
  dateStr: string;
  label: string;
  dayNum: number;
  numBg: string;
  numColor: string;
  isToday: boolean;
  showNow: boolean;
  blocks: WeekBlock[];
}

export interface WeekHour {
  key: number;
  label: string;
}

export interface WeekData {
  days: WeekDayColumn[];
  hours: WeekHour[];
  nowTop: number;
}

export interface CategoryOption {
  key: CategoryKey;
  label: string;
  dot: string;
  bg: string;
  border: string;
  textColor: string;
}

export interface AttendeeOption {
  id: string;
  name: string;
  initials: string;
  bg: string;
  border: string;
  textColor: string;
}

export interface DayModalEventView {
  id: string;
  title: string;
  color: string;
  timeLabel: string;
  location: string;
}

export interface ActiveEventView {
  id: string | null;
  title: string;
  categoryLabel: string;
  color: string;
  tagBg: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  description: string;
  hostInitials: string;
  hostName: string;
  attendees: { initials: string }[];
  attendeeCount: number;
  noAttendees: boolean;
  isGoing: boolean;
  joinLabel: string;
  joinBg: string;
  joinColor: string;
}
