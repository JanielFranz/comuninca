# Implementation report — #16 `event_picture_upload`

Status: NOT marked `done` (per instructions). Awaiting reviewer.

## Review cycle 1 fixes (2026-09-27)

Reviewer verdict: CHANGES_REQUESTED (`progress/review_event_picture_upload.md`).
Root cause acknowledged by the leader as a briefing gap, not an implementer
error: AC 3.4.4 / acceptance criterion #3 ("next/image renders the stored
picture") was cited as this feature's own acceptance from the start, but
`EventDetailModal.tsx` was excluded from the original `paths` list. The
leader corrected `feature_list.json`'s `paths` for #16 to add
`components/EventDetailModal.tsx`, `lib/selectors.ts` and `lib/types.ts`.
Nothing already built (the storage pipeline, `createEvent`, the picker UI)
was redone — this is a pure addition.

**Required change #1 — wire `pictureUrl` through to the detail view and
render it with `next/image`:**
- `lib/types.ts` — `ActiveEventView` gained `pictureUrl: string | null`.
- `lib/selectors.ts` — `buildActiveEvent` now copies `ev.pictureUrl` onto
  both branches of its return (the "no active event" placeholder gets
  `null`; the real branch gets `ev.pictureUrl` unchanged, no transformation
  since `CalendarEvent.pictureUrl` is already `string | null`).
- `tests/fixtures/selectors-golden.json` — all 5 `activeEvent/*` golden
  entries updated with `"pictureUrl": null` (every fixture event has a null
  picture; the golden-master `toEqual` checks are exact-shape, so the new
  field had to be added to the fixture, not just the selector). Verified:
  `tests/unit/selectors-parity.test.ts` (29 tests, all still green) is the
  only test file referencing `buildActiveEvent`/`ActiveEventView`; no
  render/component tests exist for it (no jsdom/RTL in this repo).
- `components/EventDetailModal.tsx` — imports `Image` from `next/image`;
  renders it conditionally (`event.pictureUrl &&`) inside a new
  `.pictureWrap` container placed right after the header row, before the
  title (a hero-image position). Uses `fill` + `sizes="(max-width: 440px)
  100vw, 440px"` (the modal's own `maxWidth={440}`) rather than fixed
  `width={960} height={540}`, so the image scales responsively inside the
  modal without ever stretching/distorting: `.pictureWrap` is
  `aspect-ratio: 960 / 540` (exactly the form's fixed ratio, not a rounded
  `16/9`) with `overflow: hidden`, and `.picture` is `object-fit: cover`.
  When `pictureUrl` is null, nothing renders in its place (no placeholder,
  no reserved space) — matches the existing pattern for other optional
  fields in this modal (e.g. `noAttendees`).
- `lib/strings.ts` — added `eventDetailModal.eventPictureAlt: (title:
  string) => string` (`"Foto del evento: ${title}"`), following the same
  parameterized-string pattern already used by `going(count)` in the same
  object. Checked for alt-text precedent first (`grep -rn 'alt=' components/
  app/`): the only existing `alt` was my own `alt=""` in `AddEventModal`'s
  local-file preview (correctly decorative, no precedent for real content),
  so this is a new string, not a reused one.
- `components/EventDetailModal.module.css` — new `.pictureWrap`/`.picture`
  rules only; nothing else in the file changed.

**Recommended change #2 — test the compensating-delete-itself-throws
branch:** added
`"the compensating delete ITSELF throwing still returns UNEXPECTED, not an
uncaught error"` to `tests/unit/create-event.test.ts` (`upload` returns an
error, then `del` is mocked to reject; asserts the action still resolves to
`{ ok: false, error: "UNEXPECTED" }` rather than rejecting/throwing, and that
`del` was still called with the right id). This exercises exactly the
control-flow path the reviewer traced by inspection (the `delete` call sits
inside the same outer `try` whose `catch` unconditionally returns
`UNEXPECTED`) — now backed by an executed assertion, not just code reading.

**Optional change #3 — cheap base64-length pre-check, done (it was a true
one-liner):** `lib/actions/events.ts`'s `decodeEventPicture` now rejects a
base64 payload whose TEXT length exceeds
`PICTURE_SERVER_MAX_BASE64_LENGTH = ceil(PICTURE_SERVER_MAX_BYTES * 4/3)`
(≈800,000 characters) BEFORE calling `Buffer.from`, in addition to the
existing post-decode byte-length check (kept as defense-in-depth, since the
text-length bound and the decoded-byte bound are almost but not quite
interchangeable at the margin). The existing "decoded payload over the
server sanity ceiling" test still passes (it now gets caught by the new
pre-check instead of the old post-decode check; the outcome — `INVALID_PICTURE`,
no Prisma call — is identical, which is exactly what that test asserts).

