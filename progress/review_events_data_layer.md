# Review — feature 14 events_data_layer

**Verdict:** APPROVED (pending live and manual checks listed at the end)

Depends on #8 (done). Status is `in_progress` (only one). No application file was edited by me; my scratch reconstructions and probes were created outside the repo and deleted.

## Executed evidence

- `bash init.sh` exit 0. ESLint 0 errors (3 warnings: `app/layout.tsx` font, `lib/usersQuery.ts:17` unused disable, `tests/unit/selectors-parity.test.ts:69` unused disable, which is new in this feature and harmless). Typecheck clean.
- `vitest`: 15 files, 406 passed. Per-file counts: the 11 pre-existing files add to exactly 310 (44+51+15+7+40+49+40+3+27+28+6), new files add 96 (events-query 41, list-events 20, no-seed-imports 6, selectors-parity 29). No pre-existing test file touches selectors, so none was adapted or weakened.
- `pnpm build` passes; `/calendar` is dynamic (ƒ). Port 3000 was free during my build.
- Dev smoke on my own port 3100, no cookies: `/calendar` and `/calendar/x` return 307 to `/login`. I stopped only the tree I started (PID 22124); 3100 is free again, 3000 untouched.
- Golden master reconstructed independently (details in section 2 below).
- Timezone and window probes under `TZ=UTC`, `America/Lima`, `Pacific/Auckland`, `Asia/Kolkata`: identical output (md5 equal across all four).

## Acceptance criteria

1. "The calendar renders events from Postgres; SEED_EVENTS is no longer imported by app code"
   - Static part: **met** (executed). `grep` for `SEED_EVENTS|USERS|findUser|TODAY|"me"` over `app/ components/ lib/ proxy.ts` finds nothing outside `lib/constants.ts`; `tests/unit/no-seed-imports.test.ts` passes; `app/calendar/page.tsx:9-27` reads via `listEvents()` and passes `events/people/today` to `CalendarApp` (`components/CalendarApp.tsx:100-110`).
   - "renders events from Postgres": **proven only with a mocked Prisma** (`tests/unit/list-events.test.ts`). The real `findMany` with this `select`/`orderBy` and the hosted DB is **NOT executed by me** -> leader's live check.
2. "Month and week views show the seeded events exactly like the prototype did"
   - Selector/view-model level: **met** (executed). Original selectors run from git reproduce all 26 fixture keys exactly; refactored selectors reproduce them in the parity test. `MonthView.tsx`/`WeekView.tsx` are byte-unchanged since the initial commit (mtime 10:10, untouched by this feature) and receive the same view-model shapes (`MonthCell[]`, `WeekData`).
   - Real rendering with real DB rows and the browser look: **not executed** -> leader live check + user's browser check.

## 2. Golden master integrity

