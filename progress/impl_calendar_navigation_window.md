# Implementation report — Feature #19: calendar_navigation_window

Status: implemented, **NOT marked `done`** (awaiting reviewer + the leader's
live-browser check per the implementer protocol).

## Files touched

- `lib/dateUtils.ts` — new pure helpers (no I/O), all exported, all
  unit-tested:
  - `NAVIGATION_WINDOW_MONTHS = 3` — documented as kept in sync BY DESIGN with
    `EVENTS_WINDOW_MONTHS` in `lib/eventsQuery.ts` (feature #14's data-fetch
    window). Not itself imported by `eventsQuery.ts` — they are independent
    constants with the same value, per the brief's instruction not to touch
    `listEvents`/the fetch window.
  - `monthKey(d): string` — `"YYYY-MM"`, zero-padded so it sorts lexically
    (mirrors the existing `utcDateKey`/lexical-compare pattern already used
    in `lib/eventsQuery.ts`'s `clampEventsWindow`).
  - `isMonthInWindow(date, today): boolean`
  - `clampMonthDate(date, today): Date` — returns `date` unchanged (same
    reference) when in-window; otherwise the earliest/latest allowed month's
    1st-of-month `Date`.
  - `isWeekInWindow(weekStart, today): boolean` — a week is blocked only if
    its last day's month is before the window start, or its first day's
    month is after the window end; a week straddling either boundary stays
    navigable.
  - `parseViewParam(value): CalendarView` — `"week"` only for the exact
    string `"week"`; anything else (including arrays, numbers, wrong case)
    falls back to `"month"`. Never throws.
  - `parseCalendarDateParam(value, today): Date` — validates
    `"YYYY-MM-DD"` with a regex, round-trips it through `parseDateKey` +
    `dateKey` to reject calendar-invalid dates (e.g. `"2026-13-40"`, which
    would otherwise silently roll over via native `Date` arithmetic), falls
    back to `today` on any failure, and **always** runs the result through
    `clampMonthDate` before returning — so the fallback path is clamped too
    (harmless, since `today` is always in-window by construction). Never
    throws for any input type.
  - `computeNavStep(direction, currentDate, view, today, weekStart): Date | null`
    — the single pure decision function for "what would a Prev/Next click do
    right now": returns the candidate new `currentDate`, or `null` if that
    click would be a no-op at the window's edge. `CalendarApp` uses the same
    function both to perform the navigation and to compute
    `isPrevDisabled`/`isNextDisabled`, so the two can never drift apart.
- `app/calendar/page.tsx` — now takes `searchParams: Promise<Record<string, string | string[] | undefined>>` (Next 16 pattern, matching the existing `app/admin/users/page.tsx` / `app/admin/codes/page.tsx`), awaits it, and computes `initialDate`/`initialView` via the new helpers from `result.today` (the same Lima "today" `listEvents()` already computes — no duplicate clock read) before passing them to `CalendarApp` as two new props. `listEvents()` itself is untouched — still called with no arguments, still fetches the whole ±3-month window regardless of which period is being viewed. Malformed/array searchParam values are handled by simply passing the raw value into `parseCalendarDateParam`/`parseViewParam`, which already treat anything non-string (including arrays) as "absent" and fall back to a safe default — no separate array-unwrapping code needed, and this exactly matches the acceptance tests' expectations for array inputs.
- `components/CalendarApp.tsx` — touched beyond the initially-listed files, same precedent as feature #17 (the brief pre-authorized this):
  - `CalendarAppProps` gains optional `initialDate?: string` / `initialView?: CalendarView`.
  - `initialState()` now seeds `currentDate`/`calendarView` from those props, falling back to `today`/`CONFIG.defaultView` when absent (keeps the function safely callable with only `today`, e.g. if some future caller omits the new props).
  - `goPrev`/`goNext` now route through `computeNavStep`; a `null` result is a no-op (`patchState` returns `{}`, an identity merge) — defense-in-depth for a disabled button somehow still firing a click.
  - `goToday` is unconditional, using a `todayDate` parsed once per render from the `today` prop (never itself needs clamping — it's always in-window).
  - Two new derived booleans, `isPrevDisabled`/`isNextDisabled`, computed every render via the same `computeNavStep`, passed to `Header`.
  - A new `useEffect` keyed on `[currentDateKey, state.calendarView]` (where `currentDateKey = dateKey(state.currentDate)`, a primitive, not the `Date` object itself) calls `window.history.replaceState(null, "", url)` after cloning `window.location` and setting `date`/`view` search params. **Not** `router.push`/`router.replace` — seespec below.
  - Import list changed: `addDays`/`addMonths` (no longer used directly in this file — `computeNavStep` owns that math) replaced by `computeNavStep`.
  - `lib/types.ts` was **not** touched — `CalendarView` already existed and needed no changes.
- `components/Header.tsx` — two new required boolean props `isPrevDisabled`/`isNextDisabled`, set as `disabled={...}` on the Prev/Next `<button>`s. "Hoy" is never disabled (no prop for it). No new user-facing copy.
- `components/Header.module.css` — added `.navButton:disabled` (dimmed via `opacity: 0.35`, `cursor: not-allowed`) and `.navButton:disabled:hover` (suppresses the hover background so a disabled button gives no hover affordance).
- `tests/unit/calendar-navigation-window.test.ts` — new file, 36 tests (see below).

## Key decisions

1. **Window math via lexical `"YYYY-MM"` string comparison**, not `Date`
   subtraction — mirrors the existing `clampEventsWindow`/`utcDateKey`
   pattern in `lib/eventsQuery.ts` for consistency and because it sorts
   correctly across year boundaries without any date-arithmetic edge cases
   (verified by the two explicit year-rollover tests, Nov→Feb and Feb→Nov).
2. **`clampMonthDate` returns the exact same `Date` reference when in-window**
   (not a normalized copy) — matches the brief's literal wording ("returns
   `date` unchanged") and is asserted with `.toBe(date)` (reference
   equality) in the tests, not just value equality.
3. **`isWeekInWindow`'s two-sided check** (`monthKey(weekEnd) < min` OR
   `monthKey(weekStart) > max`) is exactly the boundary rule the brief
   specifies, and both the near-boundary and far-boundary straddling cases
   are tested explicitly to prove a week is never wrongly blocked just
   because *part* of it is outside the window.
