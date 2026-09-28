# Implementation report: #14 events_data_layer

Status: implemented, NOT marked done (awaiting reviewer and leader live check).

## Files
- New: `lib/eventsQuery.ts` (pure: `toCategoryKey`, `maxEventsWindow`, `clampEventsWindow`, `mapEventRow`, `collectPeople`), `lib/actions/events.ts` (`listEvents`), `tests/fixtures/selectors-golden.json`, `tests/unit/{selectors-parity,events-query,list-events,no-seed-imports}.test.ts`.
- Changed: `lib/dateUtils.ts` (`todayKeyInLima`, `utcDateKey`, `parseUtcDateKey`), `lib/types.ts` (no "me"; `modality`/`meetingUrl`/`pictureUrl` carried, not rendered), `lib/selectors.ts` (params `today`, `people`, `currentUser`; no constants for TODAY/USERS/findUser), `lib/strings.ts` (`calendarPage` error copy), `app/calendar/page.tsx`, `components/CalendarApp.tsx`, `lib/constants.ts` (only added a `SeedEvent` type for `SEED_EVENTS`, needed so the seed data still type-checks; `SEED_EVENTS`/`USERS`/`TODAY` still exported for `prisma/seed-data.ts`).
- Not touched: `proxy.ts`, `lib/auth.ts`, `prisma/**`, `supabase/**`. Note: part of the lib/action/selectors/fixture work was already on disk when this run started (from an earlier pass of this same feature); I reviewed it, verified it, and completed the rest (page, CalendarApp, constants type, tests).

## Decisions
- Props re-sync: `CalendarApp` does not copy server events into state. State only holds session-local overlays (`localEvents` = events created in the still-unpersisted Add modal; `attendeeOverrides` = locally edited attendee lists per event id). The rendered `events` is derived with `useMemo([...serverEvents, ...localEvents])` with overrides applied. So a new `events` prop after `router.refresh()` is authoritative immediately (no effect, no stale copy, no render-phase setState), and locally added events are never dropped until #15/#17 persist them. Trade-off: a local join/leave override on a server event outlives a refresh until #17 replaces it with real persistence.
- Clock/timezone: `today` is computed on the server by `todayKeyInLima(new Date())` via `Intl.DateTimeFormat` with `America/Lima` (independent of process TZ; clock injectable; tested with fake timers). Window = first day of (today's month - 3) to last day of (today's month + 3), UTC-midnight `Date`s to match `@db.Date`. `Event.date` -> key with `toISOString().slice(0,10)` (no day shift). Client parses `today` key into a local Date only for calendar math (same as the prototype's `TODAY`).
- `listEvents`: `requireUser()` first; inputs validated/swapped/clamped, never trusted; select whitelist (host `{id, fullName}`, attendees `{userId, user:{fullName}}`, no emails); any thrown error -> `{ ok:false, error:"UNEXPECTED" }` without text; no redirect. File exports only async function plus types.
- `people` = current user + all hosts and attendees, each once, as `{id,name,initials}`. Unknown host in `buildActiveEvent` -> "Desconocido"/"?" (strings), no crash. Attendee picker options come from `people`.
- Page: on `UNAUTHENTICATED` redirect `/login`; on `UNEXPECTED` renders es-PE error copy from `STRINGS.calendarPage`.
- Category: unknown DB string -> `"social"`.

## Golden master
Fixture `tests/fixtures/selectors-golden.json` was captured from the ORIGINAL selectors before the refactor (both week starts x mobile/preview variants for July 2026 month, weeks of 2026-07-24 / 07-17 / 07-01, day modal for 07-17, 07-24, empty, null; active event none/as-attendee/host "me"/attendee "me"/no-attendees; attendee options; `getEventsForDate`). I independently re-verified it in this run by extracting `lib/{selectors,constants,types,dateUtils,strings}.ts` from git HEAD into the scratchpad and running them: month (sunday and monday/mobile), week, day modal and active event outputs all matched the fixture byte-for-byte (JSON compare). The parity test feeds the refactored selectors the same events with uuid-like ids, `today` "2026-07-17", `people` = USERS with mapped ids, `currentUser` = "me" mapped to a real-looking id, and asserts deep equality (29 assertions). Intended differences only: host/attendee ids mapped back to legacy ids and the three new non-rendered event fields stripped, for the raw `getEventsForDate` comparison; every rendered view-model compares as-is with no exclusions.

## Verification
- `bash init.sh` exit 0; Vitest 15 files, 406 tests passed (310 previous + 96 new); typecheck and lint clean (one pre-existing warning in `lib/usersQuery.ts`).
- `pnpm build` passes (`/calendar` dynamic).
- Dev smoke on port 3100, no cookies: `/calendar` -> 307 to `/login`. Server stopped by PID; port 3100 free afterward; port 3000 untouched.
- Greps clean: no `SEED_EVENTS`/`USERS`/`findUser`/`TODAY`/`"me"` in `app/**`, `components/**`, `lib/**` except `lib/constants.ts`; no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase imports in `components/`; no `console.*`; no hard-coded copy added (page uses `STRINGS`).

## NOT verified by me
- Live DB read: seeded events (real ids, names, no emails in the payload) reaching the page for the clamped window; a temporary current-month event in the server-rendered month grid; events beyond the cap not delivered.
- Logged-in rendering, real-browser appearance, the error state, `router.refresh()` behavior.
- Real Prisma `findMany` behavior with the `select`/`orderBy` (only mocked).
- That the hosted DB holds the expected 12 events.
