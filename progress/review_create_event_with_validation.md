# Review — feature 15 create_event_with_validation (cycle 3, final)

**Verdict:** APPROVED

The cycle-2 blocker (invisible characters separated by an inner space) is fixed. Approval is pending the live/manual checks below; no code blocker remains.

## Executed evidence

- `bash init.sh` exit 0; Vitest 18 files, 504/504 (494 + 10 new); `pnpm build` passes. Files changed since cycle 2 (mtime scan after 17:20): `lib/validation/events.ts`, `tests/unit/event-validation.test.ts`, `tests/unit/create-event.test.ts`, the implementer report, plus `progress/current.md` (leader bookkeeping) and build artifacts (`next-env.d.ts`, `tsconfig.tsbuildinfo`). No other test file was touched, so the original 406 still pass unmodified.
- `INVISIBLE_ONLY` is now `/^[\s\p{Cf}\p{Cc}ᅟᅠㅤﾠ⠀]*$/u` (`lib/validation/events.ts:33`).
- Probe with the real schema (scratch dir deleted): `"​ ​"`, `"ㅤ ⠀"`, `"‍  ‌ ⁠"`, `" ​\t­ "`, `"​ ​"`, `"​ ㅤ"`, `"​\n​"` in title, description AND location (Presencial) all give "Todos los campos son obligatorios.".
- Regressions: `Fiesta de barrio`, `👨‍👩‍👧‍👦 Fiesta` (stored unchanged), `Niño y canción ñandú ÁÉ`, description with `\n`/`\r\n`/double inner spaces (stored `"a  b\nc"`), title 120 chars, 60 x `ñ ` (119), description at 2000 (with newlines) and location 200 all OK; title 121 and description 2001 give the too-long messages. Earlier behaviors unchanged: NUL/BEL inside visible text rejected (required), invisible-only + past date -> required, past date > end, end<=start precedence intact; links unchanged (verified in cycle 2, code path untouched).
- Old-pattern simulation (class without `\s`): `"​ ​"`, `"ㅤ ⠀"`, `"‍  ‌ ⁠"` return not-empty (old `false`, new `true`), so the new tests fail against the previous pattern.
- New tests assert exact messages: `event-validation.test.ts` "invisible text with inner whitespace" (5 values x title/description/location `toBe(t.required)` + accepted-text regressions); `create-event.test.ts` "createEvent invisible text with inner whitespace" (4 cases, exact `{ok:false, message: t.required, field}` and `create` not called). Caveat unchanged: expected messages come from `STRINGS`; literals were checked by eye against `docs/user-stories.md` in cycle 1.

## Acceptance criteria

- "Each invalid case (empty required field, past date, past start time today, end <= start, Presencial without address) shows its exact message and creates nothing" -> met at unit/probe level (executed); live check pending.
- "Virtual without an address succeeds with no location stored; Virtual with a link stores meetingUrl" -> met at unit level (executed); real DB check pending.
- "Valid submit creates the event with hostId = current user, shows the success toast, and the event appears on the calendar" -> hostId from session, exactly one create (executed, unit); toast/refresh/calendar appearance by reading only, pending live/browser check.

## Checkpoints

- C1: [x] init.sh exit 0.
- C2: [x] only #15 `in_progress`; dependency #14 done.
- C3: [x] layering, guard first, typed results, no redirect, copy in strings, no console/any.
- C4: [x] 504/504, lint/tsc clean, mocks only, Lima-clock and invisible-text tests added and shown to bite.
- C5: [x] for this stage: feature correctly `in_progress`; history entry and `done` follow the leader's live check (must be done at closure).

## Required changes

None.

## Observations (non-blocking, still standing)

- No rate limit / per-user cap on event creation; duplicate-submit window (closure-based `isCreating` guard, no idempotency key).
- `isValidMeetingUrl` accepts odd parseable forms (`https://@x.com`, `https://.`, `https:///x`), stored verbatim (trim only). Feature #20 must re-validate on render and use `target="_blank" rel="noopener noreferrer"`; internal-address links are acceptable (nothing fetches them server-side).
- Length counted in UTF-16 units (61 emoji exceed a 120 cap); invisible characters around visible text are kept.
- Modality switch keeps typed text in the single field; category pills lack a selected state for assistive tech (pre-existing); events > 3 months ahead are hidden by the window; `buildAttendeeOptions` unused by app code.
- A device with a wrong clock can be falsely blocked client-side near the boundary; server stays authoritative.

## Pending live/manual checks (leader on the hosted project, or the user's browser)

1. Each invalid submit through the real modal/server returns its exact message and creates NO row (count before/after): empty title; `category:""` (server); past date -> "No puedes crear un evento en una fecha pasada."; today + past start -> "La hora de inicio ya ha pasado."; end <= start -> "La hora de fin debe ser posterior a la hora de inicio."; Presencial with empty address -> "Todos los campos son obligatorios."; invisible-only title such as `"​ ​"`.
2. Virtual without address: row with `location IS NULL`, `meetingUrl IS NULL`, `modality = VIRTUAL`.
3. Virtual with `https://meet.example.com/x`: `meetingUrl` stored exactly, `location IS NULL`; `javascript:alert(1)` -> "El enlace de la reunión no es válido." and no row.
4. Valid Presencial submit with a smuggled `hostId`: row `hostId` = session user id, `pictureUrl` NULL, `meetingUrl` NULL; event in the `/calendar` payload with the real host name, no other user's email; correct Lima day; a family-emoji title stored intact.
5. Unauthenticated call rejected (no row); USER with `onboardingCompleted=false` -> FORBIDDEN (no row); ADMIN can create.
6. Browser: toast "Evento agregado al calendario", modal closes and resets (modality back to Presencial), event appears without manual reload, submit disabled while pending, radios keyboard-operable, date pre-fill from an empty day and from the day modal (AC 3.1.4), mobile layout.
