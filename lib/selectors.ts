import type {
  ActiveEventView,
  AttendeeOption,
  CalendarEvent,
  CategoryKey,
  CategoryOption,
  CurrentUser,
  DayModalEventView,
  MonthCell,
  User,
  WeekData,
  WeekStart,
} from "./types"
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  DEMO_NOW_MIN,
  HOUR_PX,
  WEEKDAY_SHORT,
  WEEK_END_HOUR,
  WEEK_START_HOUR,
} from "./constants"
import {
  addDays,
  dateKey,
  fmtDayHeader,
  hexToRgba,
  parseDateKey,
  sameDay,
  startOfWeek,
  timeToMinutes,
  to12h,
} from "./dateUtils"
import { STRINGS } from "./strings"

/** Accepts the reference "today" as a Date or an ISO "YYYY-MM-DD" key. */
function toToday(today: Date | string): Date {
  return typeof today === "string" ? parseDateKey(today) : today
}

export function getEventsForDate(
  events: CalendarEvent[],
  key: string,
): CalendarEvent[] {
  return events
    .filter((e) => e.date === key)
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function weekdayLabels(weekStart: WeekStart): string[] {
  if (weekStart === "monday")
    return [...WEEKDAY_SHORT.slice(1), WEEKDAY_SHORT[0]]
  return WEEKDAY_SHORT
}

export function buildMonthCells(params: {
  currentDate: Date
  today: Date | string
  events: CalendarEvent[]
  weekStart: WeekStart
  isMobile: boolean
  showEventPreviews: boolean
}): MonthCell[] {
  const { currentDate, events, weekStart, isMobile, showEventPreviews } = params
  const today = toToday(params.today)
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startOffset =
    weekStart === "monday"
      ? (firstOfMonth.getDay() + 6) % 7
      : firstOfMonth.getDay()
  const gridStart = addDays(firstOfMonth, -startOffset)
  const allowPreviews = showEventPreviews && !isMobile

  const cells: MonthCell[] = []
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i)
    const key = dateKey(d)
    const dayEvents = getEventsForDate(events, key)
    const inMonth = d.getMonth() === month
    const isToday = sameDay(d, today)
    const previews = allowPreviews ? dayEvents.slice(0, 2) : []
    const dots = !allowPreviews
      ? dayEvents.slice(0, 4).map((e) => CATEGORY_META[e.category].color)
      : []

    cells.push({
      key,
      dateStr: key,
      dayNum: d.getDate(),
      cellBg: isToday ? "rgba(232,172,62,0.12)" : "#303030",
      cellOpacity: inMonth ? 1 : 0.4,
      numBg: isToday ? "#E8AC3E" : "transparent",
      numColor: isToday ? "#2A2A2A" : inMonth ? "#FFFFFF" : "#8C8C8C",
      hasCount: dayEvents.length > 0,
      count: dayEvents.length,
      previews: previews.map((e) => ({
        id: e.id,
        title: e.title,
        color: CATEGORY_META[e.category].color,
      })),
      hasMore:
        allowPreviews && Math.max(0, dayEvents.length - previews.length) > 0,
      moreCount: allowPreviews
        ? Math.max(0, dayEvents.length - previews.length)
        : 0,
      hasDotsOnly: dots.length > 0,
      dots,
      hasEvents: dayEvents.length > 0,
    })
  }
  return cells
}

/**
 * Per-day interval-graph column packing for overlapping week-view blocks
 * (feature #18, AC 3.3.12–3.3.15).
 *
 * Algorithm (classic interval-graph greedy column assignment, run once per
 * connected component of transitively-overlapping blocks so the whole group
 * shares one `totalColumns`):
 *  1. Sort the day's blocks by start time, tie-broken by `id` for a
 *     deterministic, stable order across renders of identical input.
 *  2. Compute connected components of the "time ranges intersect" relation
 *     via union-find. Overlap is strict: `a.startMin < b.endMin &&
 *     a.endMin > b.startMin` — a block that only touches another (A ends
 *     exactly when B starts) does not overlap it. Connectivity is transitive:
 *     chained partial overlaps (A-B overlap, B-C overlap, A-C don't) land in
 *     one component.
 *  3. Within each component (still in start-time order), sweep and assign
 *     each block the lowest-numbered column not held by a still-active
 *     block (a block is active while its end is still greater than the
 *     current block's start). This greedy sweep is optimal for interval
 *     graphs: the running peak of simultaneously active columns equals the
 *     graph's chromatic number.
 *  4. `totalColumns` for a component = the peak simultaneous-column count
 *     observed during its sweep; every block in the component shares that
 *     value. `width = 100 / totalColumns` (a solitary block gets
 *     `totalColumns = 1`, i.e. full width); `left = column * width`, so
 *     columns tile edge-to-edge with no gap.
 *
 * Minimum-readable-width decision (AC 3.3.14): exact equal-percentage
 * division always, with CSS truncation (`.blockTitle`/`.blockTime`
 * ellipsis + the block's own `overflow: hidden`) keeping the title/time
 * readable at narrow widths, rather than capping column count and letting
 * extra columns partially overlap a floor width. At the realistic event
 * density this app supports (a handful of events per day), a day column is
 * roughly 120-180px wide in the existing grid, so even a 4-way split still
 * leaves ~30-45px per card — enough for a truncated title line — and this
 * keeps the packing math exact and simple instead of introducing a second,
 * harder-to-verify degrade path for a case that in practice rarely triggers.
 */
