# Review — feature 17 join_leave_event

**Verdict:** APPROVED

## Evidence executed by the reviewer

- `bash init.sh` → exit 0. ESLint: 0 errors, 4 warnings, all 4 pre-existing
  (`app/layout.tsx:26`, `components/AddEventModal.tsx:215`,
  `lib/usersQuery.ts:17`, `tests/unit/selectors-parity.test.ts:69`) — none
  introduced by this feature. TypeScript typecheck clean.
- `pnpm test` (via `init.sh`'s vitest run) → **558/558 passing, 20 test
  files**, matching the claimed 545 pre-existing + 13 new
  (`tests/unit/toggle-join.test.ts`: 1 guard + 5 input-validation + 2
  existence/UNEXPECTED + 1 join + 1 leave + 1 race + 2 unexpected-error =
  13). No regressions in the other 545.
- `pnpm build` (`next build`) → compiled successfully, all routes generated
  (`/calendar` still dynamic), no errors.
- Full read of `lib/actions/events.ts` (`toggleJoin`, `isPrismaErrorCode`),
  `lib/validation/events.ts` (`ToggleJoinSchema`, `EVENT_ID_MAX_LENGTH`),
  `components/EventDetailModal.tsx`/`.module.css`, the whole of
  `components/CalendarApp.tsx`, and `tests/unit/toggle-join.test.ts`.
- File-mtime isolation of `CalendarApp.tsx`'s slice, per the leader's
  instructions: `lib/actions/events.ts` 16:33:16, `lib/validation/events.ts`
  16:32:50, `EventDetailModal.tsx` 16:34:24, `.module.css` 16:34:06,
  `strings.ts` 16:33:22, `CalendarApp.tsx` 16:36:51, `toggle-join.test.ts`
  16:36:15 — all inside the 16:32–16:37 window. `lib/selectors.ts` (15:59:10)
  and `lib/types.ts` (15:58:55) both predate the window, independently
  reconfirming they were not touched by this feature. `git diff` against the
  last commit for `CalendarApp.tsx` (mixed with #14/#15/#16 since nothing has
  been committed since) was read in full and the join-specific hunks — the
  `useTransition`/`optimisticJoin`/`prevServerEvents` block, `openEventDetail`
  /`closeEventDetail` clearing `joinError`, `handleToggleJoin` replacing the
  old local `toggleJoin`, the `events` `useMemo`, and the
  `EventDetailModal` prop wiring — are cleanly separable from the
  auth/picture/create-event hunks, matching the implementer's report
  line-for-line.
- Greps: no `attendeeOverrides` anywhere in tracked/untracked source; no
  `console.*`, no `: any`, no `redirect(` in any `lib/actions/*.ts`;
  `lib/actions/events.ts` exports only `listEvents`, `createEvent`,
  `toggleJoin` plus types; `git status --short prisma/migrations` empty;
  `lib/auth.ts`, `proxy.ts`, `supabase/**` show no mtime activity in the
  16:32–16:37 window (pre-existing untracked files from earlier features,
  untouched by this one).
- `prisma/schema.prisma`: `EventAttendee` has `@@id([eventId, userId])` and
  no other unique constraint, confirming `eventId_userId` is the correct
  Prisma-generated compound-key name used in the `delete` call
  (`lib/actions/events.ts:402`) and that the ONLY possible source of a
  `P2002` from `eventAttendee.create` is this exact pair already existing —
  there is no other unique index on this table that could produce an
  unrelated `P2002`.
- `lib/auth.ts`: `requireUser()` confirmed to return a typed
  `{ok:false, error:"UNAUTHENTICATED"}` and never `redirect()`, appropriate
  for a Server Action.

## Acceptance criteria

- "Joining adds the current user and switches the button to 'Ya vas ✓';
  clicking again removes them and reverts it" → **met by code + unit tests**;
  button-flip in a real browser is a pending live check (see below).
  Evidence: `toggleJoin`'s create-first/P2002-then-delete cycle
  (`lib/actions/events.ts:372-417`), exercised end to end by the "first
  toggle (join)" and "second toggle (leave)" tests
  (`tests/unit/toggle-join.test.ts:97-125`); `buildActiveEvent`'s
  `isGoing`/`joinLabel` derivation (`lib/selectors.ts:272,292`, unchanged) is
  fed from `events`, which `CalendarApp`'s `optimisticJoin`
  overlay/`router.refresh()` reconciliation keeps in sync
  (`components/CalendarApp.tsx:372-423`).
- "Attendee count and list update after each toggle" → **met by code**,
  live-render check pending. `revalidatePath("/calendar")` is called on both
  success outcomes (`lib/actions/events.ts:394,411`) and NOT on any error
  outcome, confirmed by reading every return path and by the two
  "unexpected errors" tests explicitly asserting
  `revalidatePath` was NOT called
  (`tests/unit/toggle-join.test.ts:144,153`) — consistent with the
  "2026-09-27 — Bug fix" `revalidatePath`-before-navigation pattern in
  `progress/history.md:160`. `attendeeCount`/`attendees`/`going(count)` in
  `buildActiveEvent`/`EventDetailModal` are computed from `event.attendeeIds`
  every render, so a refreshed `events` array updates them automatically.
- "Re-joining an already-joined event never duplicates the attendee" →
  **met, proven both structurally and by test.** `EventAttendee`'s PK IS
  `(eventId, userId)` (`prisma/schema.prisma:78`) — a second `create` for the
  same pair can only ever throw `P2002`, never silently duplicate; the
  "second toggle (leave)" test proves the code routes that into a `delete`
  rather than mis-reporting a second join, and the race test proves the
  edge where a concurrent delete has already run.

## Race-safety trace (create-first toggle)

Traced every ordering of two concurrent `toggleJoin` calls on the same
`(eventId, userId)`:

- **Both `create`s race:** the composite PK guarantees exactly one commits;
  the DB is the sole arbiter, no TOCTOU window exists on the write itself.
  The loser's `create` throws `P2002` (scoped correctly — see the
  schema-level confirmation above, there is no other unique constraint on
  `EventAttendee` that could produce an unrelated `P2002` from this call) and
  falls into `delete`.
