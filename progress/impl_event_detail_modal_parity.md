# Implementation report — Feature #20: event_detail_modal_parity

## Files touched

- `lib/types.ts` — `ActiveEventView` gains `modality: EventModality` and
  `meetingUrl: string | null`, placed next to `pictureUrl` with the same
  direct-pass-through documentation style.
- `lib/selectors.ts` — `buildActiveEvent`: the "no active event" placeholder
  branch sets `modality: "IN_PERSON"`, `meetingUrl: null`; the populated
  branch sets `modality: ev.modality`, `meetingUrl: ev.meetingUrl` directly
  (no transformation — both already exist on `CalendarEvent`). `location`'s
  existing computation (`ev.location || t.locationTBA`) is untouched.
- `lib/strings.ts` — added `eventDetailModal.virtualLabel = "Virtual"` (a
  fresh string under this component's own namespace, not reused from
  `addEventModal.modalityVirtual`).
- `components/EventDetailModal.tsx` — added `"use client"` (required because
  the file now uses `useEffect`; matches this repo's own convention — the
  only two other files using `useEffect`, `CalendarApp.tsx` and
  `GenerateCodesModal.tsx`, both declare it explicitly, whereas hook-free
  modals like `AddEventModal.tsx`/`DayModal.tsx` don't need it). Replaced the
  single unconditional location line with a conditional block: `IN_PERSON`
  renders exactly what was there before; `VIRTUAL` renders the new "Virtual"
  label and, only when a `meetingLink` survives re-validation, a
  `target="_blank" rel="noopener noreferrer"` link whose visible text is the
  URL itself. Added a local `useEffect` attaching a `keydown` listener on
  `document` for `"Escape"` → `onClose()`, cleaned up via
  `removeEventListener` on unmount/dependency change (`onClose` is in the
  dependency array — no stale-closure risk).
- `components/EventDetailModal.module.css` — added `.meetingLink` (accent
  color via the existing `--color-accent` token, already used by
  `.joinButton` in this same file, plus underline — no new palette
  introduced).
- `tests/unit/selectors-parity.test.ts` — extended (not duplicated): a new
  `describe("buildActiveEvent modality/meetingUrl (feature #20)")` block with
  4 cases (no-active-event placeholder defaults, an `IN_PERSON` seed event,
  a synthetic `VIRTUAL` event with a link, a synthetic `VIRTUAL` event with
  `meetingUrl: null`). 29 → 33 tests in this file.
- `tests/fixtures/selectors-golden.json` — the 5 `activeEvent/*` fixture
  entries (`none`, `attendees-ev1`, `host-me`, `attendee-me`, `noattendees`)
  each gained `"modality": "IN_PERSON", "meetingUrl": null` right after
  `pictureUrl`, computed mechanically (all seed events in this test file are
  built via its local `toEvent()` helper, which hard-codes
  `modality: "IN_PERSON", meetingUrl: null` for every seed event — same
  technique #16/#18 used for their own fixture updates). Rewritten via a
  small Node script that parsed, patched, and re-serialized with
  `JSON.stringify(g, null, 2) + "\n"`; verified byte-for-byte that the file
  stays pure LF (this fixture is an untracked/new file from an earlier
  session, already LF, like every other new file in this repo — confirmed
  with a byte-level Node check, not `grep`, since Git Bash's `grep -c $'\r'`
  gave misleading counts on Windows for these files).
- `progress/current.md` — kept updated through the session (already had the
  plan from the leader's dispatch; log entry appended below).

## Decisions

1. **Meeting-URL validation: reused `lib/validation/events.ts`'s
   `isValidMeetingUrl` directly, did not write a local equivalent.**
   Checked its import chain first: it imports only from `@/lib/constants`,
   `@/lib/dateUtils`, `@/lib/strings`, and `@/lib/types` — all of which import
   only `type`-only cross-references to each other, no Prisma, no Supabase,
   no `process.env`, no `server-only`. It is already proven safely
   client-importable: `components/CalendarApp.tsx` (a client component)
   already imports `checkEventInput` from the same module. So per the
   feature brief's own instruction ("reuse ... if you can import it cleanly
   ... check whether that module has any server-only imports"), reuse was
   the correct choice — no new local function was written, and no separate
   test was added for it because the existing, comprehensive
   `describe("isValidMeetingUrl", ...)` suite in
   `tests/unit/event-validation.test.ts` (already in the repo) covers
   accepting `https://`/`http://`, and rejecting `javascript:`, `data:`,
   `ftp:`, a bare host with no scheme, an empty string, credentialed URLs,
   and overlength strings.
   - **One caveat found and deliberately NOT changed**: `isValidMeetingUrl`
     is not null-safe (`value.length` throws on `null`/`undefined`) — it was
     never designed to be, since every existing caller already passes a
     `string`. I confirmed this by writing a defensive test and watching it
     fail, then reverted that test rather than touching
     `lib/validation/events.ts` (out of this feature's file scope) or
     stretching the shared function's contract. My own call site never
     passes `null` to it: `meetingLink` is computed as
     `event.modality === "VIRTUAL" && event.meetingUrl !== null &&
     isValidMeetingUrl(event.meetingUrl) ? event.meetingUrl : null` — the
     `!== null` short-circuit guards the call, and this expression also
     narrows the result to a plain `string | null` so the JSX needs no type
     assertion (`meetingLink` renders straight into `href`/link text).
2. **Esc-to-close implemented locally in `EventDetailModal.tsx` only**,
   exactly as directed — `components/Modal.tsx` was not touched. The
   `useEffect` attaches on mount, removes on unmount, and re-attaches if
   `onClose`'s identity changes (it's in the dependency array), so there is
   no stale-closure risk: `CalendarApp.tsx`'s `closeEventDetail` passed as
   `onClose` is a stable function reference for the component's lifetime
   anyway (defined once per render of the parent, not recreated per
   keystroke), but the effect is correct regardless. Backdrop click and
   `ModalCloseButton` were not touched and still call the same `onClose` prop
   they always did.
3. **AC 3.4.5 — traced, not assumed, confirmed no divergence, no plumbing
   changed.** Read `CalendarApp.tsx` end to end around the relevant state:
   - Week view: `<WeekView weekData={weekData} onEventClick={openEventDetail} />`
     — `WeekView.tsx`'s block `onClick` calls `onEventClick(b.id)` directly.
   - Day modal: `<DayModal ... onEventClick={handleDayModalEventClick} .../>`
     — `DayModal.tsx`'s row `onClick` calls `onEventClick(ev.id)` directly;
     `handleDayModalEventClick` closes the day modal and calls
     `openEventDetail(id)`.
   - Month view: `<MonthView ... onCellClick={handleDayClick} />` →
     `handleDayClick` opens the day modal (`showDayModal: true`) when the day
     has events, so a month-view day always routes through the same day-modal
     list-item path above before reaching `openEventDetail`.
   All three converge on the single `openEventDetail(id)` function, which
   sets the single `state.activeEventId`. There is exactly **one**
   `<EventDetailModal>` instance in the whole tree
   (`components/CalendarApp.tsx`, gated by `state.showEventModal`), fed by
   the single `buildActiveEvent(events, state.activeEventId, people,
   currentUser)` call and the same fixed props shape
   (`event`/`onToggleJoin`/`onClose`/`isJoinPending`/`joinError`) every time,
   regardless of entry point. **No divergence found; no fix was needed or
   made** to `CalendarApp.tsx`, `WeekView.tsx`, or `DayModal.tsx` — none of
   those files were touched.

## Verification

- `bash init.sh` → exit 0. `605/605` tests green (601 pre-existing + 4 new).
  ESLint clean (4 pre-existing warnings, none introduced by this feature:
  `app/layout.tsx` custom-font warning, `AddEventModal.tsx` `<img>` warning,
  an unused eslint-disable in `lib/usersQuery.ts`, and an unused
  eslint-disable in `tests/unit/selectors-parity.test.ts`'s pre-existing
  `legacyShape` helper — all pre-date this session). TypeScript typecheck
  clean.
- `pnpm build` (`next build`, Turbopack) → compiled successfully, typecheck
  passed, static/dynamic route generation completed with no errors.
- Greps: no `redirect(` under `lib/actions/`; no `prisma`/`supabase` string
  anywhere under `components/`; no `console.*` in any file I touched; the
  one `target="_blank"` I added is immediately paired with
  `rel="noopener noreferrer"`; no `aria-label` literals added (I added no
  new `aria-label`s at all).
- Line endings: verified byte-for-byte with a small Node script (not
  `grep`, which gave misleading results in this Git Bash environment for
  these particular files) that every file I edited kept its pre-existing
  convention untouched — `lib/selectors.ts`, `components/EventDetailModal.tsx`,
  `components/EventDetailModal.module.css` stayed pure CRLF;
  `lib/strings.ts`, `lib/types.ts`, `tests/unit/selectors-parity.test.ts`
  stayed pure LF; `tests/fixtures/selectors-golden.json` stayed pure LF.
  `tests/unit/event-validation.test.ts` was edited then the edit was fully
  reverted (net zero diff) once the null-safety caveat above was discovered.
- No new dependencies; no `.env` touched; no seed/migrate/push run; no
  `next dev` started (build + typecheck only, per the hard safety rules).

## NOT verified by me (left for the leader's real-browser check)

- Opening a Virtual event with a meeting link in an actual browser: that the
  "Virtual" label and link render together, the link is genuinely clickable,
  opens in a new tab, and DevTools shows `rel="noopener noreferrer"` on the
  live DOM node.
- Opening a Virtual event with no link: that only "Virtual" shows and no
  broken/empty anchor is rendered (my code path returns `null` from
  `meetingLink` in that case, so the `{meetingLink && (...)}` block emits
  nothing — but this was not visually confirmed in a browser).
- Opening a Presencial event: that the address renders and no "Virtual"
  label ever appears.
- Pressing Escape in a real browser: that it actually dismisses the modal
  and the underlying calendar view/scroll position is unaffected (the
  `useEffect` wiring is correct by inspection and by the repo's own
  `useEffect` convention, but was not exercised in a live DOM).
- That the three entry points (week view, day modal, month view →
  day modal) render **byte-identical** modal content for the same event in a
  live run — I confirmed this structurally (same function, same state, same
  single JSX instance, same props shape) but did not screenshot-compare.
- That the picture (#16) and the join/leave button (#17) still work exactly
  as before — I did not modify their code paths at all (only inserted a new
  conditional block in between the meta line and the description, replacing
  the old single location line), and `pnpm build`/tests raise no red flag,
  but no live click-through was performed by me.
- No hosted-Supabase interaction of any kind was performed (none was needed
  for this feature — pure view-model + presentational changes).

## Test counts

- Before: 601/601 (per the last `init.sh` run cited in
  `progress/history.md`'s #19 entry).
- After: 605/605 (`bash init.sh`, `pnpm exec vitest run` — 22 test files, 4
  new tests in `tests/unit/selectors-parity.test.ts`).

## Status

Feature #20 remains `in_progress` in `feature_list.json` per instructions —
not marked `done`; awaiting reviewer approval.