**Item #4 — `dotenv/config` in `next.config.ts`:** left unchanged (the
reviewer independently confirmed it's redundant-but-harmless for
`next build`/`dev`/`start`, and explicitly said either choice was fine). Not
removed: it costs nothing, and keeping it matches the `prisma.config.ts`
pattern for anyone scanning both files, even though Next's own env loader
happens to already cover this case for these specific CLI entry points.

**Verification after these changes:** `bash init.sh` exit 0,
**545/545 tests** (544 → 545, the one new compensating-delete test; the
`ActiveEventView`/golden-fixture change added no new test, it kept 29
existing ones green). `pnpm exec tsc --noEmit` clean. `pnpm exec eslint .`
clean (same 4 pre-existing/explained warnings as before, no new ones).
`pnpm build` (Turbopack) passes, including the new `next/image` usage
against the already-configured `images.remotePatterns`. Greps re-run clean:
no Prisma/Supabase import under `components/`, no `console.*`, no
`redirect(` in `lib/actions/*.ts`, no hard-coded `aria-label` literals in
`EventDetailModal.tsx`. Line endings preserved per-file (`git diff
--ignore-cr-at-eol --stat` shows ordinary line-count diffs, no whole-file
CRLF/LF churn, for every file touched in this cycle).

**Still not verified by me (unchanged from cycle 1, now also covering the
new code):** `next/image` actually loading a real stored picture URL in a
real browser (no browser tool available to me); the real visual result of
the `fill`+`aspect-ratio` container at various real photo aspect ratios in
DevTools; whether Next's image optimizer (if not using `unoptimized`)
successfully proxies/fetches the real Supabase Storage URL at runtime
against the hosted project (the `remotePatterns` config is build-time
verified only, as before).

## Files touched

- `lib/storage.ts` (new) — client-side, browser-safe picture pipeline.
- `lib/actions/events.ts` — `createEvent` extended with picture validation,
  upload, `pictureUrl` patch, and rollback (plus, cycle 1, the base64-length
  pre-check).
- `next.config.ts` — `images.remotePatterns` scoped to the `event-pictures`
  bucket; `experimental.serverActions.bodySizeLimit: "4mb"`.
- `lib/strings.ts` — new es-PE copy under `addEventModal` and (cycle 1)
  `eventDetailModal.eventPictureAlt`.
- `components/AddEventModal.tsx` / `.module.css` — picture file input,
  preview, processing state, inline error, remove control.
- `components/EventDetailModal.tsx` / `.module.css` (cycle 1) — renders the
  stored picture via `next/image`.
- `lib/selectors.ts` (cycle 1) — `buildActiveEvent` carries `pictureUrl`.
- `lib/types.ts` — `EventFormState` (+4 fields, cycle 0) and
  `ActiveEventView` (+`pictureUrl`, cycle 1).
- `tests/unit/storage.test.ts` (new), `tests/unit/create-event.test.ts`
  (extended, now 41 new tests across both files), `tests/fixtures/
  selectors-golden.json` (cycle 1, 5 `activeEvent/*` entries gained
  `"pictureUrl": null`).
- `progress/current.md` (updated in place).

