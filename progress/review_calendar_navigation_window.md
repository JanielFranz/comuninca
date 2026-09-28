# Review — feature 19 calendar_navigation_window

**Verdict:** APPROVED (pending items recorded — see "Pending live/manual checks")

## Summary of verification performed

- Read `.opencode/agent/reviewer.md`, `.opencode/rules/architecture.md`,
  `.opencode/rules/conventions.md`, `.opencode/rules/verification.md`,
  `CHECKPOINTS.md`, `AGENTS.md`, `progress/impl_calendar_navigation_window.md`,
  `docs/user-stories.md` AC 3.3.5/3.3.7–3.3.11, `feature_list.json` #19/#14.
- Executed `bash init.sh` → exit 0 (ESLint clean, 4 pre-existing unrelated
  warnings only, TypeScript clean, **601/601 vitest tests green**, "23
  features, 18 done, 1 in progress").
- Executed `pnpm build` (`next build`, Turbopack) → compiled successfully,
  `/calendar` listed as a dynamic (`ƒ`) route.
- Read `lib/dateUtils.ts` (lines 171–288), `components/CalendarApp.tsx` (full
  file), `app/calendar/page.tsx` (full file), `components/Header.tsx`,
  `components/Header.module.css`,
  `tests/unit/calendar-navigation-window.test.ts` (full file, 36 tests).
- Ran an independent executable probe (`pnpm exec tsx`, written and deleted
  from the session scratchpad, never inside the repo) that imports the real
  `lib/dateUtils.ts` and re-derives the window/clamp/boundary math from
  scratch, independent of the implementer's own test file — see evidence
  under AC 3.3.7/3.3.8/3.3.9 below.
- Compared file mtimes to isolate this feature's implementation window
  (`stat -c '%y'`): every file this feature touched clusters at
  **2026-09-27 18:29:03 – 18:35:26**; every file the brief said must stay
  untouched (`lib/auth.ts` 16:13, `prisma/schema.prisma` 09-26 10:10,
  `lib/eventsQuery.ts` 16:49, `lib/actions/*.ts` all ≤16:33, `lib/types.ts`
  16:54, `lib/strings.ts` 16:33) sits well before that window — same
  technique used for the #17/#18 reviews.

## Acceptance criteria (feature_list.json #19)

- "Navigation past either edge is blocked/disabled; 'Hoy' snaps back into the
  window" → **met**. Evidence: `isPrevDisabled`/`isNextDisabled` in
  `components/CalendarApp.tsx:247-262` are both driven by `computeNavStep`
  (`lib/dateUtils.ts:273-287`) returning `null` at either edge, and wired to
  the `disabled` attribute in `components/Header.tsx:54,65`. `goToday`
  (`CalendarApp.tsx:212-214`) is unconditional. Probed by hand with real
  `Date.now()` (2026-09-27): window = exactly `2026-06`..`2026-12` (`monthKey`
  matched exactly). `clampMonthDate` returns the **same object reference**
  when in-window (`Object.is`/`.toBe` check passed both in the test file,
  `tests/unit/calendar-navigation-window.test.ts:36,42,48`, and in my probe).
  May 2026 clamps to `2026-06-01` exactly; January 2027 clamps to
  `2026-12-01` exactly (probe-verified field-by-field: year/month/day, not
  just `monthKey`).
- "Week view respects the same boundary; an out-of-range URL param is
  clamped, not a 500" → **met**. Evidence: `isWeekInWindow`
  (`lib/dateUtils.ts:226-232`) implements exactly the stated two-sided rule
  (`monthKey(weekEnd) < monthKey(min)` OR `monthKey(weekStart) > monthKey(max)`),
  confirmed navigable for a week straddling the near boundary
  (`2026-05-29`..`2026-06-04`, test at line 97-100 + my probe) and the far
  boundary (`2026-12-28`..`2027-01-03`, test at line 102-105 + my probe), and
  blocked for weeks fully outside on either side (probe: `2026-05-25` weekStart
  blocked, `2027-01-04` weekStart blocked). `app/calendar/page.tsx:37-39`
  routes any `date`/`view` param through `parseCalendarDateParam`/
  `parseViewParam`, which structurally cannot throw (see below) and never
  calls `redirect()`/`notFound()` for a malformed value — only for the
  pre-existing `UNAUTHENTICATED` path at line 23, which predates this
  feature.

## Deep-dive per the assignment's 10 points

1. **init.sh / pnpm test / pnpm build / ESLint** — confirmed: 601/601 tests
   (565 pre-existing + 36 new, matches the implementer's claim exactly), `next
   build` succeeds, ESLint shows the same 4 pre-existing warnings only
   (`app/layout.tsx` font, `AddEventModal.tsx` `<img>`, two stale
   `eslint-disable` directives in `lib/usersQuery.ts` /
   `tests/unit/selectors-parity.test.ts`) — none in touched files, no new
   `react-hooks/set-state-in-effect`. I read the effect body myself
   (`CalendarApp.tsx:273-279`): it only calls `typeof window` check, `new
   URL(...)`, `url.searchParams.set(...)`, and `window.history.replaceState(...)`
   — no `setState`/`patchState` call anywhere in the effect, so the rule
   correctly does not fire. Confirmed structurally, not just by trusting the
   claim.

2. **Window/clamp math, traced by hand + an executed probe outside the
   test file** — with real `today` = 2026-09-27, the window is exactly
   `2026-06` through `2026-12` (verified via `monthKey(addMonths(anchor, ±3))`
   against the actual `Date` object, not a re-derivation of the source under
   test). `clampMonthDate` returns the identical `Date` reference in-window
   (`===`/`.toBe` both in-repo test and my probe). May 2026 → June 1 2026;
   January 2027 → December 1 2026, both checked field-by-field
   (`getFullYear`/`getMonth`/`getDate`), not just via `monthKey` string
   comparison, ruling out an off-by-one in the reconstructed `Date`. The
   Nov→Feb and Feb→Nov year-rollover cases both go through real `addMonths`
   (`Date.setMonth` arithmetic, `lib/dateUtils.ts:33-37`), not manual
   month-number math — confirmed by reading `windowEdges`
   (`lib/dateUtils.ts:186-192`), which calls `addMonths(anchor, ±3)`
   directly, and independently reproduced with `today` = Nov 2026 (window
   `2026-08`..`2027-02`) and `today` = Feb 2026 (window `2025-11`..`2026-05`)
   in my probe — both produced the exact correct absolute year/month, no
   negative or 13+ month-number artifacts possible since no raw month-number
   arithmetic exists in the source.

3. **`isWeekInWindow` boundary logic** — read at `lib/dateUtils.ts:218-232`:
   implemented exactly as `monthKey(weekEnd) < monthKey(min) → false`,
   `monthKey(weekStart) > monthKey(max) → false`, else `true` — this is
   precisely "blocked only if every day is outside", not a stricter/looser
   variant. Verified a real near-boundary straddle (May 29 – Jun 4, 2026:
   `isWeekInWindow` → `true`) and a real far-boundary straddle (Dec 28, 2026 –
   Jan 3, 2027 → `true`), both via the in-repo test and my independent probe.

4. **`parseCalendarDateParam`/`parseViewParam` never throw** — read the full
   implementation (`lib/dateUtils.ts:234-261`). `parseViewParam` is a single
   strict-equality ternary (`value === "week" ? "week" : "month"`); `===` never
   throws for any operand type (string, array, number, object, `null`,
   `undefined`, `Symbol`, function), so this is unconditionally safe by
   construction. `parseCalendarDateParam` gates every subsequent operation
   behind `typeof value === "string"` before any string method or regex is
   applied, so non-string inputs (`null`, arrays, numbers, objects, symbols,
   functions) short-circuit straight to the `today` fallback with no property
   access that could throw; the regex `^\d{4}-\d{2}-\d{2}$` is anchored and
   bounded, so pathological/very-long strings just fail the match cheaply; a
   calendar-invalid date like `"2026-02-30"`/`"2026-13-40"` is caught by the
   `dateKey(parsed) === value` round-trip (native `Date` rollover changes the
   key, so it no longer matches the input and falls back) rather than any
   manual validation that could itself throw. I fuzzed this function myself
   in the executed probe with ~28 inputs including `null`, `undefined`,
   `NaN`/`Infinity`, `Symbol()`, functions, a 100 000-char string, an
   `<script>` string, and a SQL-injection-shaped string — zero throws, every
   result a valid, in-window `Date`. The in-repo test file also explicitly
   asserts `.not.toThrow()` for its fallback table
   (`tests/unit/calendar-navigation-window.test.ts:140`), satisfying the
   security-relevant non-throw property, not just the fallback value.

5. **`computeNavStep` single source of truth** — confirmed by reading
   `CalendarApp.tsx:220-262`: `goPrev`/`goNext` (inside the `patchState`
   functional updater, operating on `s.currentDate`) and
   `isPrevDisabled`/`isNextDisabled` (computed each render from
   `state.currentDate`) both call the exact same `computeNavStep(direction,
   ..., state.calendarView, todayDate, CONFIG.weekStart)` with the same
   argument shape — there is no second, independently-written boundary check
   anywhere in the file. A `null` result from a click is a genuine no-op
   (`patchState` returns `{}`, an identity merge), so even if a disabled
   button were force-clicked via devtools it stays inert. One
   non-blocking observation: `isPrevDisabled`/`isNextDisabled` read from the
   outer-scope `state.currentDate` (the just-rendered value) while
   `goPrev`/`goNext` read `s.currentDate` inside the functional updater; in
   ordinary single-click use these are always the same value at click time,
   and the functional-update form is actually the *safer* choice under rapid
   double-clicks (it can never move further than the boundary allows since
   each call re-checks `computeNavStep` against the latest `s`), so this is
   not a bug — just worth naming since the assignment specifically asked to
   check for drift.

6. **`app/calendar/page.tsx`** — `searchParams` is typed as
   `Promise<Record<string, string | string[] | undefined>>` and correctly
   `await`ed (line 19), matching Next 16's async API and the pattern already
   used by `app/admin/users/page.tsx`/`app/admin/codes/page.tsx`. A
   `string[]` value (e.g. `?date=a&date=b`) is handled with no special-case
   code because `parseCalendarDateParam`/`parseViewParam` already treat any
   non-exact-string as "absent" (verified in point 4, and directly with array
   inputs in both the unit tests and my probe). No `redirect()`/error is
   thrown for any `date`/`view` value — the only `redirect()` in the file
   (line 23) guards the pre-existing `UNAUTHENTICATED` case, not date
   parsing. `listEvents()` (line 20) is called with **no arguments**, exactly
   as before this feature (confirmed via `lib/actions/events.ts` mtime
   16:33:16, well outside this feature's 18:29-18:35 implementation window) —
   `initialDate`/`initialView` only affect what `CalendarApp` initially
   *displays* from data that was already going to be fetched; they never
   reach `listEvents`. The separation is real, not accidentally coupled.

7. **URL sync review** — `CalendarApp.tsx:273-279`. The `typeof window ===
   "undefined"` guard is defensive/technically unnecessary in a Client
   Component (React never runs effect bodies during SSR — they only fire
   after mount in the browser), but it's harmless and costs nothing; either
   way the effect body itself is correct. It calls **only**
   `window.history.replaceState` — no `router.push`/`router.replace`/any
   `next/navigation` import is used for this purpose (`useRouter` is still
   imported and used elsewhere in the file for `router.refresh()`/`router.push("/login")`
   on logout, which is unrelated and pre-existing). The dependency array
   `[currentDateKey, state.calendarView]` is correct — `currentDateKey =
   dateKey(state.currentDate)` is a primitive computed fresh each render, not
   a stale closure over an old `Date` object, and `state.calendarView` is the
   other piece of state the URL needs to reflect. The URL is built from `new
   URL(window.location.href)` and only the two params are set via
   `searchParams.set`, so any other existing query param would be preserved
   (there currently are none on `/calendar`, but the mechanism doesn't
   clobber them). `replaceState`, not `pushState`, is used, correctly
   matching the design decision. My own view on the UX tradeoff (non-blocking):
   `replaceState` is the right call here — every Prev/Next/Today click would
   otherwise stack a browser-history entry, making the back button require N
   presses to leave the calendar entirely; the URL is still bookmarkable via
   copy-paste and correct on reload, which is what AC 3.3.7-3.3.11 actually
   need. `pushState` would only matter if "back" were expected to step
   through calendar periods, which no AC asks for.

8. **`Header.tsx`/`.module.css`** — `disabled={isPrevDisabled}` /
   `disabled={isNextDisabled}` are real `disabled` attributes on the
   `<button>` elements (`Header.tsx:54,65`), not just a CSS class — a
   genuinely disabled `<button>` cannot fire `onClick` at all, so this is not
   just visual. `.navButton:disabled` sets `opacity: 0.35` and `cursor:
   not-allowed`; `.navButton:disabled:hover` clears the hover background
   (`Header.module.css:65-72`) — dimmed and hover-affordance-free as
   required. "Hoy" (`Header.tsx:60-62`) has **no** `disabled` prop passed at
   all — not "currently `false`" but structurally absent from the JSX — so it
   can never be disabled by any code path in this component.

9. **Tests quality** — no test found that would still pass under a broken
   implementation: `clampMonthDate` in-window case uses reference equality
   (`.toBe`), not just value equality, which would catch an unnecessary
   reconstruction; edge-exactly-3-months tests use concrete `monthKey`
   assertions, not just booleans; the year-rollover tests
   (`tests/unit/calendar-navigation-window.test.ts:63-79`) set `today` to
   November and February respectively — genuine dates that force a real
   December→January and December→November crossing, not the fixed `TODAY`
   constant reused to dodge the edge case. `parseCalendarDateParam`'s
   never-throws property is asserted with an explicit
   `expect(() => ...).not.toThrow()` for every garbage input in its
   `it.each` table (line 140), in addition to checking the fallback value —
   satisfying both properties the assignment called out. Minor,
   non-blocking: `parseViewParam`'s fallback table doesn't carry an explicit
   `.not.toThrow()` assertion, but (per point 4) that function has no
   possible throw path for any input type, so this is stylistic, not a real
   gap.

10. **Layering and hygiene** — no Prisma/Supabase import under `components/`
    (`grep` clean). No new `redirect(` (only the pre-existing
    `UNAUTHENTICATED` one). No `any` / `console.*` in `lib/dateUtils.ts` or
    `components/CalendarApp.tsx` (grep clean). File-mtime isolation (see
    "Summary" above) confirms `proxy.ts`, `lib/auth.ts`, `prisma/**`,
    `supabase/**`, `lib/actions/*`, `lib/eventsQuery.ts`, `lib/types.ts`, and
    `lib/strings.ts` were all last modified well before this feature's
    18:29–18:35 window — none of them were touched by this feature.
    `lib/types.ts` genuinely didn't need a change: `grep -rn "interface
    \w+Props" components/` shows **every** component's prop type (including
    `HeaderProps`, `EventDetailModalProps`, etc.) is defined inline in its own
    file — `lib/types.ts` contains zero `*Props` interfaces for any component
    in this codebase, so adding `initialDate?`/`initialView?` inline to
    `CalendarAppProps` in `CalendarApp.tsx` (lines 115-131) is fully
    consistent with the established convention, not an inconsistency.

## Checkpoints

- C1: [x] — harness files present, `bash init.sh` exit 0.
- C2: [x] — exactly one feature (`#19`) `in_progress`; its `depends_on: [14]`
  is `done`; `progress/current.md` reflects the active session accurately.
- C3: [x] — layering holds (see point 10); no `redirect()`/`notFound()`
  introduced in a Server Action (this feature adds no Server Action at all);
  no secret touched; all copy pre-existing (`lib/strings.ts` untouched, see
  point 10); dates/times still go through `lib/dateUtils.ts`; no
  `console.log`; pnpm-managed, no lockfile drift observed in this feature's
  files.
- C4: [x] — 36 new tests cover every new unit with concrete assertions plus
  explicit error/fallback paths (point 9); no real Supabase/Postgres call
  anywhere in the new test file (it's pure, zero mocks needed); `pnpm test`
  601/601 green; `pnpm lint`/`tsc --noEmit` clean.
- C5: [ ] ← Reason: not a defect in this feature's own work, but the
  checkpoint is evaluated at session-closure time, and per the implementer's
  own report and `progress/current.md`, the session is **not yet closed** —
  the feature is intentionally still `in_progress` pending this review and
  the leader's live-browser check, so `progress/history.md` has no entry for
  it yet and `feature_list.json` still (correctly) shows `status:
  "in_progress"`. This is expected at this point in the workflow, not a
  finding against the implementation; the leader should mark this `[x]` once
  the live checks below pass and closure step (§5 of AGENTS.md) is run.

## Required changes

None. No defect found in the reviewed logic, tests, or layering.

## Observations (non-blocking)

1. `isPrevDisabled`/`isNextDisabled` read `state.currentDate` from the outer
   render closure while `goPrev`/`goNext` read `s.currentDate` inside the
   `patchState` functional updater — see point 5. Not a bug (the functional
   form is actually the safer choice under rapid clicks), just worth the
   leader's awareness since the assignment specifically asked to check for
   this drift class of bug.
2. `parseViewParam`'s fallback test table has no explicit `.not.toThrow()`
   assertion (unlike `parseCalendarDateParam`'s). Harmless given the
   function's implementation can structurally never throw, but adding the
   assertion would make the intent explicit and future-proof it against a
   later refactor that adds real parsing logic.
3. The `typeof window === "undefined"` guard in the URL-sync effect is
   defensive rather than load-bearing in a Client Component — fine to keep,
   just not strictly necessary.

## Pending live/manual checks (leader / user, real authenticated browser)

The implementer's own report already flags these as unverified; I concur
these cannot be proven from unit tests or a probe alone and must be checked
in a real authenticated session before this feature is marked `done`:

1. **Disabled state at the true edges**: navigate to the earliest allowed
   month (`today's month − 3`) and confirm "Anterior" renders visually
   dimmed/disabled and a real click (including a forced click via devtools on
   the disabled element) does not move the calendar; repeat for "Siguiente"
   at `today's month + 3`. Also check the week-view equivalent at a week
   fully outside the window.
2. **"Hoy" reachability**: from at least one out-of-today period reachable
   inside the window, click "Hoy" and confirm it snaps back to today's period
   (month or week, matching the active view) with no dead zone.
3. **URL bar + network tab**: after each of Prev/Next/Today/view-toggle,
   confirm the address bar shows `?date=...&view=...` reflecting the new
   state, with **no visible page reload/flicker** and **no new network
   request** in devtools' Network tab (proving `history.replaceState` is
   actually used at runtime, not just in source).
4. **Clamped load from a raw URL, authenticated**: load
   `/calendar?date=2020-01-01` and confirm the calendar renders clamped to
   the earliest allowed month (not blank, not a 500, not the literal
   requested out-of-range period); load `/calendar?view=bogus` and confirm it
   renders in month view (the default), not an error or blank state.

Only once all four pass (and the leader records the evidence) should
`feature_list.json` #19 move to `status: "done"` and the C5 checkpoint above
be closed out.
