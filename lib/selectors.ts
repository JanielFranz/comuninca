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
} from "./types";
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  DEMO_NOW_MIN,
  HOUR_PX,
  TODAY,
  USERS,
  WEEKDAY_SHORT,
  WEEK_END_HOUR,
  WEEK_START_HOUR,
  findUser,
} from "./constants";
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
} from "./dateUtils";
import { STRINGS } from "./strings";

export function getEventsForDate(events: CalendarEvent[], key: string): CalendarEvent[] {
  return events
    .filter((e) => e.date === key)
    .slice()
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function weekdayLabels(weekStart: WeekStart): string[] {
  if (weekStart === "monday") return [...WEEKDAY_SHORT.slice(1), WEEKDAY_SHORT[0]];
  return WEEKDAY_SHORT;
}

export function buildMonthCells(params: {
  currentDate: Date;
  events: CalendarEvent[];
  weekStart: WeekStart;
  isMobile: boolean;
  showEventPreviews: boolean;
}): MonthCell[] {
  const { currentDate, events, weekStart, isMobile, showEventPreviews } = params;
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startOffset =
    weekStart === "monday" ? (firstOfMonth.getDay() + 6) % 7 : firstOfMonth.getDay();
  const gridStart = addDays(firstOfMonth, -startOffset);
  const allowPreviews = showEventPreviews && !isMobile;

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const key = dateKey(d);
    const dayEvents = getEventsForDate(events, key);
    const inMonth = d.getMonth() === month;
    const isToday = sameDay(d, TODAY);
    const previews = allowPreviews ? dayEvents.slice(0, 2) : [];
    const dots = !allowPreviews
      ? dayEvents.slice(0, 4).map((e) => CATEGORY_META[e.category].color)
      : [];

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
      hasMore: allowPreviews && Math.max(0, dayEvents.length - previews.length) > 0,
      moreCount: allowPreviews ? Math.max(0, dayEvents.length - previews.length) : 0,
      hasDotsOnly: dots.length > 0,
      dots,
      hasEvents: dayEvents.length > 0,
    });
  }
  return cells;
}

export function buildWeekData(params: {
  currentDate: Date;
  events: CalendarEvent[];
  weekStart: WeekStart;
}): WeekData {
  const { currentDate, events, weekStart } = params;
  const start = startOfWeek(currentDate, weekStart);
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const key = dateKey(d);
    const isToday = sameDay(d, TODAY);
    const dayEvents = getEventsForDate(events, key);
    const blocks = dayEvents.map((e) => {
      const meta = CATEGORY_META[e.category];
      const startMin = timeToMinutes(e.startTime) - WEEK_START_HOUR * 60;
      const endMin = timeToMinutes(e.endTime) - WEEK_START_HOUR * 60;
      const top = (Math.max(0, startMin) / 60) * HOUR_PX;
      const height = Math.max(26, ((endMin - startMin) / 60) * HOUR_PX);
      return {
        id: e.id,
        title: e.title,
        color: meta.color,
        bg: hexToRgba(meta.color, 0.28),
        timeLabel: `${to12h(e.startTime)} – ${to12h(e.endTime)}`,
        top,
        height,
      };
    });
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
    });
  }

  const hours = [];
  for (let h = WEEK_START_HOUR; h < WEEK_END_HOUR; h++) {
    const label = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "a.m." : "p.m."}`;
    hours.push({ key: h, label });
  }

  const nowMinutesFromStart = DEMO_NOW_MIN - WEEK_START_HOUR * 60;
  const nowTop = (nowMinutesFromStart / 60) * HOUR_PX;

  return { days, hours, nowTop };
}

export function buildCategoryOptions(selectedCategory: CategoryKey): CategoryOption[] {
  return CATEGORY_ORDER.map((key) => {
    const meta = CATEGORY_META[key];
    const selected = key === selectedCategory;
    return {
      key,
      label: meta.label,
      dot: meta.color,
      bg: selected ? hexToRgba(meta.color, 0.22) : "transparent",
      border: selected ? meta.color : "rgba(140,140,140,0.35)",
      textColor: selected ? "#FFFFFF" : "#8C8C8C",
    };
  });
}

export function buildAttendeeOptions(selectedIds: string[]): AttendeeOption[] {
  return USERS.map((u: User) => {
    const selected = selectedIds.indexOf(u.id) >= 0;
    return {
      id: u.id,
      name: u.name,
      initials: u.initials,
      bg: selected ? "rgba(232,172,62,0.18)" : "transparent",
      border: selected ? "#E8AC3E" : "rgba(140,140,140,0.35)",
      textColor: selected ? "#FFFFFF" : "#8C8C8C",
    };
  });
}

export function buildDayModalEvents(
  events: CalendarEvent[],
  dayModalDate: string | null
): DayModalEventView[] {
  if (!dayModalDate) return [];
  return getEventsForDate(events, dayModalDate).map((e) => {
    const meta = CATEGORY_META[e.category];
    return {
      id: e.id,
      title: e.title,
      color: meta.color,
      timeLabel: `${to12h(e.startTime)} – ${to12h(e.endTime)}`,
      location: e.location || STRINGS.eventDetailModal.locationTBA,
    };
  });
}

export function buildActiveEvent(
  events: CalendarEvent[],
  activeEventId: string | null,
  currentUser: CurrentUser | null
): ActiveEventView {
  const ev = events.find((e) => e.id === activeEventId);
  const t = STRINGS.eventDetailModal;

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
      hostInitials: "",
      hostName: "",
      attendees: [],
      attendeeCount: 0,
      noAttendees: true,
      isGoing: false,
      joinLabel: t.joinEvent,
      joinBg: "#E8AC3E",
      joinColor: "#2A2A2A",
    };
  }

  const meta = CATEGORY_META[ev.category];
  const hostIsMe = ev.hostId === "me";
  const host = hostIsMe
    ? currentUser || { name: "Tú", initials: "YO" }
    : findUser(ev.hostId) || { name: "Desconocido", initials: "?" };
  const attendees = ev.attendeeIds
    .map((id) => (id === "me" ? currentUser || { name: "Tú", initials: "YO" } : findUser(id)))
    .filter((u): u is User | CurrentUser => Boolean(u));
  const isGoing = ev.attendeeIds.indexOf("me") >= 0;
  const d = parseDateKey(ev.date);

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
    hostInitials: host.initials,
    hostName: hostIsMe ? "Tú" : host.name,
    attendees: attendees.map((a) => ({ initials: a.initials })),
    attendeeCount: attendees.length,
    noAttendees: attendees.length === 0,
    isGoing,
    joinLabel: isGoing ? t.youAreGoing : t.joinEvent,
    joinBg: isGoing ? "transparent" : "#E8AC3E",
    joinColor: isGoing ? "#8C8C8C" : "#2A2A2A",
  };
}