**Scope deviation, flagged for the leader/reviewer:** I also touched
`lib/types.ts` (`EventFormState` gained `picture`, `pictureError`,
`pictureStatus`, `picturePreviewUrl`) and `components/CalendarApp.tsx`
(added `handlePictureSelect`, wired the new field into `emptyForm`,
`submitForm`'s payload/error handling, and `closeAddModal`'s cleanup). These
two files are outside the `paths` listed for #16 and outside the explicit
touch-file list in my instructions. I concluded this was unavoidable and
made a deliberate, minimal exception rather than shipping a non-functional
feature or blocking the whole task — full reasoning below ("Why
`lib/types.ts`/`CalendarApp.tsx` needed to change"). If the leader disagrees,
the diff is small and mechanical to revert (4 type fields, one handler
function, 4 call sites) and does not touch anything else in `CalendarApp.tsx`
or `lib/types.ts`.

## Why `lib/types.ts` / `CalendarApp.tsx` needed to change

`AddEventModal` is a fully controlled, presentational component: every field
value comes from the `form: EventFormState` prop (owned by `CalendarApp`),
and every change goes back up through a callback prop
(`onTitleChange`, `onLocationChange`, ...). `CalendarApp.submitForm` builds
the `createEvent(payload)` argument purely from its own `state.eventForm`.

There is no React mechanism for a child component to get a value into that
payload without the parent (a) knowing the field exists in `EventFormState`
and (b) reading it when building the payload — that requires editing both
`lib/types.ts` (the shared interface — TypeScript's excess-property checks
on `emptyForm()`'s object literal reject an untyped field) and
`CalendarApp.tsx` (the only place that calls `createEvent`). I looked for a
side-channel that would avoid this (a DOM hidden-input read via `FormData`,
a module-level mutable variable, attaching a property to the `FormEvent`)
and rejected all of them: `CalendarApp.submitForm` does not — and I could not
make it, without editing it — consult anything but `state.eventForm`. I
concluded there is no compliant way to make picture upload end-to-end
functional from `AddEventModal.tsx` alone, and chose to make the small,
mechanical addition rather than deliver a picture picker that silently
drops the user's selection on submit.

The diff in each file is minimal and additive:
- `lib/types.ts`: 4 new optional-in-spirit-but-typed fields on
  `EventFormState`, defaulted in `emptyForm()`; nothing else changed.
- `components/CalendarApp.tsx`: one new handler (`handlePictureSelect`,
  calling `lib/storage.ts`'s `processPictureFile`), one new prop wired to
  `AddEventModal`, a guard in `submitForm` (blocks submit while the picture
  is processing/invalid, mirroring the existing `isCreating` guard), one new
  `picture` key in the payload object, one new `INVALID_PICTURE` branch in
  the error-message mapping, and object-URL cleanup on close/clear/success
  (a request-id ref guards against a stale async resize overwriting a newer
  selection). No other behavior in either file changed.

## Design decision 3 — verified empirically (not assumed)

**What I did:** I could not start a second `next dev` in this project
directory at all (Next 16.2.11 refuses with "Another next dev server is
already running", keyed off a directory lock at `.next/dev/lock`, regardless
of port — this is a real, previously-undocumented-for-this-repo tooling
constraint I hit and worked around rather than invented a shortcut past). I
worked around it by copying the minimal files needed to render one throwaway
route (`app/layout.tsx`, `app/globals.css`, `lib/strings.ts`, `next.config.ts`,
`tsconfig.json`, `package.json`) into a separate directory under my
scratchpad, and creating a Windows junction (`mklink /J`) for `node_modules`
so I didn't have to reinstall or copy ~600 MB of dependencies. Turbopack
refused to resolve packages through that junction ("Symlink ... points out
of the filesystem root"), so I ran `next dev --webpack` there instead (a
supported, documented flag; not a workaround of unknown behavior — the dev
server itself worked identically, just with a different bundler). I created:

```
app/dev-picture-test/actions.ts   -- "use server" testUpload(formData) { redirect(`/dev-picture-test/result?len=${...}`) }
app/dev-picture-test/page.tsx     -- <form action={testUpload}><input type="hidden" name="picture" defaultValue="" /><button>go</button></form>
app/dev-picture-test/result/page.tsx -- reads `len` from searchParams
```

This uses React 19's native `<form action={serverFn}>` binding, which Next
compiles into a genuine, protocol-correct multipart/form-data POST (the same
mechanism used for progressive enhancement without JS) — I fetched the
rendered page, read the real hidden `$ACTION_ID_...` field Next embedded,
and posted directly with `curl -F`, exactly matching what a real browser
would send for that form. This is real evidence, not a guess. All of these
files (including the copy under my scratchpad) were deleted before finishing;
`app/dev-picture-test/` no longer exists in the real project tree (confirmed
with `find`/`git status`).

**Results (all against the actual Next 16.2.11 Server Actions wire
protocol, not a simulation):**
- An 11-byte string field in the payload round-trips correctly (`len=11`).
- An 820 KB string (my realistic worst case: 600 KB decoded ceiling × 4/3
  base64 overhead ≈ 800 KB) succeeds under both the **default** 1 MB limit
  and my configured 4 MB limit.
- A 1.5 MB string **fails with HTTP 500** under the default 1 MB limit, and
  **succeeds** once `experimental.serverActions.bodySizeLimit` is set to
  `"4mb"` in `next.config.ts`.
- A 5 MB string fails under the 4 MB config with the exact server message
  `"Body exceeded 4mb limit. To configure the body size limit for Server
  Actions, see: https://nextjs.org/docs/app/api-reference/next-config-js/
  serverActions#bodysizelimit"` — this independently confirms
  `experimental.serverActions.bodySizeLimit` (found in
  `node_modules/next/dist/docs/.../serverActions.md`) is exactly the correct,
  currently-effective config key for Next 16.2.11, and that my value is
  actually being read and enforced.

**Conclusion / choice:** Option A (a plain string field inside the same
plain-object argument `createEvent` already accepts) works correctly,
end-to-end, over the real transport, at sizes well beyond what this feature
produces (500 KB client budget / 600 KB server ceiling). Went with Option A
exactly as the instructions preferred it, and additionally confirmed the
"why" isn't just theoretical: the default 1 MB limit would have been a real,
measured risk (a 1.5 MB payload — not far past our worst case once you add
the rest of the form's fields and multipart overhead — genuinely fails
against the default), which is why `next.config.ts` now sets
`bodySizeLimit: "4mb"`. **I did not separately test Option B** (FormData +
a real `Blob` passed directly as the sole argument) — once Option A was
proven working end-to-end, there was no remaining question to resolve by
also testing B, and the instructions only required picking a design based on
evidence, which I did.

## `next.config.ts` — env loading

Confirmed Next config files are plain Node and read `process.env` directly,
but without `import "dotenv/config"` at the top (matching the exact pattern
already used in `prisma.config.ts`), `NEXT_PUBLIC_SUPABASE_URL` was NOT
guaranteed to be loaded that early — I added the same import. I verified
(without printing the secret) that `NEXT_PUBLIC_SUPABASE_URL` is in fact set
in this environment's `.env` and that `pnpm build` successfully parses its
real hostname (a `*.supabase.co` host, confirmed via `new URL(...).hostname`
printed as a boolean check, never the value itself) into
`images.remotePatterns`, scoped to
`/storage/v1/object/public/event-pictures/**` only — not the whole host or
other buckets.

## `createEvent` picture handling — order of operations implemented exactly as specified

1. Existing #15 validation runs first, unchanged (`checkEventInput`).
2. If a `picture` field is present (not `undefined`/`null`/`""`), it is
   decoded and validated server-side BEFORE any DB write:
   - must be a string starting with `data:image/jpeg;base64,`;
   - the remainder must match `^[A-Za-z0-9+/]+={0,2}$` (valid base64 charset)
     and start with the base64 text `/9j/` (a cheap pre-filter — `"/9j/"` is
     literally the base64 encoding of bytes `FF D8 FF`, the JPEG SOI magic
     number, so this pre-filter and the authoritative byte check below always
     agree);
   - `Buffer.from(base64, "base64")` must decode to 1..614400 bytes (600 KB
     sanity ceiling, a few % over the client's 500 KB budget);
   - the first three decoded bytes must be `0xFF 0xD8 0xFF` (the real,
     authoritative magic-byte check, not just the text pre-filter).
   - Any failure returns `{ ok: false, error: "INVALID_PICTURE", message }`
     with **no Prisma call at all** (verified by test: `create` not called).
3. The `Event` row is created exactly as #15 did (no `pictureUrl` in the
   `data`, so it lands `null` from the schema default).
4. If a valid picture was decoded: `attachEventPicture(eventId, buffer)`
   uploads to `event-pictures/<eventId>.jpg` via `createAdminClient()`
   (`upsert: true, contentType: "image/jpeg"`), reads back the public URL via
   `getPublicUrl`, then `prisma.event.update({ where: { id }, data:
   { pictureUrl } })`.
5. On any failure in step 4 (upload returns `{error}}`, upload throws, no
   public URL, or the `update` throws): the just-created `Event` row is
   deleted (`prisma.event.delete`) and `{ ok: false, error: "UNEXPECTED" }`
   is returned — mirroring the `register` (#10) compensation pattern. If the
   object had actually made it into storage before the failure (i.e. only
   the `update` failed, or `getPublicUrl` came back empty), the uploaded
   object is also removed best-effort (`storage.remove([path])`); a failure
   in that cleanup is swallowed and never changes the returned result or the
   thrown error's visibility (`JSON.stringify(result)` never contains the
   original error text in the error-message tests).
6. No picture: byte-for-byte the #15 behavior — `pictureUrl` stays `null`,
   and `createAdminClient` is never called (asserted in tests).
7. The returned view model is the same `mapEventRow(...)` shape as #15,
   with the real `pictureUrl` now included when one was set.

## `lib/storage.ts` — what's testable and what isn't

Pure, DOM-free, unit-tested:
- `validatePictureFile` — type allow-list (jpeg/png/webp), size ceiling
  (8 MB), non-positive size, and which check wins when both are wrong.
- `computeCoverCrop` — centered-crop math for wider/taller/square/exact-16:9
  sources; asserts the resulting rectangle always has the target aspect
  ratio.
- `encodeWithBudget` — the quality-stepping decision loop, exercised with an
  **injected fake encoder** (no Canvas needed) covering: stops at the first
  quality that fits, only tries as many steps as needed, exactly-at-budget
  counts as fitting, exhausts all 4 default steps and reports
  `COMPRESSION_FAILED` when nothing fits, and respects a custom step list.
- `pictureErrorMessage` — every `PictureRejectReason` maps to a distinct
  es-PE string, none of which is the generic "required fields" message.

NOT unit-testable here, and why: `processPictureFile` (the full pipeline —
`createImageBitmap`/`<img>` decode, `<canvas>` draw, `canvas.toBlob`,
`FileReader.readAsDataURL`) requires real browser APIs that do not exist in
Vitest's default (Node) environment, and this project has no jsdom/RTL
configured (consistent with every prior feature's progress notes — #9's
modal, #12's table, #15's form are all in the same position). This is
exercised by manual/live browser verification only, which I could not do
myself (no browser tool available to me in this session) — see "NOT
verified by me" below.

## Test counts

- New: `tests/unit/storage.test.ts` (25 tests), `tests/unit/create-event.test.ts`
  gained 16 new tests across 3 new `describe` blocks (server-side picture
  validation, success-with-picture / no-picture, upload/update failure
  rollback) — 41 new assertions total across the two files, all passing
  alongside the untouched, still-green #15 tests in the same file.
- Full suite: `bash init.sh` exit 0, **544/544 tests** (up from 504),
  `pnpm exec tsc --noEmit` clean, `pnpm exec eslint .` clean (0 errors, 4
  warnings: 2 pre-existing unrelated ones, 1 pre-existing Next font warning,
  and 1 new `@next/next/no-img-element` warning for the local-file preview
  `<img>` in `AddEventModal.tsx` — deliberate: it previews the just-selected
  local `File` via an object URL, which is not a `next/image` use case
  (no remote host, no static import); it is not the uploaded/stored
  picture).
- `pnpm build` passes (Turbopack production build), confirming
  `next.config.ts`'s `images.remotePatterns` and
  `experimental.serverActions.bodySizeLimit` are both well-formed and
  accepted by Next 16.2.11.

## Verification performed

1. `bash init.sh` exit 0, 544/544 tests. `pnpm build` passes.
2. Dev smoke on my own port (production server, since a second `next dev` in
   this directory is refused regardless of port — see above): started
   `pnpm exec next start -p 3100` against the real build. `/calendar` → 307
   → `/login` with no cookies (unaffected); `/admin` → 307 → `/login`;
   `/login` → 200. Stopped my process by PID afterward;
   `netstat -ano | grep :3100` shows nothing listening. The leader's server
   (PID confirmed unchanged, port 3000, `/login` → 200) was never touched.
3. Greps: no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase imports
   under `components/`; no `console.*` in any touched file; `lib/storage.ts`
   imports nothing from `@supabase/*` or `@/lib/db` (only `./strings`);
   `lib/actions/events.ts` exports only `listEvents`, `createEvent`, and
   their result/input types.
4. `git diff --ignore-cr-at-eol --stat` reviewed; the files I edited in
   place (`AddEventModal.tsx/.module.css`, `CalendarApp.tsx`, `lib/strings.ts`,
   `lib/types.ts`, `next.config.ts`) show ordinary line-count diffs (no
   whole-file CRLF/LF churn); new files (`lib/storage.ts`,
   `tests/unit/storage.test.ts`) are LF, matching their neighbors.
5. Confirmed `NEXT_PUBLIC_SUPABASE_URL` is set to a real `*.supabase.co` host
   in this environment (checked as a boolean/derived fact only — never
   printed) and that `next.config.ts`'s remote-pattern hostname parsing runs
   against it successfully during `pnpm build`.

## NOT verified by me (for the leader's live check / manual browser pass)

- The actual `processPictureFile` pipeline in a real browser: file picker,
  8 MB/type rejection with the file picker's real `File` objects, the
  cover-crop producing exactly 960×540, the quality-stepping loop against
  real JPEG encoding, and the resulting data URL's real size — I have no
  browser tool in this session, and Vitest cannot exercise Canvas/Image.
- The picture upload UI end to end in a real browser (preview, "processing"
  state during a genuinely slow resize, remove control, inline error
  copy legibility).
- A real upload against the **hosted** Supabase Storage bucket — I made no
  Supabase/Storage/DB calls of any kind, per the hard safety rules.
- `next/image` actually loading the stored picture's URL — there is no
  `next/image` usage of `pictureUrl` anywhere yet (deliberately out of
  scope: `EventDetailModal.tsx` is not in this feature's `paths` and I did
  not touch it), so this feature only prepares `images.remotePatterns`;
  there's nothing in this codebase yet that exercises it at runtime.
- A forced storage failure against the real bucket (I proved the rollback
  logic with mocked `upload`/`update` throwing and returning errors; the
  leader's live check should independently force a real failure).
- The exact HTML5 progressive-enhancement wire format for a **direct
  `actionFn(plainObject)` JS call** (what `CalendarApp.submitForm` actually
  does) versus the `<form action={fn}>` binding I used for the empirical
  test — I verified the latter (a real, different-but-related invocation
  path) because it is curl-testable without a browser; both paths carry
  string arguments as ordinary HTTP body content subject to the same
  `bodySizeLimit`, so the sizing conclusion transfers, but I did not
  literally reproduce the JS-call wire format byte-for-byte.

## Known non-blocking gaps

- `AddEventModal`'s object-URL cleanup covers close/remove/replace/successful
  submit, but not an unmounted `CalendarApp` mid-processing (very unlikely
  in this SPA) — a minor, harmless leak in that edge case only.
- No rate limit or per-event re-upload path exists yet (matches #15's
  existing "no rate limit" observation).