4. **`computeNavStep` is the single source of truth** for both "does this
   click move anything" and "should the button be disabled" — this was a
   deliberate design choice (over duplicating the boundary check in two
   places) specifically so the disabled-state and the actual no-op behavior
   can never disagree with each other.
5. **`history.replaceState`, not `router.push`/`router.replace`.** Next's
   App Router client APIs would trigger a full navigation/refetch of
   `app/calendar/page.tsx` (a new `listEvents()` DB round trip) on every
   single Prev/Next/Today/view-toggle click. Since feature #14 already loads
   the entire ±3-month window client-side, no new data is ever needed for an
   in-window navigation — only the URL bar needs to reflect the new
   position, purely for bookmarking/sharing and so a hard reload lands on
   the same period. `history.replaceState` is a native browser API call
   inside a `useEffect`, not a `setState` call, so it does not trip this
   repo's `react-hooks/set-state-in-effect` rule (confirmed: `bash init.sh`'s
   ESLint step is clean, no new warnings).
6. **`app/calendar/page.tsx` reuses `result.today`** (already computed by
   `listEvents()`) instead of calling `todayKeyInLima()` a second time —
   avoids a redundant Lima-clock read and guarantees the navigation window
   and the data-fetch window are always computed from the identical "today".
7. Passing the raw (possibly array-typed) `searchParams` values straight into
   `parseCalendarDateParam`/`parseViewParam` rather than pre-unwrapping
   arrays: both helpers already treat any non-exact-string input (arrays
   included) as "absent" and fall back safely, which is both simpler and
   exactly what the acceptance tests for array inputs expect.