function computeOverlapLayout(
  blocks: { id: string; startMin: number; endMin: number }[],
): Map<string, { left: number; width: number }> {
  const layout = new Map<string, { left: number; width: number }>()
  if (blocks.length === 0) return layout

  const sorted = [...blocks].sort((a, b) =>
    a.startMin !== b.startMin
      ? a.startMin - b.startMin
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  )

  const overlaps = (
    a: (typeof sorted)[number],
    b: (typeof sorted)[number],
  ): boolean => a.startMin < b.endMin && a.endMin > b.startMin

  // Union-find over the (transitive) overlap relation.
  const parent = new Map<string, string>(sorted.map((b) => [b.id, b.id]))
  const find = (id: string): string => {
    let root = id
    while (parent.get(root) !== root) root = parent.get(root) as string
    let cur = id
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (overlaps(sorted[i], sorted[j])) union(sorted[i].id, sorted[j].id)
    }
  }

  const components = new Map<string, typeof sorted>()
  for (const b of sorted) {
    const root = find(b.id)
    const list = components.get(root)
    if (list) list.push(b)
    else components.set(root, [b])
  }

  for (const comp of components.values()) {
    const active: { endMin: number; column: number }[] = []
    const columnOf = new Map<string, number>()
    let totalColumns = 0
    for (const b of comp) {
      for (let k = active.length - 1; k >= 0; k--) {
        if (active[k].endMin <= b.startMin) active.splice(k, 1)
      }
      const used = new Set(active.map((a) => a.column))
      let column = 0
      while (used.has(column)) column++
      columnOf.set(b.id, column)
      active.push({ endMin: b.endMin, column })
      totalColumns = Math.max(totalColumns, active.length)
    }
    const width = 100 / totalColumns
    for (const b of comp) {
      const column = columnOf.get(b.id) as number
      layout.set(b.id, { left: column * width, width })
    }
  }

  return layout
}

