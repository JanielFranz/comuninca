# Review — bug fix: stale client Router Cache stranding users on `/onboarding`

**Verdict:** APPROVED

This is a bug fix, not a `feature_list.json` task, so no acceptance-criteria
section applies. Reviewed on its own merits per
`progress/impl_fix_onboarding_navigation.md`.

## Evidence (executed by me, this session)

- `bash init.sh` → exit 0. Feature-list validation: "23 features, 15 done, 0
  in progress". Lint: 0 errors (3 pre-existing warnings in
  `app/layout.tsx`, `lib/usersQuery.ts`, `tests/unit/selectors-parity.test.ts`
  — unrelated to this fix, not introduced by it). Typecheck clean. Vitest:
  **18 files / 504 tests passed** — matches the implementer's reported count
  exactly (no test silently dropped elsewhere to mask a change: I read every
  new assertion below and they are additions inside existing `it` blocks, as
  claimed).
- `pnpm build` → `next build` (Turbopack) succeeded; all 9 routes compiled
  (`/`, `/admin`, `/admin/codes`, `/admin/users`, `/calendar`, `/login`,
  `/onboarding`, `/register`, `/_not-found`), no errors.
- `grep -n "console\.\|redirect(\|notFound(\|: any\|<any>" lib/actions/onboarding.ts lib/actions/auth.ts`
  → no matches.
- `grep -n "await revalidatePath"` → no matches (calls are fire-and-forget
  statements, per the documented Next.js pattern).
- `grep -n "^export "` on both files → only the pre-existing typed
  result unions (`CompleteOnboardingResult`, `SignInResult`, `RegisterResult`,
  `SignOutResult`) and the async functions (`completeOnboarding`, `signIn`,
  `signOut`, `register`). No new exports, no new error variants.
- File mtimes (`ls -la --time-style=full-iso`) show this session touched
  exactly six files, all between 13:33 and 13:38 on 2026-09-27:
  `lib/actions/onboarding.ts`, `lib/actions/auth.ts`,
  `tests/unit/onboarding.test.ts`, `tests/unit/auth-actions.test.ts`,
  `tests/unit/register.test.ts`, `progress/current.md` (+ the new
  `progress/impl_fix_onboarding_navigation.md`). `feature_list.json`,
  `proxy.ts`, and `lib/auth.ts` are all from 2026-09-26 (untouched by this
  session), and nothing under `prisma/` or `supabase/` is newer than the fix
  files. `progress/current.md`'s "Feature in progress" field is still
  `_none_`; the bug fix is logged only in the Log section, as required.

## Placement of `revalidatePath` (read every branch)

- `lib/actions/onboarding.ts:41-58` (`completeOnboarding`) — the two calls
  sit at lines 52-53, reached only after `result.count === 1` (the real
  write). `count === 0` returns `ALREADY_COMPLETED` at line 51, before the
  calls — verified not reachable. `INVALID_INPUT` (37), `FORBIDDEN` (33),
  `UNAUTHENTICATED` (31) all return earlier in the function body. The
  `catch` (UNEXPECTED, 55-58) returns after the calls' statement position in
  source but is a separate control path from a throw during the `prisma`
  call — a throw skips lines 52-54 entirely (they're after the `await` that
  would have thrown). Correct on every branch.
- `lib/actions/auth.ts:41-81` (`signIn`) — `revalidatePath(redirectTo)` at
  line 75, reached only after `row` is confirmed non-null (line 68 returns
  `UNEXPECTED` first otherwise) and after the credential/parse/error guards
  (46, 56-59) all return earlier. Correct.
- `lib/actions/auth.ts:83-95` (`signOut`) — calls at 88-90, reached only when
  `supabase.auth.signOut()` returns no `error` (87 returns early otherwise).
  Correct.
- `lib/actions/auth.ts:120-221` (`register`) — calls at 215-216, inside the
  final `try` block (208-220), reached only when the post-registration
  `signInWithPassword` itself succeeds (`if (error) return {... "/login"}` at
  214 returns first otherwise). Every earlier failure/rollback path
  (`CODE_REQUIRED`, `CODE_INVALID`, `EMAIL_IN_USE`, `INVALID_INPUT`, the
  `catch`/`compensate` path at 199-204) returns from the function body well
  before this final block is even reached — structurally unreachable from
  those branches, not merely untested. Correct. I checked specifically for
  the two scenarios called out in the task brief — the compensation/rollback
  branch and the "account created but post-registration sign-in fails"
  branch — and both correctly skip `revalidatePath`.

No `redirect()`/`notFound()` was introduced anywhere in either file (both
still return only typed results, consistent with `architecture.md` §3 and
`conventions.md` §2). No new error variant was added to any result union.

## Does this close the bug class? (non-blocking reasoning, not a defect)

`revalidatePath` is the right and sufficient primitive here: the leader's own
root-cause finding was that the client Router Cache had memoized the *outcome*
of an earlier visit to `/calendar` (a redirect-to-`/onboarding` response) and
was serving that stale entry on the next `router.push("/calendar")` without a
network round trip. `revalidatePath`, called server-side once the underlying
data changes, is exactly Next's documented mechanism to invalidate that cache
entry for a specific path before the client next navigates there.
`revalidateTag` would be the wrong tool (no cache tags are used by these
reads); reordering `router.refresh()` before `router.push()` client-side was
already effectively in place (`OnboardingForm.tsx`, `RegisterScreen.tsx`,
`LoginScreen.tsx` all already call `router.refresh()` immediately after
`router.push()`), and per the leader's live repro this ordering alone did not
prevent the staleness — consistent with `revalidatePath` being the necessary
piece, not a redundant one.