## Tests

`tests/unit/calendar-navigation-window.test.ts`, 36 tests, all pure
(no mocks): `monthKey`; `isMonthInWindow`/`clampMonthDate` (current month,
exactly ±3 months at both edges, 4 months over at both edges, and two
explicit January/December year-rollover cases in each direction);
`isWeekInWindow` (fully inside, fully 4+ months before/after — blocked —
and straddling both the near and the far boundary — navigable);
`parseViewParam` (`"week"`, and a fallback-to-`"month"` table covering
`"month"`, `undefined`, `""`, wrong case, an array, and a number);
`parseCalendarDateParam` (valid in-window pass-through, valid-but-out-of-window
clamp, and a never-throws fallback-to-`today` table covering `undefined`,
`""`, a garbage string, an impossible calendar date, an array, and a number —
each case explicitly asserts `.not.toThrow()` in addition to the returned
value); `computeNavStep` (month-view no-op at both edges and normal move in
both directions; week-view no-op at both edges and normal 7-day move in both
directions).

## Verification

- `bash init.sh` → exit 0. ESLint clean (only 4 pre-existing warnings in
  unrelated files — `app/layout.tsx` font warning, `AddEventModal.tsx`
  `<img>` warning, two stale `eslint-disable` directives in
  `lib/usersQuery.ts` / `tests/unit/selectors-parity.test.ts` — none touched
  by this feature; no new warnings, in particular no
  `react-hooks/set-state-in-effect`). TypeScript typecheck clean.
  **601/601 tests** (565 existing + 36 new), all green.
- `pnpm build` (`next build`, Turbopack) → compiled successfully, typechecked,
  all routes generated, including `/calendar` as a dynamic (`ƒ`) route.
- Greps: no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase imports
  under `components/`; no `console.*` in any touched file; touched-file scope
  matches the brief (`app/calendar/page.tsx`, `components/Header.tsx`(+css),
  `lib/dateUtils.ts`, `components/CalendarApp.tsx`, plus the new test file
  and `progress/*`) — `lib/types.ts` was not touched (not needed).
- Smoke check: built the production bundle and ran `next start -p 3300`
  (port 3000 — the human user's dev server — was never touched); confirmed
  `GET /calendar`, `GET /calendar?date=2020-01-01`, and
  `GET /calendar?view=bogus` all return `307` (redirect to `/login`, since
  the request is unauthenticated) and **not a 500** in any case, proving the
  route itself doesn't crash on these inputs at the framework/proxy level.
  Stopped that server afterward; nothing else was left running.

## NOT verified by me (for the leader's live-browser check)

Per the brief, these require a real authenticated session in a real browser
against the hosted project, which I did not attempt (no DB/session
interaction needed for this feature's core logic, and I was instructed not
to run the app against the real hosted project myself):

- Prev is visually disabled exactly at month−3 / a fully-outside week, and
  Next likewise at month+3, in the actual rendered UI (I verified the
  underlying boolean logic exhaustively in tests, not the rendered
  `disabled` attribute/CSS in a live page).
- Both buttons are true no-ops even if somehow clicked while disabled.
- "Hoy" always returns to today's period from any reachable position, in a
  live session.
- The URL bar actually reflects `?date=...&view=...` after navigating and
  updates via `history.replaceState` with no visible page reload, flicker,
  or network request (I confirmed the effect is wired correctly and doesn't
  trigger a Next Router navigation, but did not observe it in a real browser
  devtools Network tab).
- Loading `/calendar?date=2020-01-01` and `/calendar?view=bogus` **while
  authenticated** renders the calendar clamped to the nearest allowed edge /
  falls back to month view, rather than erroring or showing an empty/wrong
  period (my smoke check only reached the unauthenticated redirect; the
  clamping logic itself is proven only by the unit tests).