export function buildWeekData(params: {
  currentDate: Date
  today: Date | string
  events: CalendarEvent[]
  weekStart: WeekStart
}): WeekData {
  const { currentDate, events, weekStart } = params
  const today = toToday(params.today)
  const start = startOfWeek(currentDate, weekStart)
  const days = []

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i)
    const key = dateKey(d)
    const isToday = sameDay(d, today)
    const dayEvents = getEventsForDate(events, key)
    const rawBlocks = dayEvents.map((e) => {
      const meta = CATEGORY_META[e.category]
      const startMin = timeToMinutes(e.startTime) - WEEK_START_HOUR * 60
      const endMin = timeToMinutes(e.endTime) - WEEK_START_HOUR * 60
      const top = (Math.max(0, startMin) / 60) * HOUR_PX
      const height = Math.max(26, ((endMin - startMin) / 60) * HOUR_PX)
      return {
        id: e.id,
        title: e.title,
        color: meta.color,
        bg: hexToRgba(meta.color, 0.28),
        timeLabel: `${to12h(e.startTime)} – ${to12h(e.endTime)}`,
        top,
        height,
        startMin,
        endMin,
      }
    })
    const layout = computeOverlapLayout(
      rawBlocks.map((b) => ({
        id: b.id,
        startMin: b.startMin,
        endMin: b.endMin,
      })),
    )
    const blocks = rawBlocks.map((b) => {
      const pos = layout.get(b.id) ?? { left: 0, width: 100 }
      return {
        id: b.id,
        title: b.title,
        color: b.color,
        bg: b.bg,
        timeLabel: b.timeLabel,
        top: b.top,
        height: b.height,
        left: pos.left,
        width: pos.width,
      }
    })
    days.push({
      key,
      dateStr: key,
      label: WEEKDAY_SHORT[d.getDay()],
      dayNum: d.getDate(),
      numBg: isToday ? "#E8AC3E" : "transparent",
      numColor: isToday ? "#2A2A2A" : "#FFFFFF",
      isToday,
      showNow: isToday,
      blocks,
    })
  }

  const hours = []
  for (let h = WEEK_START_HOUR; h < WEEK_END_HOUR; h++) {
    const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "a.m." : "p.m."}`
    hours.push({ key: h, label })
  }

  const nowMinutesFromStart = DEMO_NOW_MIN - WEEK_START_HOUR * 60
  const nowTop = (nowMinutesFromStart / 60) * HOUR_PX

  return { days, hours, nowTop }
}

export function buildCategoryOptions(
  selectedCategory: CategoryKey,
): CategoryOption[] {
  return CATEGORY_ORDER.map((key) => {
    const meta = CATEGORY_META[key]
    const selected = key === selectedCategory
    return {
      key,
      label: meta.label,
      dot: meta.color,
      bg: selected ? hexToRgba(meta.color, 0.22) : "transparent",
      border: selected ? meta.color : "rgba(140,140,140,0.35)",
      textColor: selected ? "#FFFFFF" : "#8C8C8C",
    }
  })
}

export function buildAttendeeOptions(
  selectedIds: string[],
  people: User[],
): AttendeeOption[] {
  return people.map((u: User) => {
    const selected = selectedIds.indexOf(u.id) >= 0
    return {
      id: u.id,
      name: u.name,
      initials: u.initials,
      bg: selected ? "rgba(232,172,62,0.18)" : "transparent",
      border: selected ? "#E8AC3E" : "rgba(140,140,140,0.35)",
      textColor: selected ? "#FFFFFF" : "#8C8C8C",
    }
  })
}

export function buildDayModalEvents(
  events: CalendarEvent[],
  dayModalDate: string | null,
): DayModalEventView[] {
  if (!dayModalDate) return []
  return getEventsForDate(events, dayModalDate).map((e) => {
    const meta = CATEGORY_META[e.category]
    return {
      id: e.id,
      title: e.title,
      color: meta.color,
      timeLabel: `${to12h(e.startTime)} – ${to12h(e.endTime)}`,
      location: e.location || STRINGS.eventDetailModal.locationTBA,
    }
  })
}

export function buildActiveEvent(
  events: CalendarEvent[],
  activeEventId: string | null,
  people: User[],
  currentUser: CurrentUser | null,
): ActiveEventView {
  const ev = events.find((e) => e.id === activeEventId)
  const t = STRINGS.eventDetailModal

  if (!ev) {
    return {
      id: null,
      title: "",
      categoryLabel: "",
      color: "#E8AC3E",
      tagBg: "rgba(232,172,62,0.18)",
      dateLabel: "",
      timeLabel: "",
      location: "",
      description: "",
      pictureUrl: null,
      modality: "IN_PERSON",
      meetingUrl: null,
      hostInitials: "",
      hostName: "",
      attendees: [],
      attendeeCount: 0,
      noAttendees: true,
      isGoing: false,
      joinLabel: t.joinEvent,
      joinBg: "#E8AC3E",
      joinColor: "#2A2A2A",
    }
  }

  const meta = CATEGORY_META[ev.category]
  const me = currentUser
    ? { id: currentUser.id, name: currentUser.name, initials: currentUser.initials }
    : null
  const resolve = (id: string): User | undefined =>
    me && id === me.id ? me : people.find((u) => u.id === id)
  const hostIsMe = Boolean(me) && ev.hostId === me?.id
  const host = resolve(ev.hostId) ?? {
    name: t.unknownHost,
    initials: t.unknownHostInitials,
  }
  const attendees = ev.attendeeIds
    .map(resolve)
    .filter((u): u is User => Boolean(u))
  const isGoing = Boolean(me) && ev.attendeeIds.indexOf(me?.id ?? "") >= 0
  const d = parseDateKey(ev.date)

  return {
    id: ev.id,
    title: ev.title,
    categoryLabel: meta.label,
    color: meta.color,
    tagBg: hexToRgba(meta.color, 0.22),
    dateLabel: fmtDayHeader(d),
    timeLabel: `${to12h(ev.startTime)} – ${to12h(ev.endTime)}`,
    location: ev.location || t.locationTBA,
    description: ev.description || t.noDescription,
    pictureUrl: ev.pictureUrl,
    modality: ev.modality,
    meetingUrl: ev.meetingUrl,
    hostInitials: host.initials,
    hostName: hostIsMe ? STRINGS.fallbackUserName : host.name,
    attendees: attendees.map((a) => ({ initials: a.initials })),
    attendeeCount: attendees.length,
    noAttendees: attendees.length === 0,
    isGoing,
    joinLabel: isGoing ? t.youAreGoing : t.joinEvent,
    joinBg: isGoing ? "transparent" : "#E8AC3E",
    joinColor: isGoing ? "#8C8C8C" : "#2A2A2A",
  }
}
