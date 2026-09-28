# Review — feature 20 event_detail_modal_parity

**Verdict:** APPROVED (pending live/manual checks recorded below)

`depends_on` [16, 17] both `done` in `feature_list.json` — confirmed via
`node -e` read of the file. One feature `in_progress` at a time (C2) — holds.

## Acceptance criteria

- "Virtual events show the 'Virtual' label + clickable link; Presencial
  events show the address" → **met** (evidence: `components/EventDetailModal.tsx:87-106`
  — `event.modality === "IN_PERSON"` renders `<div className={styles.locationLine}>{event.location}</div>`,
  byte-identical to the pre-feature line per `git diff -- components/EventDetailModal.tsx`
  (`- <div className={styles.locationLine}>{event.location}</div>` removed,
  the same JSX re-added inside the `IN_PERSON` branch); the `VIRTUAL` branch
  renders `t.virtualLabel` ("Virtual", `lib/strings.ts:141`) and, only when
  `meetingLink` is non-null, an `<a href={meetingLink} target="_blank"
  rel="noopener noreferrer">{meetingLink}</a>` whose visible text is the URL
  itself — not misleading. Branch keys on `event.modality` alone, never falls
  through to check `location`, so a `VIRTUAL` event can never show an
  address. `meetingLink` computed at `EventDetailModal.tsx:45-50` as
  `event.modality === "VIRTUAL" && event.meetingUrl !== null &&
  isValidMeetingUrl(event.meetingUrl) ? event.meetingUrl : null` — re-validated
  on render per feature #15's review expectation. Proven only by static
  reading + green build/tests; see "Pending live checks" for the DOM-level
  assertion.
- "The picture renders at the fixed size; an empty attendee list shows the
  empty-state copy" → **met, unmodified by this feature** (evidence:
  `EventDetailModal.tsx:71-81` picture block and `:116-126` attendees block
  are untouched by feature #20 — confirmed via `git diff`, which shows no
  hunk touching those lines beyond the new conditional block inserted
  between the meta line and the description; AC 3.4.2/3.4.4 were already
  satisfied by #16/#17 and remain unmodified).
- "Opening from any entry point shows the same full modal with working
  join/leave" → **met** (evidence below, AC 3.4.5 trace).

### AC 3.4.5 trace (read myself, not accepted on the implementer's word)

- `components/WeekView.tsx:47` — block `onClick={() => onEventClick(b.id)}`;
  `CalendarApp.tsx:570` wires `<WeekView onEventClick={openEventDetail} />`
  directly — no intermediate function.
- `components/DayModal.tsx:40` — row `onClick={() => onEventClick(ev.id)}`;
  `CalendarApp.tsx:607` wires `<DayModal onEventClick={handleDayModalEventClick} />`,
  which (`CalendarApp.tsx:424-427`) does `patchState({ showDayModal: false })`
  then `openEventDetail(id)`.
- Month view: `CalendarApp.tsx:567` `<MonthView onCellClick={handleDayClick} />`;
  `handleDayClick` (`:412-415`) opens the day modal when the day has events,
  so a month-view day always funnels through the day-modal row path above
  before reaching `openEventDetail`.
