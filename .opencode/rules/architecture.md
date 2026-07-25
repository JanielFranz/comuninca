# Architecture (binding) — Comuninca

Rules-level architecture reference for Comuninca. This is the condensed,
binding map; the authoritative product specs live in `docs/`. Keep this in
sync with them.

> Source-of-truth documents (read these when a detail is ambiguous):
> - `docs/user-stories.md` — epics, user stories, acceptance criteria
>   (US/AC numbering).
> - `docs/technical-blueprint.md` — stack choices, Prisma data model, auth/RBAC
>   design, CI/CD, phased roadmap (the source of `feature_list.json`).
> - `README.md` — the current in-memory prototype's structure.

---

## 1. Stack (binding)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | React 19, Server Components by default |
| Language | TypeScript 5 (strict) | `@/*` path alias → repo root |
| Package manager | **pnpm only** | never `npm`/`yarn`; lockfile is `pnpm-lock.yaml` |
| DB | **Supabase Postgres** | managed Postgres + Auth + Storage |
| ORM | Prisma | client built once in `lib/db.ts`; migrations only |
| Auth | Supabase Auth + `@supabase/ssr` | cookie sessions; factories in `lib/supabase/*` |
| Storage | Supabase Storage | bucket `event-pictures` |
| Validation | Zod + react-hook-form | schemas shared in `lib/validation/` |
| Styling | **CSS Modules** | co-located `*.module.css` per component — no Tailwind |
| Copy / i18n | `lib/strings.ts` | all user-facing copy, es-PE |
| Tests | Vitest (unit) + Playwright (E2E) | see `verification.md` |
| CI/CD | GitHub Actions → Vercel | see `docs/technical-blueprint.md` §7 |

Do not substitute an alternative for any binding choice without updating this
table and the relevant rules file.

## 2. Layering (binding)

```
React components ─▶ Server Actions (lib/actions/*) ─▶ lib/db.ts ─▶ Supabase Postgres
   (client islands)    (the ONLY persistence path)      (Prisma singleton)
        │
        └─▶ Server Components (app/**/page.tsx) ─▶ lib/db.ts (read-only queries)
```

- **`app/`** — routes per Blueprint §6: `(auth)/login`, `(auth)/register`,
  `onboarding`, `calendar`, `admin/users`, `admin/codes`. Pages are Server
  Components that load data via Prisma and pass it down as props. Use
  `"use client"` only where interactivity demands it (modals, calendar
  interactions).
- **`lib/actions/*`** — Server Actions (`"use server"`) are the single
  mutation path: `auth.ts`, `onboarding.ts`, `invites.ts`, `events.ts`,
  `admin.ts`. Every action **self-authorizes** via `lib/auth.ts`
  (`requireUser` / `requireAdmin`) — a Server Action can be invoked directly,
  so `middleware.ts` is not a substitute for an in-action guard.
- **`middleware.ts`** — session refresh (`updateSession` from
  `lib/supabase/middleware.ts`) + route gates: unauthenticated → `/login`;
  non-admin → away from `/admin/*`; USER with `onboardingCompleted=false` →
  `/onboarding`.
- **`components/`** — presentational. The existing prototype components
  (`MonthView`, `WeekView`, `AddEventModal`, `EventDetailModal`, `DayModal`,
  `Modal`, `Toast`, `Header`, `ProfileMenu`, `CategoryLegend`) are kept and
  extended — they receive data as props, never fetch, never touch Prisma or
  `process.env`.
- **`lib/`** — `lib/db.ts` is the **only** module constructing a Prisma
  client; `lib/supabase/*` are the only modules constructing Supabase clients
  (`server.ts`, `client.ts`, `middleware.ts`); `lib/validation/*` holds the
  shared Zod schemas; `lib/selectors.ts` and `lib/dateUtils.ts` stay **pure
  functions** (no I/O) so they remain trivially unit-testable;
  `lib/strings.ts` holds all copy.
- **`prisma/`** — `schema.prisma` (per Blueprint §3), `migrations/` (source of
  truth), `seed.ts` (idempotent dev seed, feature #7).
- **`supabase/`** — versioned SQL migrations for the `auth.users → public.User`
  sync trigger (feature #4).

A dependency arrow may only point **rightward/downward** in that chain. A
component reaching for Prisma, or a selector reading `process.env`, is a
design error — stop and report.

## 3. Hard boundaries

- **Persistence only through `lib/db.ts`.** Never `new PrismaClient()`
  elsewhere. Components never touch the DB; they receive data as props.
- **Secrets are server-only.** `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
  `DIRECT_URL` are never referenced from a client component and never
  defaulted in code. Only `NEXT_PUBLIC_*` may reach the browser. See the env
  table in Blueprint §8.
- **Authorization inside every Server Action.** `requireUser()` /
  `requireAdmin()` from `lib/auth.ts` run before any mutation. Middleware is
  defense-in-depth, not the primary control.
- **`redirect()` / `notFound()` are render-layer only.** Do not call them from
  programmatically-invoked Server Actions — return a typed result instead
  (e.g. `{ error: "CODE_INVALID" }`). Reserve them for pages.
- **All copy in `lib/strings.ts` (es-PE).** No hard-coded user-facing strings
  in components; dates/times only via `lib/dateUtils.ts` (`Intl` es-PE).
- **Category stays a string.** Per US 3.1.1 the event category set is "to be
  defined" by the owner — until then keep the prototype's six options; do not
  invent new ones.

## 4. Prototype awareness

The repo starts as an in-memory prototype: demo login (`submitLogin` in
`components/CalendarApp.tsx` accepts any credentials), seed data in
`lib/constants.ts`, no backend. Features #6–#20 replace these incrementally
with Supabase Auth, Postgres, and Storage per `docs/technical-blueprint.md`.
When a feature touches prototype behavior, follow the blueprint — and where
`user-stories.md` and the prototype disagree, **`user-stories.md` wins** (it
describes the target product). Flag discrepancies in your progress note.
