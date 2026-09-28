# Implementation report: #9 invite_code_generation

## Files touched
- New: `lib/inviteCode.ts` (pure generator, injectable random source), `lib/validation/invites.ts` (`GenerateCodesSchema`, `checkQuantityInput`), `lib/actions/invites.ts` (`generateInviteCodes`), `components/admin/GenerateCodesModal.tsx` + `.module.css`, `components/admin/generateCodesModel.ts` (pure helpers: error mapping, `joinCodes`, `copyToClipboard`), `app/admin/codes/page.tsx` + `page.module.css`, `tests/unit/invite-codes.test.ts`.
- Edited: `lib/strings.ts` (`STRINGS.admin.codesLink`, `STRINGS.admin.codes.*`), `app/admin/page.tsx` (one link to `/admin/codes`) + `app/admin/page.module.css` (`.link` style), `progress/current.md`.
- Not touched: `prisma/**`, `supabase/**`, `proxy.ts`, `components/Modal.tsx`, `feature_list.json` (still `in_progress`).

## Decisions
- Code: 26 Crockford base32 symbols from `crypto.randomBytes`, `byte & 31` (unbiased), grouped `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X` (130 bits). Stored hyphenated.
- Action order: `requireAdmin()` first, then Zod, then one `createManyAndReturn` (only `code` in rows; DB defaults give UNUSED and createdAt). Up to 3 attempts, retrying only on `P2002`; any other error, a wrong row count, or 3 collisions returns `UNEXPECTED`. No logging, no `redirect()`.
- Modal: single-file client component, step 1 (quantity, live hint, disabled confirm while invalid or pending, error box, Enter submits, input focused on open) and step 2 in place (monospace list, "Copiar todos" newline-joined, per-row "Copiar"), Toast auto-clears after 2.6 s with timer cleanup on unmount. Clipboard missing or rejecting shows `copyFailed`. Closing resets all state. Created date not shown (skipped).
- The hint shows the neutral range text ("Entre 1 y 50 códigos.") while the field is empty, and the error hint once something is typed; confirm is disabled in both cases.

## Verification
- `bash init.sh` exit 0: ESLint clean (1 pre-existing font warning in `app/layout.tsx`), tsc clean, Vitest 5 files, **130 tests passed** (90 existing + 40 new).
- `pnpm build` passes. Route table:
```
┌ ƒ /
├ ○ /_not-found
├ ƒ /admin
├ ƒ /admin/codes
├ ƒ /calendar
└ ○ /login
ƒ Proxy (Middleware)
```
- Dev smoke without cookies: `/admin/codes` 307 -> `/login`; `/admin` 307 -> `/login`; `/login` 200. Dev server stopped (PID 20604 killed), port 3000 confirmed free.
- Greps: no `Math.random` in the code path; no prisma/supabase mention under `components/`; no `redirect(` in `lib/actions/invites.ts`; no literal user-facing JSX text in the new components (all from `STRINGS`).
- `git diff --ignore-cr-at-eol --stat` for tracked files I touched: only `lib/strings.ts` (+41/-2, CRLF preserved). `app/admin/*` is untracked so it does not appear in the diff.

## NOT verified by me
- A real admin generating codes against the hosted DB (leader's live check: exactly N unique persisted UNUSED rows with createdAt, USER gets FORBIDDEN, out-of-range counts rejected, test rows cleaned up). `createManyAndReturn` was only exercised against a mock.
- Modal rendering, focus, Enter-to-submit, the disabled-button hint, copy-all and per-row copy, clipboard behavior (incl. insecure-context failure), and toast confirmations in a real browser. There is no jsdom/RTL in the repo, so none of the click/clipboard/toast behavior is covered by automated tests; only the pure helpers behind it are. The user must try these by hand.
- The Prisma `P2002` retry path against a real unique violation (tested only with a P2002-shaped error).
