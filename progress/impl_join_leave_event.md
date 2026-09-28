# Implementation report — Feature #17: join_leave_event

**Status:** implemented, offline-verified, NOT marked `done` (awaiting reviewer
approval and the leader's live check on the hosted project, per protocol).

## Files touched

- `lib/actions/events.ts` — added `toggleJoin(input: { eventId: unknown })`
  (new export), plus a small unexported `isPrismaErrorCode` helper. No other
  export changed. The file still exports only async functions plus types.
- `lib/validation/events.ts` — added `EVENT_ID_MAX_LENGTH` (100) and
  `ToggleJoinSchema` (`z.object({ eventId: z.string().min(1).max(100) })`),
  mirroring `RevokeCodeSchema` in `lib/validation/invites.ts` (feature #13).
- `components/EventDetailModal.tsx` — added `isJoinPending`/`joinError`
  props; the join button gets `disabled={isJoinPending}`; a new error line
  renders below the button when `joinError` is non-empty. No change to how
  `event: ActiveEventView` is built or consumed — `buildActiveEvent` and its
  host-as-"Tú" / self-in-attendee-list logic in `lib/selectors.ts` are
  untouched, as instructed.
- `components/EventDetailModal.module.css` — added `.joinButton:disabled`
  (dimmed, default cursor) and `.joinError` (reuses `var(--color-error)`,
  same visual treatment as `AddEventModal`'s `.error`).
- `components/CalendarApp.tsx` — replaced the local-only join override with
  a real Server Action call (details below). `lib/types.ts` was **not**
  touched — the removed `attendeeOverrides` map lived entirely in
  `CalendarApp`'s own local `AppState` interface, not in `lib/types.ts`, so
  no shared type needed changing.
- `lib/strings.ts` — added one new string,
  `STRINGS.eventDetailModal.joinError`: "No pudimos actualizar tu
  asistencia. Inténtalo de nuevo." (es-PE). `UNAUTHENTICATED` reuses the
  existing `STRINGS.addEventModal.errors.sessionExpired` string rather than
  duplicating it, consistent with how `createEvent`'s error mapping in the
  same component already treats session expiry.
- `tests/unit/toggle-join.test.ts` — new, 13 tests.
- `progress/current.md`, `progress/impl_join_leave_event.md` (this file).

## `toggleJoin` design (the create-first race-safe toggle)

`EventAttendee`'s primary key IS `(eventId, userId)`. The action:

1. `requireUser()` first — `UNAUTHENTICATED` leaves Prisma untouched.
2. `ToggleJoinSchema.safeParse({ eventId })` — any non-string, empty, or
   over-100-character `eventId` returns `INVALID_INPUT`, Prisma untouched.
   `userId` is never read from `input` — it always comes from
   `guard.user.id`, so a smuggled `userId` in the payload is inert (asserted
   in the tests).
3. `prisma.event.findUnique({ where: { id: eventId }, select: { id: true } })`
   — missing event -> `EVENT_NOT_FOUND` (asserted: `findUnique` called once,
   `create`/`delete` never called).
4. The toggle itself, deliberately NOT a "read membership, then decide"
   shape:
   - Attempt `prisma.eventAttendee.create({ data: { eventId, userId } })`.
     - Success -> the row did not exist before -> `{ ok: true, joined: true }`.
     - Throws Prisma's unique-violation `P2002` (duck-typed via
       `(e as {code}).code === "P2002"`, the same pattern
       `lib/actions/invites.ts` already uses) -> the row already existed, so
       this click means leave: `prisma.eventAttendee.delete({ where: {
       eventId_userId: { eventId, userId } } })`.
       - Success -> `{ ok: true, joined: false }`.
       - Throws `P2025` ("record to delete does not exist") -> a concurrent
         request already removed the row in the tiny window between our
         failed `create` and our `delete`. The end state (not attending) is
         exactly what that other request also produced, so this is still
         `{ ok: true, joined: false }`, not an error.
       - Throws anything else -> `{ ok: false, error: "UNEXPECTED" }`, no
         text leaked.
     - Throws anything other than `P2002` -> `{ ok: false, error:
       "UNEXPECTED" }` immediately; `delete` is never attempted.
5. `revalidatePath("/calendar")` is called on both success paths (joined and
   left), before returning, mirroring the "2026-09-27 — Bug fix" pattern in
   `progress/history.md` so the client's router cache for `/calendar` is
   invalidated ahead of `router.refresh()`.

**Why this is race-safe / correctly models a toggle:** a naive
"check-if-exists, then create-or-delete" has a TOCTOU window — two
concurrent requests could both read "not attending" and both attempt
`create`, and whichever loses would either crash on an unhandled unique
violation or (with a sloppier check) silently double-insert. This design
instead always attempts the write first and lets the database's own
uniqueness constraint decide who "won": exactly one `create` can ever
succeed for a given `(eventId, userId)` pair, full stop, regardless of
timing. Every other concurrent attempt is deterministically routed into the
`P2002` branch and becomes a `delete`, and that `delete` itself is
similarly guarded against its own race window via `P2025`. There is no
window in this code where two requests could both believe they succeeded at
the same operation, and no window where an error is silently swallowed into
a fabricated `ok: true` that doesn't match the database.

**Two rapid clicks from the same browser before the first resolves:** both
requests race the same `create`. The composite PK guarantees exactly one
`create` succeeds; the other gets `P2002` and falls into the `delete`
branch. Net effect: one `create` + one `delete` on the same row, in some
order — the row ends up NOT existing (not-attending), the two responses are
`{ok:true, joined:true}` then `{ok:true, joined:false}` (or the reverse
timing, still one of each), and the UI's last-resolved response together
with `router.refresh()`'s real fetch converges to the correct persisted
state. Neither request ever throws to the caller, and neither ever reports
success with a `joined` value that doesn't correspond to a real completed
write. (If the *delete* of the pair also raced a third late request, that
would just recurse into the same `P2025`-tolerant handling — still
convergent, still no crash.)

**Host toggling their own event:** allowed, no special-casing — `EventAttendee`
has no host exception in the schema and the spec doesn't ask for one.

## `components/CalendarApp.tsx` — exactly what changed and why

- Removed `attendeeOverrides: Record<string, string[]>` from `AppState` and
  the local `toggleJoin(id)` function that mutated it (feature #14's
  deliberate placeholder). Removed the `attendeeOverrides` initializer from
  `initialState`.
- Added `joinError: string` to `AppState` (defaults to `""`; cleared when a
  new event detail is opened via `openEventDetail`, and when the modal is
  closed via `closeEventDetail`, and at the start of each new join attempt).
- Added a module-level `OptimisticJoin { eventId: string; joined: boolean }`
  type and a `useState<OptimisticJoin | null>` for it. This is the "short-lived
  optimistic flag" the brief allowed: a join/leave click flips it
  immediately so the button responds without waiting for the round trip.
- **Reconciliation, and why it's not a `useEffect`:** the natural way to
  write "clear this local flag once new server props land" is a `useEffect`
  keyed on `serverEvents`, but ESLint's `react-hooks/set-state-in-effect`
  rule (part of this repo's lint config) flags a bare `setState` inside an
  effect body as a cascading-render anti-pattern, and `bash init.sh` fails
  on any ESLint error. I used React's documented alternative instead —
  "adjusting state when a prop changes" during render — via a
  `prevServerEvents` state ref compared on every render:
  ```ts
  const [prevServerEvents, setPrevServerEvents] = useState(serverEvents)
  if (serverEvents !== prevServerEvents) {
    setPrevServerEvents(serverEvents)
    setOptimisticJoin(null)
  }
  ```
  This still guarantees the optimistic flag is cleared in the same commit a
  fresh `events` prop arrives (i.e. after `router.refresh()` following a
  successful `toggleJoin` or `createEvent`), without an extra render pass
  and without the lint violation.
- Added `handleToggleJoin(id)`: guarded by `isJoining` (a `useTransition`)
  against double-firing while a request is in flight; computes the flip
  from the CURRENT (possibly already-optimistic) `events` array so a second
  click, once the button is re-enabled after a response, flips correctly
  relative to the latest known state; sets the optimistic flag and clears
  any previous `joinError`; calls the real `toggleJoin({ eventId: id })`
  Server Action inside `startJoin`. On `ok: true`, calls `router.refresh()`
  (the optimistic flag is then reconciled away by the render-time check
  above once the refreshed props land — it is never left to drift). On
  failure, clears the optimistic flag immediately (so the button reverts to
  the real last-known state, not the guessed one) and sets `joinError` to
  `STRINGS.addEventModal.errors.sessionExpired` for `UNAUTHENTICATED` or
  `STRINGS.eventDetailModal.joinError` for every other error
  (`INVALID_INPUT`, `EVENT_NOT_FOUND`, `UNEXPECTED` — none of these are
  reachable from normal UI use since `id` always comes from a real rendered
  event, but they're handled defensively and identically).
- The `events` `useMemo` now derives from `serverEvents` + `optimisticJoin`
  only (no more `attendeeOverrides`): if there's an optimistic flag for the
  active event and it disagrees with the server's current `attendeeIds`,
  the current user's id is added/removed locally; otherwise `serverEvents`
  passes through unchanged.
- `EventDetailModal` now receives `isJoinPending={isJoining}` and
  `joinError={state.joinError}` in addition to the existing `event`/
  `onToggleJoin`/`onClose` props; `onToggleJoin` now calls the new
  `handleToggleJoin`.

No other component or file was touched, and `lib/types.ts` needed no
changes at all — everything that changed lived in `CalendarApp`'s own local
state shape.

## Tests (`tests/unit/toggle-join.test.ts`, 13 new tests, offline, mocks
`@/lib/db`, `@/lib/auth`, `next/cache`, `server-only`)

- Guard: `UNAUTHENTICATED` first, even with a garbage `eventId` object —
  Prisma (`findUnique`/`create`/`delete`) never called.
- Input validation, each returning `INVALID_INPUT` with Prisma untouched:
  `""`, `null`, `undefined`, a number (`5`), a 10,000-character string.
- Event not found -> `EVENT_NOT_FOUND`; `findUnique` called exactly once
  with `{ where: { id }, select: { id: true } }`, `create`/`delete` never
  called.
- `findUnique` throwing -> `UNEXPECTED`, no leaked text, no
  `create`/`delete`.
- First toggle (join): `create` called with the exact `{ eventId, userId }`
  — a smuggled `userId: "attacker-id"` in the input is asserted to be
  ignored (the call uses `"me-id"`, the session id) — returns `{ ok: true,
  joined: true }`, `delete` never called, `revalidatePath("/calendar")`
  called.
- Second toggle (leave): `create` rejects with `{ code: "P2002" }` ->
  `delete` called with the exact composite key `{ eventId_userId: {
  eventId, userId } }`, returns `{ ok: true, joined: false }`,
  `revalidatePath` called.
- Race case: `create` rejects `P2002` AND `delete` rejects `{ code:
  "P2025" }` -> still `{ ok: true, joined: false }`, `revalidatePath`
  called — not `UNEXPECTED`.
- `create` throws some OTHER error -> `UNEXPECTED`, no leaked text,
  `delete` never attempted, `revalidatePath` never called.
- `delete` throws a non-`P2025` error after a `P2002` -> `UNEXPECTED`, no
  leaked text, `revalidatePath` never called.

## Verification

- `bash init.sh` — exit 0. ESLint clean (0 errors, the same 4 pre-existing
  warnings as before this feature, none new — see the note below about one
  ESLint error I introduced and fixed). TypeScript typecheck clean.
  Vitest: **558/558 tests passing** (545 pre-existing + 13 new), 20 test
  files.
- `pnpm build` (`next build`) — compiled successfully, all routes generated
  (`/calendar` etc. still dynamic as expected), no errors.
- Greps run and confirmed clean:
  - No `redirect(` in any `lib/actions/*.ts`.
  - No Prisma/Supabase imports under `components/`.
  - No `console.*` in any file this feature touched.
  - No remaining reference to `attendeeOverrides` anywhere in the repo
    (`grep -rn "attendeeOverrides"` over tracked source returns nothing) —
    it was fully removed, not renamed; the optimistic flag is a distinctly
    named, distinctly shaped concept (`optimisticJoin`, a single
    `{eventId, joined}` or `null`, not a per-event map), and it IS
    reconciled against server truth (see above), so it does not reintroduce
    the local-only drift problem #17 exists to fix.
  - `lib/actions/events.ts` exports only async functions
    (`listEvents`, `createEvent`, `toggleJoin`) plus types.
- `git diff --ignore-cr-at-eol --stat` on the touched tracked files shows
  the same file set either way (no CR/LF-only churn); a direct check
  (`grep -c $'\r'`) confirms every touched file is still 100% CRLF, matching
  what it was before my edits — no mixed line endings introduced.
- **ESLint incident during self-verification (already fixed, not left
  behind):** my first version reconciled the optimistic flag with a plain
  `useEffect(() => setOptimisticJoin(null), [serverEvents])`, which
  `bash init.sh` failed on (`react-hooks/set-state-in-effect`: "Calling
  setState synchronously within an effect can trigger cascading renders").
  I replaced it with the render-time "adjusting state when a prop changes"
  pattern described above, re-ran `bash init.sh`, and it is now fully green
  with no new warnings.

## NOT verified by me (leader's live check needed)

- Any real-browser behavior: the button visually flipping between "Unirme
  al evento" / "Ya vas ✓", the disabled/dimmed state while pending, the
  error line rendering, the attendee avatar list and "ASISTEN (N)" count
  updating. There is no jsdom/RTL in this repo (consistent with every prior
  feature), so none of this was exercised outside the offline Vitest mocks
  above.
- A genuine concurrent double-click race against the REAL hosted database
  (my race test uses mocked Prisma rejections shaped like `P2002`/`P2025`,
  which proves the code path is correct, but does not prove Postgres/Prisma
  actually raises those exact codes under real contention pressure — feature
  #9's history entry established this same code-vs-real-DB gap for
  `P2002`, and the leader's live checks for #9/#10/#13 closed it there by
  hand).
- That a second, different logged-in viewer sees the change after reloading.
- That the host still visually renders as "Tú" in the real modal (the
  underlying `buildActiveEvent` logic is unchanged and covered by existing
  selector tests, but the live rendering was not opened in a browser).
- Unauthenticated/garbage input against the real deployed action over HTTP
  (only the in-process guard logic was exercised here).
- Whether the 100-character `EVENT_ID_MAX_LENGTH` ceiling ever needs to be
  reconsidered — Prisma `cuid()` ids are 25 characters, so 100 is generous
  headroom, but this is a judgment call, not something derived from a spec
  number.

## Deviations / notes for the reviewer

- `EVENT_ID_MAX_LENGTH` (100) is my own reasonable choice (the spec asked
  for "a non-empty string, reasonable max length"), matching the existing
  `REVOKE_ID_MAX_LENGTH` constant in `lib/validation/invites.ts` for
  consistency with feature #13's precedent.
- The `UNAUTHENTICATED` client-side error message reuses
  `STRINGS.addEventModal.errors.sessionExpired` rather than adding a
  duplicate string under `eventDetailModal`; I judged this preferable to
  copy-pasting the same es-PE sentence into a second location, but a
  reviewer preferring full string-namespace isolation per component may
  disagree — trivial to change if so.
