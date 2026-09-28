# Fix: stale client Router Cache stranding users on `/onboarding`

## Bug (already root-caused by the leader)

1. `register`'s success handler in `components/RegisterScreen.tsx` calls
   `router.push("/calendar")`. For a freshly registered user
   (`onboardingCompleted: false`) the server redirects that request to
   `/onboarding` — correct at that moment.
2. Next.js's client-side Router Cache remembers that `/calendar` outcome for
   this tab.
3. Later, `OnboardingForm.tsx`'s success handler calls `completeOnboarding`,
   gets `{ ok: true, redirectTo: "/calendar" }`, and calls
   `router.push("/calendar")` again — but the stale cache entry means the
   client router never issues a new request, so the user stays stuck on
   `/onboarding`.
4. A hard reload of `/calendar` works immediately, proving the server side is
   correct and this is a pure stale-client-cache bug.

## Fix

Call `revalidatePath` (from `next/cache`) inside the affected Server Actions,
on their success paths only, right before returning the success result. This
invalidates the client Router Cache for the named path so the next
navigation to it fetches fresh data.

### `lib/actions/onboarding.ts`

- Added `import { revalidatePath } from "next/cache"`.
- In `completeOnboarding`, immediately before `return { ok: true, redirectTo:
"/calendar" }` (i.e. only on the real write path, `result.count === 1`):
  ```ts
  revalidatePath("/calendar")
  revalidatePath("/onboarding")
  ```
- Not called on `ALREADY_COMPLETED` (`count === 0`), `INVALID_INPUT`,
  `FORBIDDEN`, `UNAUTHENTICATED`, or the thrown-error (`UNEXPECTED`) path —
  those all return before reaching the new lines.

### `lib/actions/auth.ts`

- Added `import { revalidatePath } from "next/cache"`.
- `signIn` success: right before returning, now does
  ```ts
  const redirectTo = row.role === "ADMIN" ? "/admin" : "/calendar"
  revalidatePath(redirectTo)
  return { ok: true, redirectTo }
  ```
  so exactly the route being navigated to (`/admin` or `/calendar`) is
  revalidated. Not called on `INVALID_INPUT`, `INVALID_CREDENTIALS`, or any
  `UNEXPECTED` path (missing `public.User` row, DB failure, thrown error).
- `register` success (the final `signInWithPassword` call after the account
  is already created and linked): only when that sign-in itself succeeds
  (`redirectTo` will be `"/calendar"`):
  ```ts
  if (error) return { ok: true, redirectTo: "/login" }
  revalidatePath("/calendar")
  revalidatePath("/onboarding")
  return { ok: true, redirectTo: "/calendar" }
  ```
  Not called when that post-registration sign-in fails or throws
  (`redirectTo: "/login"`), and not called on any earlier failure/rollback
  path (`CODE_REQUIRED`, `CODE_INVALID`, `EMAIL_IN_USE`, `INVALID_INPUT`,
  `UNEXPECTED`) — all of those return before the account is even fully
  linked, well before this block.
- `signOut` success: right before returning `{ ok: true }`:
  ```ts
  revalidatePath("/calendar")
  revalidatePath("/admin")
  revalidatePath("/onboarding")
  ```
  so that if the same tab subsequently logs in as a different user, none of
  those routes serve another user's stale cached page. Not called if
  `supabase.auth.signOut()` reports an error or throws.

No other behavior changed: every existing typed-result contract, error
handling, and the "no `redirect()` inside Server Actions" rule are untouched.
`revalidatePath` is called as a plain synchronous statement (not awaited).

## Tests

Added a `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`-style
mock plus concrete `expect(revalidatePath)...` assertions to:

- `tests/unit/onboarding.test.ts` — success calls `revalidatePath("/calendar")`
  and `revalidatePath("/onboarding")` exactly once each; not called on
  `UNAUTHENTICATED`, `FORBIDDEN`, `INVALID_INPUT`, `ALREADY_COMPLETED`, or a
  thrown error.
- `tests/unit/auth-actions.test.ts` — `signIn` success calls `revalidatePath`
  with exactly the returned `redirectTo` (`/admin` for an ADMIN, `/calendar`
  for a USER); not called on `INVALID_INPUT`, `INVALID_CREDENTIALS`, or any
  `UNEXPECTED` case. `signOut` success calls `revalidatePath("/calendar")`,
  `revalidatePath("/admin")`, `revalidatePath("/onboarding")`; not called on
  failure or a thrown error.
- `tests/unit/register.test.ts` — success (including the hyphenless-code
  normalization case) calls `revalidatePath("/calendar")` and
  `revalidatePath("/onboarding")`; not called on `CODE_REQUIRED`,
  `CODE_INVALID`, `EMAIL_IN_USE`, `INVALID_INPUT`, any `UNEXPECTED`/rollback
  path, or when the post-registration sign-in itself fails/throws
  (`redirectTo: "/login"`); the "second registration, same code" test clears
  the mock after the first successful call and asserts the second
  (`CODE_INVALID`) call does not revalidate anything.

No existing assertion was weakened; all prior test bodies are intact aside
from the added `expect(revalidatePath)...` lines.

## Verification

- `bash init.sh` — exit 0. Lint clean (pre-existing warnings only, no
  errors), TypeScript typecheck clean, Vitest suite green: **504 tests
  passed** (test count unchanged — all new assertions were added inside
  existing `it` blocks rather than as new ones).
- `pnpm build` — succeeded (`next build` with Turbopack), all routes compiled
  including `/onboarding`, `/calendar`, `/admin`, `/login`, `/register`.
- Grepped both files: `revalidatePath` is imported from `"next/cache"` in
  both `lib/actions/onboarding.ts` and `lib/actions/auth.ts`, and every call
  site sits only on a success-path return, never on an error path.

## Not done here (by design)

Real-browser verification against the hosted Supabase project (the actual
repro/fix confirmation with a live register → onboarding → calendar flow) is
left to the leader, per the task's hard safety rules. No login, registration,
seed, migration, or `.env` access was performed in this session.