- **`create` P2002 → `delete` also races another `delete`:** the second
  `delete` gets `P2025` ("record not found"), correctly treated as an
  already-achieved leave (`lib/actions/events.ts:404-410`), not an error —
  the end state (row absent) matches what is reported.
- **`create` P2002 → `delete` throws anything else:** `UNEXPECTED`, no text
  leaked (`lib/actions/events.ts:405-407`), verified by test
  (`toggle-join.test.ts:147-154`).
- **`create` throws anything other than `P2002`:** `UNEXPECTED` immediately,
  `delete` never attempted (`lib/actions/events.ts:397-399`), verified by
  test (`toggle-join.test.ts:138-145`).
- No path returns `ok:true` with a `joined` value that doesn't correspond to
  a real completed write, and no path throws an unhandled exception to the
  caller — every branch is caught and mapped to a typed result. This holds
  under the mental three-way-race extension too: a third concurrent request
  landing between the failed `create` and the `delete` just recurses into
  the same `P2025`-tolerant handling already traced above.

## Guard ordering and input validation

- `UNAUTHENTICATED` checked before any Prisma call, verified with a garbage
  object `eventId` (`toggle-join.test.ts:47-55`) — `findUnique`/`create`/
  `delete` all asserted uncalled.
- `ToggleJoinSchema` (`z.string().min(1).max(100)`) rejects `""`, `null`,
  `undefined`, a number, and a 10,000-char string with `INVALID_INPUT`
  before any Prisma call (`toggle-join.test.ts:57-71`). 100 chars is
  generous headroom over `cuid()`'s 25, consistent with the existing
  `REVOKE_ID_MAX_LENGTH` precedent (`lib/validation/invites.ts:34`).
- `EVENT_NOT_FOUND` returned before any write when `findUnique` returns
  null, with `create`/`delete` never attempted
  (`toggle-join.test.ts:74-85`).
