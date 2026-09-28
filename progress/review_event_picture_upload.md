# Review — feature #16 `event_picture_upload`

**Verdict:** APPROVED (review cycle 2 of 2 — final)

> Cycle 1 verdict was CHANGES_REQUESTED because acceptance criterion #3
> ("next/image renders the stored picture" / AC 3.4.4) was entirely
> unimplemented. This cycle re-verifies the fix with executed evidence. The
> full cycle-1 evidence for everything that did **not** change (storage
> pipeline, server-side validation, rollback logic, `next.config.ts`, UI,
> layering/hygiene) is condensed below rather than repeated in full; nothing
> in that surface regressed (re-checked in this cycle, see "Regression
> re-checks").

## What changed since cycle 1 (verified, not just read)

1. **`pictureUrl` now flows end to end** — `lib/selectors.ts:285`
   (`pictureUrl: ev.pictureUrl` in `buildActiveEvent`'s real-event branch)
   and `lib/selectors.ts:245` (`pictureUrl: null` in the no-event branch) →
   `lib/types.ts:160` (`ActiveEventView.pictureUrl: string | null`) →
   `components/EventDetailModal.tsx:39-49` (conditional render via
   `next/image`). Confirmed correct, not just present:
   - `{event.pictureUrl && (...)}` — nothing renders when `null`, no layout
     shift, exactly as claimed.
   - `<Image src={event.pictureUrl} alt={t.eventPictureAlt(event.title)}
     fill sizes="(max-width: 440px) 100vw, 440px"
     className={styles.picture} />` — has `alt` (not empty/decorative this
     time, appropriately, since this is real content, not a local-only
     preview); `fill` is correctly supported: its parent,
     `.pictureWrap` (`components/EventDetailModal.module.css:28-36`), has
     `position: relative`, `width: 100%`, and `aspect-ratio: 960 / 540`,
     which gives it a real computed height — this is exactly what `fill`
     needs to avoid silently collapsing to zero height. `.picture {
     object-fit: cover }` completes the pattern correctly.
   - `t.eventPictureAlt` (`lib/strings.ts:134`):
     `(title: string) => \`Foto del evento: ${title}\`` — natural es-PE, no
     typos/encoding issues, and not a leak of anything: the title is
     already rendered in plaintext elsewhere in the same modal
     (`EventDetailModal.tsx:51`).
   - Rest of `EventDetailModal.tsx` is byte-for-byte the same layout/logic I
     reviewed in cycle 1 (`headerRow`, `title`, `metaLine`, `locationLine`,
     `description`, `hostRow`, `attendeesRow`, `joinButton`) — the only
     changes are the `next/image` import and the new conditional block
     inserted between `headerRow` and `title`.
   - `pnpm build` (re-executed) compiles the new `next/image` usage
     cleanly, with **no** "hostname not configured"/"Invalid src prop"
     warning and no new ESLint warnings beyond the same 4 pre-existing ones
     from cycle 1 — confirms the existing `images.remotePatterns` scoping
     from `next.config.ts` (unchanged this cycle) already covers it.
2. **Golden-master fixture update
   (`tests/fixtures/selectors-golden.json`)** — confirmed mechanical, not
   masking a behavioral difference:
   - All 5 `activeEvent/*` entries gained exactly one new key,
     `"pictureUrl": null`, inserted between `"description"` and
     `"hostInitials"` — matching `buildActiveEvent`'s actual field-emission
     order in both branches (verified by reading `lib/selectors.ts:234-254`
     and `274-294` directly). No other key or value in any of the 5 entries
     changed (I read the full block, lines 5626-5754, and compared field-
     by-field against what I read in cycle 1: `id`, `title`,
     `categoryLabel`, `color`, `tagBg`, `dateLabel`, `timeLabel`,
     `location`, `description`, `hostInitials`, `hostName`, `attendees`,
     `attendeeCount`, `noAttendees`, `isGoing`, `joinLabel`, `joinBg`,
     `joinColor` — all unchanged).
   - This is not a rubber-stamped `null`: it is the *correct* value, because
     `buildActiveEvent` sets `pictureUrl: ev.pictureUrl` and none of the
     parity test's synthetic `CalendarEvent` fixtures has an uploaded
     picture, so `ev.pictureUrl` is genuinely `null` for every one of them.
     Confirmed by executed test: `pnpm test` includes
     `tests/unit/selectors-parity.test.ts` in the green 545/545, so the
     golden master and the live selector output agree.
3. **Pre-decode length check** (`lib/actions/events.ts:30-38, 56-57`):
   ```
   const PICTURE_SERVER_MAX_BASE64_LENGTH = Math.ceil((PICTURE_SERVER_MAX_BYTES * 4) / 3)
   ...
   if (base64.length === 0 || base64.length > PICTURE_SERVER_MAX_BASE64_LENGTH || ...)
   ```
   Correctly placed **before** `Buffer.from(base64, "base64")` (which now
   only runs after this check passes), and the math is right (base64
   expands 3 bytes → 4 chars, so the ceiling is `600KB × 4/3`, rounded up).
   This addresses the cycle-1 observation directly and no longer depends
   solely on `next.config.ts`'s out-of-band 4 MB body limit.
4. **Compensating-delete-throws test**
   (`tests/unit/create-event.test.ts`, "the compensating delete ITSELF
   throwing still returns UNEXPECTED, not an uncaught error"): confirmed it
   actually simulates the throw (`del.mockRejectedValue(new Error("db
   unreachable during rollback"))`, combined with `upload.mockResolvedValue({
   error: {...} })` to trigger the rollback path in the first place), and
   asserts the **final** returned result via
   `await expect(createEvent(...)).resolves.toEqual({ ok: false, error:
   "UNEXPECTED" })` — an exact-shape match, which by construction leaks no
   message/text (there is no `message` field on the `UNEXPECTED` variant),
   plus `expect(del).toHaveBeenCalledTimes(1)` /
   `toHaveBeenCalledWith({ where: { id: "ev-1" } })`. This matches my
   original cycle-1 trace of the code (the delete call sits inside the
   `try` whose `catch` unconditionally returns `UNEXPECTED`) and now has
   executed coverage.
5. **`feature_list.json` #16 `paths`** — confirmed updated to include
   `components/EventDetailModal.tsx`, `lib/selectors.ts`, and `lib/types.ts`
   alongside the original four, so the scope-deviation question from cycle
   1 is now moot: everything touched is in scope.
6. **`import "dotenv/config"`** — left as-is in `next.config.ts`, as
   expected (this was an observation, not a required change, in cycle 1).

## Executed evidence (re-run by me this cycle)

- `bash init.sh` → exit 0. ESLint: 0 errors, the same 4 pre-existing
  warnings as cycle 1 (no new ones from the `next/image`/selector changes).
  TypeScript: clean. Vitest: **545/545** passed across 19 files (544 + 1
  new, exactly as expected — the 1 new test is the compensating-delete
  test; the golden-master fixture update is a data change, not a new test
  case, so it doesn't add to the count).
- `pnpm build` → compiles successfully, generates all 10 static/dynamic
  routes, no warnings about `next/image`/`remotePatterns`.
- Targeted re-runs: `tests/unit/create-event.test.ts` (39 tests, including
  the new compensating-delete test) and `tests/unit/storage.test.ts` (25
  tests) both green in isolation.

## Regression re-checks (all clean, re-executed this cycle)

- `grep -n "redirect(" lib/actions/*.ts` → no matches.
- `grep -rln "prisma\|supabase" components/` → no matches.
- `grep -rn "console\." lib/storage.ts lib/actions/events.ts lib/selectors.ts lib/types.ts components/EventDetailModal.tsx components/EventDetailModal.module.css components/AddEventModal.tsx next.config.ts` → no matches.
- `lib/actions/events.ts` exports: `ListEventsResult`, `listEvents`,
  `CreateEventInput`, `CreateEventResult`, `createEvent` — unchanged surface
  (async functions + types only).
- No `any` introduced in `lib/selectors.ts`, `lib/types.ts`, or
  `components/EventDetailModal.tsx`.

## Acceptance criteria (feature_list.json #16) — final status

1. "An accepted picture is stored at the fixed size and its URL saved on
   the event" → **met** (logic verified by executed tests; real-bucket
   artifact still needs the leader's live check, see Pending — unchanged
   from cycle 1).
2. "Oversized or unsupported files are rejected before upload with a typed
   error" → **met**, now with an additional local defense-in-depth
   pre-decode length check (see above).
3. "next/image renders the stored picture" → **met**. `next/image` is used
   in `components/EventDetailModal.tsx`, wired from real `pictureUrl` data
   through `lib/selectors.ts` and `lib/types.ts`, compiles cleanly against
   the existing `images.remotePatterns` scoping, and is exercised by the
   golden-master/parity test suite (though real-image rendering in a real
   browser against the real hosted bucket still needs the leader's/user's
   check — see Pending).

## Carried-forward observations (non-blocking, unchanged from cycle 1 — none required further action this cycle)

- The preview thumbnail in `AddEventModal.tsx` still shows the raw,
  unprocessed selected file (not the actual resized 960×540 JPEG bytes),
  mitigated by a `16:9`/`object-fit: cover` CSS box. Unchanged, still
  acceptable.
- `pictureRequestRef`/object-URL cleanup still does not cover the case
  where `CalendarApp` unmounts (e.g. via logout) while a picture is
  mid-processing in the still-open Add Event modal — a narrow,
  session-scoped leak, previously disclosed, unchanged, still non-blocking.
- `import "dotenv/config"` in `next.config.ts` remains very likely redundant
  (Next's own `loadEnvConfig` runs before `next.config.ts` is required, per
  `node_modules/next/dist/server/config.js:1182` and
  `node_modules/next/dist/build/index.js:417`), but harmless either way;
  the coordinator confirmed this is explicitly left as the implementer's
  call.
- No rate limit on repeated uploads/re-uploads (pre-existing, not new to
  this feature).

## Checkpoints

- **C1**: [x] Harness files present; `bash init.sh` exit 0 (executed).
- **C2**: [x] Exactly one feature (`#16`) `in_progress`; `depends_on` (`[15]`)
  is `done`; `paths` now matches the files actually touched.
- **C3**: [x] Layering holds: `lib/selectors.ts` stays a pure function (no
  I/O added), `lib/storage.ts` still has zero Prisma/Supabase imports, no
  Prisma/Supabase under `components/`, no `redirect()` in
  `lib/actions/*.ts`, `EventDetailModal.tsx` remains presentational (reads
  `event.pictureUrl` from its props, does not fetch). The cycle-1
  incompleteness (missing wiring to satisfy AC 3.4.4) is resolved.
- **C4**: [x] `pnpm test` 545/545 green (executed), Supabase/Prisma mocked,
  no real network calls; `pnpm exec eslint .` / `pnpm exec tsc --noEmit`
  clean (via `init.sh`).
- **C5**: [x] No suspicious untracked files beyond the expected build
  output; `progress/current.md`/`feature_list.json` state is consistent
  with an approved, reviewer-signed-off feature ready for the leader's live
  check before `done`.

## Required changes

None. All cycle-1 required changes are verified fixed with executed
evidence.

## Pending live/manual checks (leader / hosted project) — unchanged from cycle 1, still required before `done`

The leader's live check against the real hosted Supabase Storage bucket
must still assert, at minimum:

1. An accepted picture upload actually lands at
   `event-pictures/<eventId>.jpg`, is exactly 960×540 pixels, and its public
   URL is fetchable with no auth header.
2. An oversized (>8 MB) or wrong-type file is rejected client-side before
   any network call, and a crafted/oversized `picture` string sent directly
   to the Server Action is rejected server-side with `INVALID_PICTURE` and
   creates no Event row and no Storage object.
3. A forced Storage failure (e.g. temporarily wrong bucket name or a
   network-level block) during a real `createEvent` call rolls back the
   Event row completely — nothing left in Postgres, nothing left in
   Storage.
4. **New this cycle**: with a real uploaded picture, opening the event's
   detail modal in a real browser actually renders it via `next/image`
   against the real hosted URL (this was the missing piece in cycle 1; the
   wiring is now in place and compiles cleanly, but has never been
   exercised against a real image over the network).

Manual/browser checks the user should still do (no jsdom/RTL in this repo):

1. File picker + real 8 MB/wrong-type rejection with real `File` objects,
   and the real "processing" state duration for a large photo.
2. The real preview thumbnail's visual crop in `AddEventModal`, and the
   "remove picture" control's visible effect.
3. The real quality-stepping/compression result sizes for a variety of real
   photos (portrait, landscape, screenshot, etc.).
4. The event detail modal's picture rendering: correct 960×540 aspect box,
   no layout shift, sensible appearance on both mobile widths (`100vw`) and
   the modal's fixed `440px` desktop width, for an event with a picture and
   confirmation that nothing renders (no broken-image icon, no gap) for an
   event without one.
