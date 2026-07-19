import type { WeekStart } from "./types";

const LOCALE = "es-PE";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a Date as a "YYYY-MM-DD" key used to index events. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(str: string): Date {
  const [y, m, day] = str.split("-").map(Number);
  return new Date(y, m - 1, day);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

export function startOfWeek(d: Date, weekStart: WeekStart): Date {
  const dow = d.getDay();
  const diff = weekStart === "monday" ? (dow + 6) % 7 : dow;
  return addDays(d, -diff);
}

/** "14:30" -> "2:30 p.m." */
export function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "p.m." : "a.m.";
  let hr = h % 12;
  if (hr === 0) hr = 12;
  return `${hr}${m ? ":" + pad(m) : ""} ${period}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function addMinutesStr(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let total = h * 60 + m + mins;
  total = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** "July 2026" -> "julio de 2026" */
export function fmtMonthYear(d: Date): string {
  return d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** "Friday, July 17" -> "viernes, 17 de julio" */
export function fmtDayHeader(d: Date): string {
  return d.toLocaleDateString(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "Jul 17 – Jul 23, 2026" -> "17 jul. – 23 jul. 2026" */
export function fmtWeekRange(start: Date, end: Date): string {
  const a = start.toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
  const b = end.toLocaleDateString(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${a} – ${b}`;
}

export function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

let uidCounter = 1;
export function nextId(): string {
  return `ev${Date.now()}-${uidCounter++}`;
}