- `userId` is read only from `guard.user.id`, never from `input`
  (`lib/actions/events.ts:392,402` — the smuggled-`userId` test
  (`toggle-join.test.ts:98-110`) asserts the actual `create` call's
  arguments, not just the final result, satisfying the "assert the call, not
  just the outcome" bar the leader set.

## `CalendarApp.tsx` render-time state-adjustment pattern

Read in full (`components/CalendarApp.tsx:147-151`). This is React's
documented "adjusting state when a prop changes" pattern, done in the render
body, not an effect:

```ts
const [prevServerEvents, setPrevServerEvents] = useState(serverEvents)
if (serverEvents !== prevServerEvents) {
  setPrevServerEvents(serverEvents)
  setOptimisticJoin(null)
}
```

- **No infinite loop:** `serverEvents` is the `events` prop passed down from
  the `/calendar` Server Component. A client-only re-render of `CalendarApp`
  (any local `setState`, including this very `setPrevServerEvents` call)
  does not re-invoke the parent Server Component, so the `events` array
  reference is stable across those renders; it only changes when a fresh RSC
  payload lands (`router.refresh()`). After the guard fires once, `prev` is
  updated to the new reference and the condition is false on the next
  render — no re-trigger.
- **Optimistic flag cleared exactly when fresh data lands, not before:** the
  guard runs in the same render pass that receives the new `events` prop, so
  the clear is synchronous with the truth arriving. A slow `router.refresh()`
  just means the optimistic guess is shown a bit longer — the documented
  safe direction, never wrong data.
- **On `toggleJoin` failure**, `setOptimisticJoin(null)` is called directly
  and immediately inside the failure branch (`CalendarApp.tsx:385`), which
  reverts the derived `events` `useMemo` to pass `serverEvents` straight
  through (`CalendarApp.tsx:412-423`) — i.e., the true last-known-good state,
  not the failed guess. Confirmed by reading the `useMemo`'s
  `if (!optimisticJoin) return serverEvents` short-circuit.

## UI reading (`EventDetailModal.tsx`)

- `disabled={isJoinPending}` on the join button (`EventDetailModal.tsx:86`)
  uses the browser's native disabled semantics, which blocks click dispatch
  outright once the DOM reflects the pending state; `handleToggleJoin` also
  has its own explicit `if (isJoining) return` guard
  (`CalendarApp.tsx:373`) as defense in depth. Even in the narrow
  browser-timing edge case of two clicks landing before the first re-render
  commits, the server-side create-first design (traced above) makes the
  outcome converge safely regardless.
- `joinError` renders as `role="alert"` when non-empty
  (`EventDetailModal.tsx:92-96`) and is cleared on opening the modal for any
  event (`openEventDetail` always resets `joinError: ""`,
  `CalendarApp.tsx:362`) and at the start of every new join attempt
  (`CalendarApp.tsx:378`).
- The button's label/color come from `event.joinLabel`/`joinBg`/`joinColor`,
  which `buildActiveEvent` derives from `isGoing`
  (`lib/selectors.ts:272,292-294`, confirmed unchanged), fed by the
  `events` array that already includes the optimistic overlay
  (`CalendarApp.tsx:459-464` passes `events`, not `serverEvents`, into
  `buildActiveEvent`) — the prop plumbing from `CalendarApp`'s derived array
  through to the modal is unbroken.
- The host-as-"Tú" logic (`lib/selectors.ts:259-296`,
  `hostName: hostIsMe ? STRINGS.fallbackUserName : host.name`) is untouched
  (confirmed both by mtime, 15:59:10, predating this feature's 16:32 start,
  and by direct reading) and is independent of `attendeeIds`/`isGoing`, so a
  host joining their own event correctly appears once in the attendee list
  (via `ev.attendeeIds.map(resolve)`) without altering their host identity —
  no duplication risk, since attendee resolution and host resolution are
  separate fields on the view model, not a shared list.
- `STRINGS.addEventModal.errors.sessionExpired` ("Tu sesión expiró. Vuelve a
  iniciar sesión.", `lib/strings.ts:112`) reused for the join/leave
  `UNAUTHENTICATED` case is a reasonable, generic session-expiry sentence
  that reads fine outside a form-submission context — not a copy-paste
  mismatch. Acceptable as implemented; full string-namespace isolation would
  be a stylistic-only alternative, not a correctness issue.

**Concrete browser-only risks the offline unit tests cannot catch** (no
jsdom/RTL in this repo, consistent with every prior feature):

1. The button actually flipping label/color/disabled-opacity on click, and
   reverting on a second click, in a real render.
2. The attendee avatar list and "ASISTEN (N)" count visually updating after
   `router.refresh()`.
3. The error line's actual visibility/positioning and screen-reader
   announcement via `role="alert"`.
4. A genuine two-tab/two-browser concurrent double-click race against the
   real hosted Postgres actually raising `P2002`/`P2025` under real
   contention (the unit tests prove the code path given those codes, not
   that Prisma/Postgres produce them exactly as mocked — the same
   code-vs-real-DB gap flagged for feature #9 in `progress/history.md:93`).
5. A second logged-in viewer's reload picking up the change.
6. The host visually rendering as "Tú" in a real opened modal.

## Layering and hygiene

- No Prisma/Supabase imports under `components/` (`EventDetailModal.tsx`,
  `CalendarApp.tsx` both grep-clean).
- `lib/actions/events.ts` exports only `listEvents`, `createEvent`,
  `toggleJoin` (all async) plus types.
- No `redirect(` in any `lib/actions/*.ts`.
- No `any`, no `console.*` in any file this feature touched.
- No leftover `attendeeOverrides` reference anywhere in tracked or untracked
  source.
- `lib/auth.ts`, `proxy.ts`, `prisma/**`, `supabase/**` show no mtime
  activity in this feature's window — untouched.
- `git status --short prisma/migrations` — empty.
- No secret-like strings introduced; no leftover temp/probe files.
- pnpm-managed; `pnpm-lock.yaml` present, no `package-lock.json`.

## Tests quality

- Every test asserts a concrete return value and, where relevant, the exact
  arguments a mock was called with (or explicitly asserts it was NOT
  called) — none merely check "did not throw."
- The `P2002`/`P2025` mock shapes (`{code: "P2002"}` / `{code: "P2025"}`,
  duck-typed via `isPrismaErrorCode`) are consistent with the codebase's
  existing precedent: `lib/actions/invites.ts:25-31`'s `isUniqueViolation`
  uses the identical `(e as {code?}).code === "P2002"` check.
- The "smuggled userId ignored" test asserts the `create` call's actual
  arguments (`toggle-join.test.ts:104-106`), not just the final result —
  meets the bar the leader set.
- Minor, non-blocking: the race test
  (`toggle-join.test.ts:127-135`) checks the final result and
  `revalidatePath`, but doesn't additionally assert `create`/`delete` were
  each called exactly once — not a defect, just slightly less exhaustive
  than the "second toggle" test immediately above it.

## Non-blocking observations

1. `revalidatePath("/calendar")` sits inside the same `try` block as the
   Prisma write it follows (`lib/actions/events.ts:393-395` and
   `410-412`), so if `revalidatePath` itself ever threw, a successful
   `create`/`delete` would be misreported as `UNEXPECTED` even though the DB
   write already committed. This is a pre-existing, already-approved
   pattern used identically in `lib/actions/onboarding.ts` and
   `lib/actions/auth.ts` (revalidatePath calls inside the same try block as
   their mutations) — `toggleJoin` simply follows established precedent, and
   `revalidatePath` does not throw under normal Server Action execution, so
   this is not a new risk introduced by this feature. Flagging only for
   parity with the scrutiny applied elsewhere in this review.
2. The join button has no textual "pending…" state distinct from the
   dimmed/disabled style (compare `AddEventModal`'s `t.submitting`
   "Agregando…" label swap) — purely cosmetic, not required by the
   acceptance criteria, and a reasonable simplification for a single-tap
   toggle.
3. `EventDetailModal.tsx` also carries the unrelated feature #16
   `pictureWrap`/`Image` block in the same recent-mtime file; confirmed by
   diff that this feature's own change is scoped to `isJoinPending`/
   `joinError` only, as the implementer's report states.

## Checkpoints

- C1: [x] — harness files present, `bash init.sh` exit 0.
- C2: [x] — exactly one feature (`17`) `in_progress`; its `depends_on: [14]`
  is `done`; `progress/current.md` reflects the active session accurately
  with no leftovers.
- C3: [x] — layering holds, guard-first in `toggleJoin`, no `redirect()` in
  actions, no secrets, copy in `lib/strings.ts`, pnpm-managed deps, no
  debug `console.log`, no context-free TODOs.
- C4: [x] — `tests/unit/toggle-join.test.ts` covers the new unit with
  concrete-result assertions and multiple error paths; no real Supabase
  invoked (mocks `@/lib/db`, `@/lib/auth`, `next/cache`, `server-only`);
  `pnpm test` shows 558 > 0, all green; lint/typecheck clean.
- C5: [ ] ← Not yet applicable: the feature is intentionally still
  `in_progress` pending this review and the leader's live check per protocol
  (`AGENTS.md` §5 closure steps 2–4 have not run yet). Nothing to fault here
  — this is expected mid-session state, not a defect.

## Required changes

None.

## Pending live/manual checks (leader, hosted project)

1. Real click: join flips the button to "Ya vas ✓" and the color/opacity
   change is visible; the `EventAttendee` row is created in Postgres; the
   attendee avatar list and "ASISTEN (N)" count update on the page.
2. A second real click on the same event reverts the button to "Unirme al
   evento", deletes the row, and the count/list revert.
3. A genuine concurrent double-click (or two simultaneous requests) against
   the real hosted Postgres converges to exactly one consistent
   `EventAttendee` row (either present or absent, never duplicated), with no
   crash and no unhandled exception in the server logs — this is the one
   claim the mocked unit tests cannot prove, since they assert the code's
   reaction to `P2002`/`P2025` but not that Prisma/Postgres actually raise
   those exact codes under real write contention (same gap noted for
   feature #9).
4. A second logged-in viewer reloading the calendar sees the updated
   attendee count/list after the first viewer's toggle.
5. Opening the event detail modal as the host shows "Tú" as the host name,
   and if the host also joins their own event, they appear exactly once in
   the attendee list (not duplicated with the host row).
6. The `joinError` line's actual visibility and wording in a real failed
   attempt (e.g., simulate by expiring the session mid-modal).