- `git log` shows `lib/{selectors,constants,types,dateUtils,strings}.ts` were last committed in `a2c30a4`; the working-tree diffs of selectors/constants/types are entirely this feature, so `git show HEAD:` is the pre-#14 version. (`dateUtils`/`strings` also carry earlier features' additions, irrelevant to selectors; I used HEAD versions for the original run.)
- I ran the ORIGINAL `buildMonthCells` (sunday/monday x mobile false/true/no-previews), `buildWeekData` (2026-07-24, 07-17, 07-01, both week starts), `buildDayModalEvents` (07-17, 07-24, 07-02 empty, null), `getEventsForDate` (3 days), `buildActiveEvent` (none, ev1, host "me", attendee "me", no attendees), `buildAttendeeOptions` (none, u1+u3) with `TODAY`=2026-07-17, and compared with `JSON.stringify` to `tests/fixtures/selectors-golden.json`: **26 keys, 0 mismatches, no extra keys.** The fixture contains nothing the original code does not produce. (The fixture's current user was name "Tú", initials "TU"; the same values reproduce it.)
- Refactored side: the parity test compares view models with `toEqual` and no field exclusions. The id renaming (`u1..u4/me` -> uuid-like) is applied consistently to events, `people` and `me`, and only the raw `getEventsForDate` check maps ids back and strips the three new fields. The renaming cannot hide a difference in rendered view models because ids there are either not output or (attendee options) mapped back for a deep compare; the `dayModal` and `activeEvent` outputs contain no host/attendee ids. Not hidden.
- The diff of `lib/selectors.ts` (git diff) touches only: `today` param (`toToday`), `people` param, host/attendee resolution in `buildActiveEvent`. Week packing, times, colors, sort are untouched, so untested inputs (equal start times, multi-hour spans, host missing from `people`) cannot differ from the original except:
  - host missing from `people`: the original used `findUser(...) || {name:"Desconocido",initials:"?"}`; now `STRINGS.unknownHost` ("Desconocido"/"?") — same text, covered by a robustness test (`selectors-parity.test.ts` bottom).
  - equal start times: `getEventsForDate` sorts stably by `startTime`; with DB data the input order is `date, startTime, id` (id asc), whereas the prototype used seed array order. The 12 seeded events have no same-day equal start times, so no visible difference for the seed, but for future data the tie order is by id, not creation order (see Observation 3).
  - `hostName` for the host being the current user: original hard-coded "Tú"; now `STRINGS.fallbackUserName` ("Tú"): identical.

## 3. Window, clock, timezone (executed)

- `todayKeyInLima`: 2026-10-01T03:00Z -> 2026-09-30; 2026-10-01T04:59:59Z -> 2026-09-30; 2026-10-01T05:00Z -> 2026-10-01; 2026-09-30T04:59:59Z -> 2026-09-29; 2026-09-30T05:00Z -> 2026-09-30; 2026-01-01T04:59:59Z -> 2025-12-31; 2026-12-31T23:59:59-05:00 -> 2026-12-31; 2027-01-01T00:00-05:00 -> 2027-01-01; identical in all four process timezones.
- `maxEventsWindow`: 09-30 -> 2026-06-01..2026-12-31; 10-01 -> 2026-07-01..2027-01-31; 2026-01-01 -> 2025-10-01..2026-04-30; 2026-12-31 -> 2026-09-01..2027-03-31; 03-31 -> 2025-12-01..2026-06-30 (no month overflow on 31st, year rollovers OK).
- `clampEventsWindow` with far past/future, reversed, malformed dates (`2026-02-30`, `2026-13-01`, `2026-9-1`, trailing space, full-width digits), arrays, numbers, `null`, `undefined`, `{}`, a string and `[]`: always inside the cap and `from <= to`; plus a 20,000-case random fuzz (random today over 10 years, random from/to over 70 years): 0 violations. Reversed inner ranges are swapped, valid inner ranges honored.
- `lib/actions/events.ts:44-47`: `where: { date: { gte, lte } }` with `gte/lte` from `parseUtcDateKey` (UTC-midnight `Date`); asserted in `list-events.test.ts` ("defaults to the full clamped range...", gte/lte ISO equality).
- `Event.date` -> key uses `toISOString().slice(0,10)` (`lib/eventsQuery.ts` `mapEventRow`): no day shift regardless of process TZ.

## 4. Data exposure and access control

- `select` whitelist (`lib/actions/events.ts:49-70`): event scalars, `host {id, fullName}`, `attendees {userId, user {fullName}}`. No email/role/onboardingCompleted anywhere; asserted by an exact-keys test plus `not.toMatch(/email/i)` on the select.
- Guard: `requireUser()` is the first statement (`events.ts:33`); on failure returns typed error and Prisma is untouched even with garbage input (tested). Errors return `{ok:false,error:"UNEXPECTED"}` with no text; no `redirect(` in `lib/actions/*.ts`.
- Page redirects on `UNAUTHENTICATED` (`page.tsx:12`), first passes `requireOnboardedUserOrRedirect`; proxy still gates `/calendar` (smoke: 307 to `/login`).
- What reaches the client (`page.tsx:20-26`): `user` = `{id, fullName, email}` of the current user only (their own email, already used for the profile menu), `events` = mapped `CalendarEvent[]` (no Prisma row spread), `people` = `{id,name,initials}`, `today`. Nothing else. Note: `meetingUrl` and `pictureUrl` of every event are in the payload for every authenticated user; that matches AC 3.1.11/3.4.1 (link shown to other users in event detail) so acceptable.
- Exposing every attendee's full name to every authenticated user: acceptable for a community calendar (AC 3.4.1 requires an attendee list in the detail); only names/initials, never emails. The whole window's attendee names are shipped up front, not only for opened events; fine at this scale, revisit if privacy requirements change.

## 5. CalendarApp by reading

- `events` is a `useMemo` over `[serverEvents, localEvents, attendeeOverrides]` (`CalendarApp.tsx` ~ "Derived" section): no props copied into state, no effect, no render-phase setState; a new `events` prop after `router.refresh()` is authoritative immediately. Ids of local events (`ev<timestamp>-n`) cannot collide with `seed-event-NN`/cuid ids; local events are appended after server events and then sorted per day by start time in `getEventsForDate`. Overrides keyed by an id that disappears from the server are ignored (harmless).
- Effects: one mount effect with resize/keydown listeners (`[]` deps, same as original); no loops. `toggleJoin` reads the derived `events` const declared later in the render body, valid because it runs after render.
- `today`/hydration: `initialState(today)` builds a local-time `Date` from the key (`parseDateKey`), so server render and browser render produce the same month regardless of either TZ. `viewportWidth` starts at 1280 and is corrected in an effect, same as the original (`HEAD:components/CalendarApp.tsx:113`). Nothing in the render path calls `new Date()`; `nextId()` uses `Date.now()` only inside the submit handler. `goToday` uses the server `today`.
- Form default date and initial `currentDate` come from props; new local events use `hostId: user.id`; `toggleJoin` uses `user.id`; attendee options come from `people`; unknown host handled (no crash, tested); no reference to removed constants.
- Browser-only risks (not proven): the attendee picker lists `people` (hosts/attendees in the window plus the current user); (a) it includes the current user themself, unlike the prototype's `USERS`, and (b) users who neither host nor attend anything in the window cannot be picked. A local join/leave override outlives `router.refresh()` and masks the server list for that event until #17. Navigation beyond +-3 months shows empty months (window navigation clamp is feature #19).

## 6. Layering and hygiene

- No Prisma/Supabase/`server-only` imports in `components/`, `lib/eventsQuery.ts`, `lib/selectors.ts`, `lib/dateUtils.ts` (grep empty). `lib/eventsQuery.ts` imports only `constants`, `dateUtils`, `strings`, `types`, `userDisplay`: pure.
- `lib/actions/events.ts` exports only `listEvents` (async) and the `ListEventsResult` type.
- No `console.*`, no `any`; new copy is `STRINGS.calendarPage.errorTitle/errorHint` ("No pudimos cargar el calendario." / "Intenta recargar la página en unos minutos.", accents correct); `STRINGS.unknownHost` etc. in strings.
- `proxy.ts`, `lib/auth.ts`, `prisma/**`, `supabase/**`: these are untracked from earlier features so git cannot diff them, but their mtimes (proxy 16:11, auth 16:13, schema/migrations 10:10-15:25) all predate this feature's files (16:49-16:52). `git status --short prisma/migrations` empty. No secret-like strings in the new files. No leftover temp files; `git status` count unchanged by my run (50 non-progress entries before and after).
- Doc/state: `feature_list.json` feature 14 is `in_progress`; the `progress/history.md` entry for #14 does not exist yet (expected before closure).

## 7. Tests quality

- `list-events.test.ts` and `events-query.test.ts` assert concrete values (exact where, exact select keys, orderBy, result mapping, error paths, guard-untouched-Prisma). I found no test that stays green with an obviously broken implementation, with these caveats: `findMany` is mocked, so a wrong Prisma relation name or a runtime `select` rejection would not be caught (live check).
- `no-seed-imports.test.ts` regex (`/import\s+(?:type\s+)?\{...\}\s+from\s+"...constants"/`) I verified by executing it on samples: it catches the named imports (including multi-line and `type`), but MISSES `import * as C from ".../constants"`, `export { SEED_EVENTS } from ".../constants"`, `await import(".../constants")`, `import D, { TODAY } from ".../constants"` and a specifier ending `constants.ts`; it also does not scan `proxy.ts`. The greps above show no such use today, so this is a gap in future protection only (Observation 1).
- Parity test: see section 2; it would fail if any selector output changed, since the fixture matches the true original.

## Checkpoints

- C1: [x] harness files present, `bash init.sh` exit 0.
- C2: [x] one `in_progress` feature (#14), dependency #8 done. `progress/current.md` describes the active session (leader closes after live check).
- C3: [x] layering holds (components without Prisma; pure selectors/date helpers/eventsQuery; guard first in the action; no redirect in actions; all copy in `strings.ts`; no secrets, no `console`).
- C4: [x] unit tests assert concrete results with error paths; Prisma/Supabase mocked; suite passes offline (406/406); lint and typecheck clean.
- C5: [ ] pending, not a defect: the `progress/history.md` entry and the `done` flip are to be done at closure by the leader after the live check. No suspicious untracked files.

## Required changes

None.

## Observations (non-blocking)

1. Harden `no-seed-imports.test.ts`: also match `import * as`, `export ... from`, dynamic `import()`, default+named imports, and scan `proxy.ts`; alternatively a simple text scan of the four banned identifiers outside `lib/constants.ts`, `prisma/**`, `tests/**`.
2. `DEMO_NOW_MIN` (14:30) still drives the week view "now" line (`lib/selectors.ts:168`); with real dates the line shows a fixed 14:30 rather than the real time. Prototype behavior kept as instructed ("rendering stays as-is"); worth a follow-up.
3. Same-day equal start times are ordered by event id (DB `orderBy` `id asc`), not creation order. Overlap packing (#18) will need to be deterministic anyway.
4. Two auth lookups per page load (`requireOnboardedUserOrRedirect` plus `requireUser` inside `listEvents`): deliberate defense in depth, as in #12.
5. Attendee picker includes the current user and only people seen in the window (section 5). Session-local join overrides survive `router.refresh()` until #17.
6. Unused eslint-disable directive at `tests/unit/selectors-parity.test.ts:69` (lint warning).

## Pending live / manual checks

Leader's live check on the hosted project (each must assert):
- Signed-in USER (onboarded) and ADMIN: `/calendar` HTML/RSC payload contains exactly the 12 seeded events (`seed-event-01..12`) in the clamped window, with real host ids and full names (Ava Reyes, Marco Tanaka, Priya Kapoor, Jonas Berg) and attendee ids/names; zero occurrences of any email address other than the viewer's own, no `role`/`onboardingCompleted` fields; `today` equals the Lima date; window strings equal first-of-(month-3)..last-of-(month+3).
- A temporary event in the current month (and one on the last day of the window, one just outside it: month+4 day 1 and month-4 last day): current-month event appears in the server-rendered month grid; the boundary event is delivered; the outside ones are NOT in the payload; then delete them.
- Real `findMany` works with the whitelisted `select` and `orderBy` (no Prisma validation error, the page does not show the error state).
- Anonymous request to `/calendar` redirected to `/login` (already smoke-tested without cookies by me: 307).

User's browser check (not executable here): calendar appearance identical to the prototype, month and week views, day modal, event detail (host name, attendee initials, "Ya vas" join toggle local-only), add-event modal with attendee picker from `people`, no hydration warning in the console, logout.