- `openEventDetail` (`:430-432`) is the **only** place `showEventModal: true`
  is ever set (`grep -n "showEventModal\s*:" components/CalendarApp.tsx` →
  one `true`, three `false`) and the only place `activeEventId` is set to a
  real id. There is exactly one `<EventDetailModal>` instance
  (`CalendarApp.tsx:613-623`), fed by one `buildActiveEvent(events,
  state.activeEventId, people, currentUser)` call (`:528-533`) and one fixed
  props shape, gated by `state.showEventModal`. No divergent second path
  exists. Confirmed: no plumbing changed by this feature (`WeekView.tsx`,
  `DayModal.tsx`, `CalendarApp.tsx` all show no feature-#20 diff in these
  functions — the only `CalendarApp.tsx`/`WeekView.tsx`/`DayModal.tsx` diffs
  present are from earlier, already-`done` features #16-#19; feature #20's
  own file list per `feature_list.json.paths` is `EventDetailModal.tsx`,
  `lib/selectors.ts`, `lib/strings.ts` only, and that's what changed).
- `state.showDayModal` and `state.showEventModal` are never both `true`:
  the only path into the event-detail modal from the day modal explicitly
  sets `showDayModal: false` first (`:425`), and no other code path sets
  `showEventModal: true`. So the two modals are never stacked — no
  double-Escape risk.

## Meeting-link safety (read the actual code)

- `lib/validation/events.ts` imports only `zod`, `@/lib/constants`,
  `@/lib/dateUtils`, `@/lib/strings`, `@/lib/types` (`events.ts:1-5`); none of
  those files import Prisma/Supabase/`server-only`/`process.env`
  (`lib/constants.ts:1`, `lib/dateUtils.ts:1` are type-only imports of
  `./types`; `lib/strings.ts` has no imports at all; confirmed with
  `grep -rn "server-only" lib/constants.ts lib/dateUtils.ts lib/strings.ts
  lib/types.ts lib/validation/events.ts` → no matches). Genuinely safe to
  import into a client component.
- Corroborating evidence confirmed independently: `components/CalendarApp.tsx:36`
  does `import { checkEventInput } from "@/lib/validation/events"` and calls
  it at `:379` — the same module is already a proven client-safe import in
  this repo, as the implementer claimed.
- `isValidMeetingUrl` (`lib/validation/events.ts:18-30`): rejects empty/
  overlong strings, any whitespace, anything not matching `^https?://`
  (`javascript:`, `data:`, and scheme-less strings all fail
  `HTTP_URL_PREFIX.test(value)` before reaching `new URL`), and further
  rejects non-`http:`/`https:` protocols, credentialed URLs, and control
  characters via `new URL(value)`. Accepts `http://`/`https://` with a
  non-empty hostname. Correct as specified.
- Null-safety at the call site (`EventDetailModal.tsx:45-50`): the
  expression is `event.modality === "VIRTUAL" && event.meetingUrl !== null &&
  isValidMeetingUrl(event.meetingUrl) ? event.meetingUrl : null`. JS `&&`
  evaluates strictly left-to-right with short-circuit, so `event.meetingUrl
  !== null` always runs before `isValidMeetingUrl(...)` as written today.
  Additional protection beyond runtime ordering: `isValidMeetingUrl`'s
  parameter type is `value: string` (not `string | null | undefined`), and
  TypeScript only narrows `event.meetingUrl` from `string | null` to
  `string` **after** the `!== null` check in the same `&&` chain — so a
  future refactor that reordered the checks (calling
  `isValidMeetingUrl(event.meetingUrl)` before the null check) would fail
  `tsc --noEmit`, not silently pass `null` through at runtime. This is a
  real compile-time guard, not just a style convention.
- `grep -rn "target=\"_blank\"" .` (excluding `node_modules`/`.next`) →
  exactly one hit in the entire repo, `EventDetailModal.tsx:97`, immediately
  followed by `rel="noopener noreferrer"` at `:98`. No unpaired
  `target="_blank"` anywhere.
- Rendered link text is `{meetingLink}` — the URL itself, not a generic
  "Join" label or anything that could mask the destination.

## Escape-key handler correctness

- `EventDetailModal.tsx:33-39`: listener attached to `document` (not a ref
  to something that unmounts independently). Cleanup
  `document.removeEventListener("keydown", handleKeyDown)` references the
  exact same named function `handleKeyDown` declared inside the effect body
  and passed to `addEventListener` — no inline-arrow mismatch, no leaked
  listener. `onClose` is in the dependency array (`[onClose]`), so if its
  identity ever changed the effect would correctly re-subscribe; no
  stale-closure risk either way.
- No modal-stacking scenario exists in this app (see AC 3.4.5 trace above) —
  `showDayModal` and `showEventModal` are never simultaneously `true`, so
  there is no risk of Escape triggering an unexpected double-close.
- `components/Modal.tsx` confirmed untouched: `git status --porcelain
  components/Modal.tsx` → empty (not modified/untracked); its content
  (`Modal.tsx:1-58`) has no key handling, no `useEffect`, matching the
  implementer's claim; its file mtime (`2026-09-26 10:10:01`) predates every
  file this feature touched (`components/EventDetailModal.tsx` 18:55:13,
  `.module.css` 18:50:05, `lib/selectors.ts` 18:49:28, `lib/strings.ts`
  18:49:33, `lib/types.ts` 18:49:21, `tests/unit/selectors-parity.test.ts`
  18:53:01, `tests/fixtures/selectors-golden.json` 18:50:30, all on
  2026-09-27) — same mtime-isolation technique as #17/#18/#19.

## Conditional location rendering

- `IN_PERSON` branch text is byte-identical to the pre-feature single line
  (confirmed via `git diff -- components/EventDetailModal.tsx`, showing the
  old line removed and the identical line re-added unconditionally inside
  the new `IN_PERSON` arm) — no regression.
- `VIRTUAL` branch never reads `location`; it is not referenced anywhere in
  that arm (`EventDetailModal.tsx:90-106`), so a `VIRTUAL` event can never
  show a physical address regardless of what `location` holds.
- `VIRTUAL` + `meetingUrl: null` → `meetingLink` evaluates to `null` →
  `{meetingLink && (...)}` renders nothing; only the `t.virtualLabel` text
  node is emitted, no empty/broken `<a>`. Confirmed by reading the JSX
  directly (`:92-104`) — the `<a>` fragment is entirely inside the
  `{meetingLink && (...)}` guard.

## Golden-master fixture update

- `lib/constants.ts`'s prototype `SEED_EVENTS` type explicitly `Omit`s
  `"modality" | "meetingUrl" | "pictureUrl"` (`lib/constants.ts:54-57`) — the
  prototype seed carries no per-event modality/meeting-url data at all. The
  golden-master test's `toEvent()` helper (`tests/unit/selectors-parity.test.ts:55-62`)
  hardcodes `modality: "IN_PERSON", meetingUrl: null` for every synthesized
  `CalendarEvent`, the same technique already used for `pictureUrl: null` by
  #16/#18. Verified via `node -e` read of `tests/fixtures/selectors-golden.json`
  that all 5 `activeEvent/*` entries (`none`, `attendees-ev1`, `host-me`,
  `attendee-me`, `noattendees`) consistently hold
  `{"modality":"IN_PERSON","meetingUrl":null}` — correct given there is no
  real per-event value to diverge from; not a data-derivation bug.
- `prisma/seed-data.ts` (the actual DB seed, unrelated to this golden
  fixture) also only ever sets `modality: "IN_PERSON"` (2 occurrences,
  `prisma/seed-data.ts:110,143`) — consistent, no stray `VIRTUAL` seed event
  anywhere in the repo that this fixture update could have mismatched.

## Tests quality

- The 4 new `buildActiveEvent` tests (`tests/unit/selectors-parity.test.ts:195-232`)
  assert concrete values: `expect(view.modality).toBe("IN_PERSON"/"VIRTUAL")`,
  `expect(view.meetingUrl).toBe("https://meet.example.com/room")` /
  `.toBeNull()` — not merely field presence. Good.
- Gap (see Observations): no test exercises `EventDetailModal.tsx`'s own
  conditional JSX, the `meetingLink` re-validation call, or the Escape
  `useEffect` — only the upstream selector (`buildActiveEvent`) is unit
  tested. This matches the rest of the repo (zero `*.test.tsx` files exist
  for any modal — `Glob "tests/**/*.test.tsx"` → no results), so it is not a
  regression introduced by this feature, but it does mean AC 3.4.1's actual
  rendered behavior and AC 3.4.3's Escape behavior are proven here only by
  static code reading plus a green build, not an executed assertion against
  the component. Flagged below as a pending manual/live check, per this
  review's own instructions and the repo's Level 3 convention
  (`verification.md` — Playwright/#22 not yet built).

## Layering and hygiene

- No Prisma/Supabase import anywhere under `components/`
  (`EventDetailModal.tsx` imports only `react`, `next/image`,
  `@/lib/types`, `@/lib/strings`, `@/lib/validation/events`, `./Modal`,
  `./EventDetailModal.module.css`).
- No `redirect(` in any file this feature touched.
- No `any` added.
- No `console.*` in `EventDetailModal.tsx`, `lib/selectors.ts`,
  `lib/strings.ts`, `lib/types.ts` (checked directly).
- `proxy.ts`, `lib/auth.ts`, `prisma/**`, `supabase/**`, `lib/actions/*`,
  `components/Modal.tsx` all confirmed untouched: `git status --porcelain`
  for each shows either untracked-from-earlier-features (unchanged by this
  session) or nothing at all for `Modal.tsx`; mtime isolation for
  `Modal.tsx` above.
- New copy (`eventDetailModal.virtualLabel: "Virtual"`) lives in
  `lib/strings.ts:141`; "Virtual" is valid es-PE (unaccented, same spelling
  as Spanish). No hard-coded UI text or new `aria-label` literals were
  added (none present in the diff).
- `.meetingLink` (`EventDetailModal.module.css:61-64`) uses
  `var(--color-accent)`, an existing token defined in
  `app/globals.css:6` (`#e8ac3e`) and already used by `.joinButton`'s
  border in the same stylesheet — no new palette color introduced.
- Line endings verified byte-level (not `grep`, per the implementer's own
  documented Git-Bash caveat): `EventDetailModal.tsx`, `.module.css`,
  `lib/selectors.ts` stayed pure CRLF; `lib/strings.ts`, `lib/types.ts`,
  `tests/unit/selectors-parity.test.ts`,
  `tests/fixtures/selectors-golden.json` stayed pure LF — each file's
  pre-existing convention preserved, no mixed line endings in any of them.

## Executed verification

- `bash init.sh` → exit 0. ESLint: 4 pre-existing warnings (font,
  `<img>`, two unused eslint-disables), 0 errors, none introduced by this
  feature. TypeScript typecheck clean. Vitest: **22 test files, 605/605
  passed** (601 pre-existing + 4 new), matching the implementer's claimed
  count.
- `pnpm build` (`next build`, Turbopack) → compiled successfully, typecheck
  passed, all 9 routes generated with no errors.

## Checkpoints

- C1: [x] — harness files present, `bash init.sh` exit 0.
- C2: [x] — exactly one `in_progress` feature (#20); its `depends_on`
  ([16, 17]) are both `done`.
- C3: [x] — layering holds (no Prisma/Supabase under `components/`, no
  `redirect()`, secrets untouched, all new copy in `lib/strings.ts`,
  pnpm-managed, no debug `console.log`/stray TODOs in the touched files).
- C4: [x] — new logic (`buildActiveEvent`'s modality/meetingUrl
  pass-through) has 4 concrete-value tests plus an error/edge path
  (`meetingUrl: null`); `pnpm test` shows 605 > 0, all green, offline (no
  Supabase/Prisma touched). Partial gap noted above: the component's own
  conditional-rendering and re-validation logic has no executed test, only
  static verification — consistent with the rest of this repo's test
  coverage, not a regression, but recorded as a pending manual check rather
  than claimed as tested.
- C5: [ ] — not yet applicable: feature is not being closed by this review
  (status intentionally left `in_progress` pending this approval); once the
  leader marks it `done` and moves `progress/current.md` into
  `progress/history.md`, re-check C5 at that point.

## Required changes

None.

## Observations (non-blocking)

1. No `*.test.tsx` component test exists in this repo for any modal,
   including `EventDetailModal.tsx` — the meeting-link re-validation branch
   and the new Escape `useEffect` are exercised only by manual/browser
   verification for now. Worth a note for whenever feature #22 (Playwright)
   or a component-testing layer is introduced, but out of scope for #20's
   `paths` (`EventDetailModal.tsx`, `lib/selectors.ts`, `lib/strings.ts`)
   and consistent with the existing convention.
2. `isValidMeetingUrl` remains not null-safe by design (every existing
   caller passes a `string`); the implementer correctly left it unchanged
   rather than stretching a shared function's contract for one caller. The
   current call site is safe both at runtime (short-circuit `&&` ordering)
   and at compile time (the function's `string` parameter type forces
   TypeScript to reject a reordered/unguarded call). No action needed.

## Pending live/manual checks (leader or user, real browser)

None of the following were exercised in a live DOM — `bash init.sh` and
`pnpm build` prove the code compiles, typechecks, and the covered selector
logic is correct, but the following need an actual browser per this
review's hard safety rules (no `next dev` was run by this reviewer):

1. Open a **Virtual event with a meeting link**: confirm the "Virtual" label
   and the link render together on one line, the link text is the full URL,
   clicking it opens a new tab (not the same tab), and DevTools' Elements
   panel shows the live `<a>` node has both `target="_blank"` and
   `rel="noopener noreferrer"`.
2. Open a **Virtual event with no meeting link**: confirm only "Virtual"
   renders, with no separator dot, no empty/broken anchor tag in the DOM.
3. Open a **Presencial event**: confirm the physical address renders and the
   word "Virtual" never appears anywhere in the modal.
4. Press **Escape** while the detail modal is open: confirm the modal
   closes, and that the underlying calendar's current view (month/week),
   selected date, and scroll position are unchanged afterward (i.e.
   `closeEventDetail` truly only clears `showEventModal`/`joinError` and
   nothing else observable changed).
5. Open the **same event** from (a) a week-view overlap card, (b) a
   day-modal list item, and (c) a month-view day (which opens the day modal
   first, then the item): confirm all three show pixel/byte-identical modal
   content — same title, date/time, location/Virtual+link, picture,
   description, host, attendee list, and a working join/leave button in all
   three.
6. Confirm the picture (#16) and the join/leave button (#17) still work
   exactly as before end to end in this live run (click-through, not just
   "code path untouched").
