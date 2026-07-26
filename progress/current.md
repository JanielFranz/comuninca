# Current Session

> Cleared when each session closes; its summary moves to `history.md`. While
> working, **keep this updated in real time**, not at the end.

- **Feature in progress:** #6 — `login_logout`
- **Date:** 2026-07-25

## Plan

1. Add/update login strings in `lib/strings.ts` (es-PE)
2. Create `lib/actions/auth.ts` — Server Actions `login` and `logout`
3. Refactor `components/LoginScreen.tsx` — dual-mode: Server Action (new) + controlled props (backward compat with CalendarApp)
4. Create `app/(auth)/login/page.tsx` — Server Component login page
5. Wire `logout` Server Action in `components/CalendarApp.tsx`
6. Verify: `pnpm exec tsc --noEmit` clean, `pnpm lint` clean, `bash init.sh` green
7. Write report to `progress/impl_login_logout.md`

## Log

- 2026-07-25 — Feature #6 started; read rules, existing source files, and feature spec.
