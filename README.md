# Comuninca (Next.js)

Port of the original `Comuninca_dc.html` prototype to Next.js 16 (App Router) +
TypeScript, fully translated to Spanish. Same screens, same behavior, same
visual design — just rebuilt as an idiomatic React app instead of the original
custom template runtime.

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Any email + password logs you in (it's a
demo login, exactly like the original — no real auth).

`npm run build && npm run start` runs the production build.

## What this is

A single-page community events calendar:

- **Login** → demo auth, any credentials work.
- **Calendar** → month and week views, with a legend for six event
  categories (Social, Música, Taller, Deportes, Comida y Mercado,
  Networking).
- **Add event** → modal form with category, date/time, location,
  description, and attendee picker.
- **Day view** → clicking a day with events opens a list; clicking an empty
  day opens the add-event form pre-filled with that date.
- **Event detail** → host, attendees, and a join/leave toggle.
- **Profile menu** → shows the signed-in user, with logout.

All data (events, users) lives in React state only — there's no backend or
database, matching the original prototype. Refreshing the page resets
everything to the seed data in `lib/constants.ts`.

## Project structure

```
app/
  layout.tsx        Root layout: <html lang="es-PE">, fonts, metadata
  globals.css        Resets + shared @keyframes
  page.tsx            Renders <CalendarApp />
components/
  CalendarApp.tsx     All state + screen wiring (the "brain")
  LoginScreen.tsx, Header.tsx, CategoryLegend.tsx,
  MonthView.tsx, WeekView.tsx,
  AddEventModal.tsx, DayModal.tsx, EventDetailModal.tsx,
  ProfileMenu.tsx, Toast.tsx, Modal.tsx (shared overlay)
  *.module.css        Styles co-located per component
lib/
  types.ts             Shared TypeScript types + view-model shapes
  constants.ts         Categories, seed users/events, config, breakpoints
  dateUtils.ts         Date/time helpers (es-PE locale formatting)
  selectors.ts         Pure functions turning state into view-ready data
  strings.ts           All Spanish UI copy, in one place
```

## Notes on the Spanish translation

- All UI text, labels, placeholders, error messages, and toasts are in
  `lib/strings.ts` — if you ever want to tweak the copy or add another
  language, that's the one file to touch.
- The 12 demo events (titles, locations, descriptions) were translated too,
  not just the chrome — so the app reads naturally in Spanish end-to-end.
- Dates/times are formatted with `Intl` using the `es-PE` locale (e.g.
  "viernes, 17 de julio", "2:30 p.m.").
- The original's fixed "today" reference (17 de julio de 2026) and the
  demo "current time" used for the week view's now-line (2:30 p.m.) were
  kept as-is, so the seed data lines up exactly like the original.

## Config

Three settings that were configurable "props" on the original component are
now plain constants at the top of `lib/constants.ts` (`CONFIG`):

```ts
export const CONFIG = {
  defaultView: "month",   // "month" | "week"
  weekStart: "sunday",    // "sunday" | "monday"
  showEventPreviews: true,
};
```

## Fonts

Space Grotesk and Plus Jakarta Sans are loaded from Google Fonts via `<link>`
tags in `app/layout.tsx`, the same way the original did it. If you'd rather
self-host them for better performance, swap that for `next/font/google`.
