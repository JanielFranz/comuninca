# Implementation report: #15 create_event_with_validation

Status: implemented, NOT marked `done` (awaits reviewer and the leader's live check).

## Files
- `lib/validation/events.ts` (new): `createEventSchema(now)` factory (one schema for client and server, injectable clock), `checkEventInput(input, now)` (first failing message + `field`), `isValidMeetingUrl`, caps constants, `EventData` type.
- `lib/actions/events.ts`: `createEvent(input)` added (exports remain async functions + types only).
- `lib/dateUtils.ts`: `timeKeyInLima(now)` ("HH:MM" Lima, minute resolution).
- `lib/strings.ts`: `addEventModal` gains modality labels, meeting-link label/placeholder, `submitting`, and `errors.*` (all messages). Removed `attendeesLabel` and `validationError` (unused now).
- `lib/types.ts`: `EventFormState` gets `modality`, loses `attendeeIds`.
- `components/AddEventModal.tsx` (+css): radiogroup Presencial/Virtual, label/placeholder/input type switch with modality, attendee picker and its CSS removed, pending state (button disabled, `aria-busy`, "Agregando…"), error line has `role="alert"`, form `noValidate` so our es-PE messages show instead of native browser bubbles.
- `components/CalendarApp.tsx`: `submitForm` runs `checkEventInput` client-side, then `createEvent` in `useTransition`; success -> toast, close, reset form, `router.refresh()`. `localEvents` overlay removed; `attendeeOverrides` kept for #17.
- Tests: `tests/unit/event-validation.test.ts` (49), `tests/unit/create-event.test.ts` (12).

## Decisions
- Single input mapping: the modal has one field (`form.location`). On submit, Virtual sends `{location: "", meetingUrl: <field>}`, Presencial sends `{location: <field>, meetingUrl: ""}`. The schema normalizes: Presencial -> `meetingUrl: null`; Virtual -> `location: null`, `meetingUrl` or null. A link sent with Presencial (or an address with Virtual) is ignored, never validated.
- Precedence (single message): required fields (incl. invalid category/modality/date format/time format, all mapped to "Todos los campos son obligatorios.") > past date > past start (today only, minute resolution, equal allowed) > end <= start > length caps (title 120, location 200, description 2000; new es-PE messages) > meeting link validity. Malformed date/time/category values reuse the required message since the spec defines no other text.
- Meeting link: trimmed, <= 500 chars, must match `^https?://`, no whitespace, `new URL` must parse with http/https, no username/password. New message "El enlace de la reunión no es válido."
- Clock: all "past" rules use `todayKeyInLima` / `timeKeyInLima` on the server (`createEvent` calls `checkEventInput` with `new Date()` on the server). The client runs the same schema with the device instant converted to Lima, so messages are identical; the server is the authority.
- Non-object input to the schema is coerced to `{}` (result: required message, never raw Zod text). Unknown keys stripped (`hostId`, `id`, `pictureUrl`, ... never reach Prisma); `hostId` = session user id. USER with `onboardingCompleted: false` -> `FORBIDDEN`; ADMIN allowed.
- Success returns `mapEventRow(...)` view model (host = session user, no attendees), same shape as `listEvents`.
- Attendee picker: removed from the modal and from `CalendarApp` (no `attendeeIds` in form state). `buildAttendeeOptions` in `lib/selectors.ts` remains exported with its tests, now unused by app code.
- Events more than 3 months ahead are created successfully but fall outside the visible window (no rule added, per instructions).
- `eventSchema` from conventions is exposed as the factory `createEventSchema(now)` (a static instance would freeze the clock).

## Verification
- `bash init.sh` exit 0; Vitest 467 passed (406 existing + 61 new), 17 files.
- `pnpm build` passed.
- Dev smoke on port 3100 without cookies: `/calendar` -> 307 to `/login`. Server stopped; port 3100 free.
- Greps: no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase in `components/`; no `console.*`; no hard-coded UI text or `aria-label` literals in touched components; `lib/actions/events.ts` exports only async functions and types; no seed/USERS/TODAY imports in app code.

## NOT verified by me
- Any real login/registration or DB write; the live create flow (each invalid case against the hosted DB, `location` NULL for Virtual, `meetingUrl` stored, `hostId` with smuggled `hostId`, event visible in the calendar payload).
- The modal in a real browser (radio group look/keyboard, label switching, toast, pending state, `type="url"` field behavior, mobile layout).
- Server-side rejection of unauthenticated / not-onboarded users through the real Supabase session (unit-tested with mocks only).
- The clientside Lima conversion on devices with unusual time zones (relies on `Intl`).

## Review cycle 1 fixes
1. `lib/validation/events.ts`: text with no visible glyph (only `\p{Cf}`, `\p{Cc}`, U+115F, U+1160, U+3164, U+FFA0, U+2800, after trim) now counts as empty -> "Todos los campos son obligatorios." for title, description, location, category, date, times. Format characters inside visible text are kept (ZWJ emoji title accepted unchanged). Any `\p{Cc}` inside title/location is rejected (required message); description allows `\n`, `\r`, `\t` only. `isValidMeetingUrl` rejects any `\p{Cc}`/`\p{Cf}` (the link field keeps invisible-only input so it is rejected as an invalid link, not silently emptied). Precedence unchanged (checks live in the required stage).
2. Tests: invisible/control cases in `event-validation.test.ts`; `create` not called for them in `create-event.test.ts`; new `tests/unit/lima-clock.test.ts` (direct `timeKeyInLima` at 00:00, 23:59, 22:00 at 03:00Z next day; `todayKeyInLima`, `timeKeyInLima`, `parseUtcDateKey` under TZ=UTC, Pacific/Auckland, America/Lima; TZ restored after each test).
3. Verification: `bash init.sh` exit 0; Vitest 494 tests in 18 files.

## Review cycle 2 fix
`INVISIBLE_ONLY` now includes `\s`, so text of invisible characters separated by inner whitespace (e.g. U+200B, space, U+200D, U+3164) counts as empty -> "Todos los campos son obligatorios." in title, description, location. Format characters inside visible text, control-character rejection, description line breaks and precedence unchanged. Tests added in `event-validation.test.ts` (including regression for "Fiesta de barrio" and ZWJ emoji) and `create-event.test.ts` (`create` not called).
