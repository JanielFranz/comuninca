# Implementation report: #13 admin_codes_list

Status left as `in_progress` (not marked done; reviewer + leader live check pending).

## Files
- `lib/actions/invites.ts`: added `listInviteCodes`, `revokeInviteCode` and types (`CodeRow`, `ListInviteCodesResult`, `RevokeInviteCodeResult`). Still only async function exports + types.
- `lib/codesQuery.ts` (new, pure): `CODES_PAGE_SIZE = 25`, `parseCodeStatus`, `buildCodesHref`. Reuses `parsePage`/`clampPage` from `lib/usersQuery.ts`.
- `lib/usersQuery.ts`: `computePageCount` gained an optional `pageSize` param (default `USERS_PAGE_SIZE`); existing behavior unchanged.
- `lib/validation/invites.ts`: `RevokeCodeSchema` (`id` non-empty string, max 100).
- `lib/strings.ts`: `STRINGS.admin.codes.*` copy for list, filters, statuses, revoke, errors, pagination.
- `components/admin/CodesTable.tsx` + `.module.css` (server component), `RevokeCodeButton.tsx` + `.module.css` (client, two-step confirm, pending state, inline error, `router.refresh()`), `generateCodesModel.ts` (`revokeErrorMessage`).
- `components/admin/GenerateCodesModal.tsx`: only `router.refresh()` after a successful generation (modal stays open showing the codes).
- `app/admin/codes/page.tsx` + `page.module.css`: list below the generate action; `await searchParams`; UNAUTHENTICATED -> `/login`, FORBIDDEN -> `/calendar`, UNEXPECTED -> es-PE alert; status filter links + prev/next links as GET links preserving each other's params.
- `tests/unit/admin-codes-list.test.ts` (new, 44 tests).

## Decisions
- `listInviteCodes`: guard first; `status` whitelist (else all); page 25; order `createdAt desc, id asc`; exact `select`; ISO dates; catch -> `UNEXPECTED` with no text.
- `revokeInviteCode`: guard, Zod, then ONE `updateMany({ where: { id, status: "UNUSED" }, data: { status: "EXPIRED" } })`. count 1 -> ok; count 0 -> `findUnique` -> `NOT_REVOKABLE` or `NOT_FOUND`. No read-then-write, never touches USED rows / `usedAt` / users. No `redirect()`.
- Revoked state is distinct by dashed red badge, muted struck-through code, and text "Revocado: ya no se puede usar" (not colour alone).
- Revoke button refreshes the router on failure too, since the row may have changed (e.g. code just used).
- Race: no code change needed in register; both sides use the same conditional `UNUSED` guard.

## Verification
- `bash init.sh` exit 0: ESLint 0 errors (2 pre-existing warnings), typecheck clean, Vitest 11 files / 310 tests passed (266 existing + 44 new).
- `pnpm build` passes (`/admin/codes` dynamic).
- Dev smoke on port 3100 without cookies: `/admin/codes` and `/admin/codes?status=USED&page=2` both 307 -> `/login`. Server stopped (killed only PID I started), port 3100 free.
- Greps: no `redirect(` in `lib/actions/*.ts`; no Prisma/Supabase imports in `components/`; no `dangerouslySetInnerHTML`; no `console.*` in touched files; no hard-coded UI text/aria-label literals in the new components/page; `invites.ts` exports only async functions + types.

## NOT verified by me
- Anything against the hosted DB: rendering of real UNUSED/USED/EXPIRED rows (consumer name/email + es-PE date), real revoke flipping to EXPIRED, registration with a revoked code rejected, revoking USED/revoked -> refused, missing id -> NOT_FOUND.
- anon/USER access to the page/action live; the true Postgres race between revoke and register (only simulated with an in-memory fake).
- Pagination/status filter with real data; the table and revoke confirm UX in a real browser (layout, mobile, `router.refresh()` after generate/revoke).