I checked whether any other Server Action has the same "mutate, then the
client navigates to a *different* route" shape and was left untouched:
- `lib/actions/events.ts:createEvent` — its only caller,
  `components/CalendarApp.tsx:222-230`, calls `router.refresh()` on success
  and does **not** `router.push()` elsewhere; the user stays on `/calendar`.
  `router.refresh()` re-fetches the *current* route directly and isn't
  subject to the same "cached outcome of a different earlier visit" failure
  mode this bug was about, so no `revalidatePath` is needed there. Reasoning
  holds.
- `lib/actions/admin.ts` (`listUsers`) and `lib/actions/invites.ts`
  (`generateInviteCodes`, `listInviteCodes`, `revokeInviteCode`) — none of
  these return a `redirectTo`, and their callers
  (`components/admin/GenerateCodesModal.tsx:76`,
  `components/admin/RevokeCodeButton.tsx:26`) likewise only call
  `router.refresh()` on the same page. No gap here.

No other action in `lib/actions/*` returns a route the client then
`router.push()`es to on success besides the four already fixed. This
observation is non-blocking; the leader/implementer's scope was correctly
sized.

## Tests

All three files load `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`
(or an equivalent forwarding mock) correctly, and every assertion checks the
**exact** path string(s), not just call-count:

- `tests/unit/onboarding.test.ts:160-162` — success asserts
  `toHaveBeenCalledTimes(2)` + `toHaveBeenCalledWith("/calendar")` +
  `toHaveBeenCalledWith("/onboarding")`; non-call assertions present on
  `UNAUTHENTICATED` (119), `FORBIDDEN` (129), `INVALID_INPUT` (140),
  `ALREADY_COMPLETED` (172), and the thrown-error path (181). A revert of the
  fix would fail the success test (no path asserted) and pass the
  non-call tests only if the implementation still returned early — no weak
  assertions found.
- `tests/unit/auth-actions.test.ts` — `signIn` ADMIN (44-45) and USER
  (58-59) each assert the exact single path; `signOut` success (143-146)
  asserts all three exact paths and count 3; non-call assertions cover
  invalid credentials (82), each `INVALID_INPUT` case (94), a thrown auth
  call (101), each `UNEXPECTED` status variant (112), missing-user-row (125),
  DB failure (135), and both `signOut` failure/throw cases (152, 158).
- `tests/unit/register.test.ts` — success (135-137, 179-180, 295-297) all
  assert the exact two paths with `toHaveBeenCalledTimes(2)` on the primary
  case; the "second registration, same code" test (300-307) explicitly
  clears the mock after the first success and asserts the second
  (`CODE_INVALID`) call makes zero `revalidatePath` calls — a strong,
  order-sensitive assertion that would catch a regression where the guard
  clause were accidentally removed. Every rollback/failure branch (CODE
  checks, email checks, all four rollback scenarios, both "session start
  fails/throws → /login" cases, the leak-check test) has an explicit
  `not.toHaveBeenCalled()`. I did not find any test in these three files that
  would still pass with the fix reverted — every success case pins the exact
  path(s), and every failure/rollback case pins zero calls.

## Checkpoints (adapted for a bug fix)

- C1: [x] Harness files present, `bash init.sh` exit 0 (verified above).
- C2: [x] No feature/status field was touched by this session —
  `feature_list.json` untouched (mtime 2026-09-26, before this session);
  `progress/current.md`'s "Feature in progress" is still `_none_`; the fix is
  correctly logged as a non-feature bug fix in the Log section only.
- C3: [x] Layering holds — both files remain pure Server Actions
  (`"use server"`, typed results, no `redirect()`/`notFound()`); Prisma
  accessed only via `@/lib/db`; Supabase only via `@/lib/supabase/*` and
  `@/lib/supabase/admin`; no secret introduced/logged; no `console.*`; no
  `any`. `revalidatePath` calls are synchronous, unawaited, and placed only
  on success returns (verified branch-by-branch above).
- C4: [x] New/changed assertions are in `tests/unit/*` (Vitest, mocked
  `next/cache`, mocked Supabase/Prisma clients — no real network); each
  asserts the concrete `revalidatePath` call(s)/paths, and each function has
  at least one explicit non-call assertion on a failure path. `pnpm test`:
  504/504 green.
- C5: [x] No suspicious untracked temp files from this session (checked
  mtimes); `progress/current.md` Log entry documents the fix; nothing left
  half-updated.

## Required changes

None.

## Observations (non-blocking)

1. The four fixed call sites cover every Server Action in the codebase whose
   result implies the client navigates to a *different* route after success;
   `createEvent`/admin/invite actions correctly stay same-page via
   `router.refresh()` alone and don't need this treatment (see reasoning
   above) — nothing further to fix.
2. `register`'s success branch calls `revalidatePath("/calendar")` and
   `revalidatePath("/onboarding")` even though a fresh registrant's next
   navigation target is `/onboarding` (not `/calendar`, since
   `onboardingCompleted` starts `false`) — the same pair `completeOnboarding`
   revalidates. This is harmless (revalidating an extra path costs nothing)
   and mirrors the existing code's own reasoning in
   `progress/impl_fix_onboarding_navigation.md`, so not a defect, just worth
   noting for a future reader.
