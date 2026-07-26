# Conventions — Comuninca development standards

Applies to all code in this repo. Read before writing code. The product specs
live in `docs/user-stories.md` / `docs/technical-blueprint.md`; this file
covers code style and framework patterns.

---

## 1. Language & tooling

- **TypeScript, strict.** No `any` to silence the compiler; model the type.
  Prefer `type`/`interface` over inline shapes for anything reused (see
  `lib/types.ts`).
- **pnpm only.** Add deps with `pnpm add` / `pnpm add -D`; never `npm`/`yarn`,
  never hand-edit `package.json` versions. The committed lockfile is
  `pnpm-lock.yaml` (the legacy `package-lock.json` is removed by hygiene work;
  do not regenerate it).
- Run everything through the package scripts (`pnpm dev|build|lint|test`) or
  `pnpm exec <bin>` (`pnpm exec tsc --noEmit`, `pnpm exec prisma …`).
- Don't add a library when the stdlib, React, or an existing dependency covers
  the need.

## 2. Next.js / React patterns

- **Server Components by default.** Add `"use client"` only when a component
  needs state, effects, or browser APIs. Keep client bundles small — push
  data loading to the server (`app/**/page.tsx` queries via `lib/db.ts`).
- **Server Actions** (`lib/actions/*`, `"use server"`) are the mutation
  layer. They take typed args, authorize first (`requireUser`/`requireAdmin`),
  validate with Zod, and **return typed results** for recoverable outcomes
  (e.g. `{ error: "CODE_USED" }`) — do **not** `redirect()` or `notFound()`
  from an action.
- Route groups follow Blueprint §6: `(auth)/login`, `(auth)/register`,
  `onboarding`, `calendar`, `admin/users`, `admin/codes`.
- Shared primitives (`Modal`, `Toast`) stay generic; feature components live
  next to their route or in `components/<area>/`.

## 3. Naming

| Thing                                    | Convention             | Example                                            |
| ---------------------------------------- | ---------------------- | -------------------------------------------------- |
| Components / files exporting a component | PascalCase             | `UsersTable.tsx`, `GenerateCodesModal.tsx`         |
| CSS Modules                              | same name as component | `UsersTable.module.css`                            |
| Hooks                                    | `useX` camelCase       | `useCalendarNav`                                   |
| Server actions                           | `verbNoun`             | `createEvent`, `toggleJoin`, `generateInviteCodes` |
| lib helpers                              | camelCase              | `requireUser`, `buildWeekData`, `dateKey`          |
| Types / Zod schemas                      | PascalCase             | `CalendarEvent`, `RegisterSchema`                  |
| Constants                                | `UPPER_SNAKE_CASE`     | `STRINGS`, `CATEGORY_META`, `MOBILE_BREAKPOINT`    |
| Prisma models                            | singular PascalCase    | `User`, `InviteCode`, `Event`, `EventAttendee`     |

- snake_case is **not** used in TS; reserve it for DB columns Prisma maps.
- Never hard-code copy, route paths, or magic numbers inline — copy goes to
  `lib/strings.ts`, tunables to `lib/constants.ts`.

## 4. Data & Prisma

- Import the shared client: `import { prisma } from "@/lib/db"`. Never
  construct a client elsewhere.
- Schema changes go through **Prisma migrations** (`pnpm exec prisma migrate
dev`); never `db push` against Supabase, never `migrate dev` in production
  (`migrate deploy` only, from the CI release step).
- Keep `prisma/schema.prisma` in sync with Blueprint §3; when they diverge,
  update the blueprint too.
- Multi-write mutations (registration: user + code consumption) run in a
  single `prisma.$transaction`.

## 5. Validation & errors

- **Validate at boundaries with Zod**: every Server Action payload, every
  form (react-hook-form + resolver), every route param. Schemas live in
  `lib/validation/` and are shared client/server — one source of truth per
  form (`registerSchema`, `onboardingSchema`, `eventSchema`,
  `inviteCountSchema`).
- Validation messages are the exact es-PE strings from the feature's
  acceptance criteria (e.g. "Todos los campos son obligatorios."), defined in
  `lib/strings.ts`.
- Throw/return the **specific** failure; catch the specific error. Don't wrap
  a whole handler in `catch (e) {}`.
- Login errors stay generic (US 1.2.4 — never reveal whether email or
  password was wrong).

## 6. Styling

- **CSS Modules**, co-located per component (`Component.module.css`), as the
  prototype already does. No Tailwind, no CSS-in-JS.
- Reuse the existing design tokens/patterns from the prototype's styles
  (dark surfaces, `#E8AC3E` accent) — don't introduce a parallel theme.
- Respect `prefers-reduced-motion`; keep interaction transitions ≤ 300ms.

## 7. Secrets & environment

- Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`)
  are read server-side only, **never** defaulted in code, **never**
  referenced from a client component, and **never** logged. Only
  `NEXT_PUBLIC_*` is browser-safe.
- Every variable belongs in `.env.example` with an **empty** value; real
  values live in `.env.local` (gitignored) and per-environment in Vercel /
  GitHub secrets. `.env*` is gitignored — keep it that way.

## 8. Testing

See `verification.md` for the levels. In short: **Vitest only** for
unit/integration; pure logic (`lib/selectors.ts`, `lib/dateUtils.ts`,
`lib/validation/*`) gets direct unit tests; DB-backed action tests run
against a disposable local Supabase Postgres, never your working database;
mock Supabase Auth/Storage clients — the suite must pass offline. Playwright
specs (feature #22) live in `tests/e2e/`. Name tests `test/describe` by
`<unit> <scenario>`.
