# Comuninca — Technical Blueprint

> How we will build the product described in [`user-stories.md`](./user-stories.md).
> Chosen stack (fixed): **Next.js, Supabase, Prisma ORM, GitHub Actions**.
> Everything else (auth approach, validation, testing, deployment) is proposed
> here with the rationale.

---

## 1. Tech stack

| Area                 | Choice                                                                   | Why                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework            | **Next.js 16 (App Router) + React 19 + TypeScript**                      | Already the codebase foundation; Server Components + Server Actions give us a full-stack app without a separate API layer.                                                                                        |
| Database             | **Supabase (managed Postgres)**                                          | Managed Postgres + Auth + Storage in one service; generous free tier for a community app.                                                                                                                         |
| ORM                  | **Prisma v7.7.0**                                                        | Typed schema/migrations for all app tables (users, invite codes, events, attendees); `prisma generate` gives end-to-end type safety.                                                                              |
| Auth                 | **Supabase Auth** (email/password)                                       | Handles hashing (bcrypt), sessions, JWTs out of the box (US 4.1.4). Pairs with `@supabase/ssr` for cookie sessions in App Router.                                                                                 |
| Authorization (RBAC) | **`role` column on `users` + Next.js middleware + Server Action guards** | Middleware redirects unauthenticated/forbidden routes (US 1.2, US 2.1.6); every Server Action re-checks the role server-side (defense in depth).                                                                  |
| File storage         | **Supabase Storage** (bucket: `event-pictures`)                          | Event picture uploads (US 3.1.1); fixed size enforced by client-side resize before upload; served via `next/image` remote patterns.                                                                               |
| Validation           | **Zod** (shared client/server schemas)                                   | One schema per form (register, onboarding, invite generation, event create) reused by react-hook-form on the client and Server Actions on the server — single source of truth for all the AC validation messages. |
| Forms                | **react-hook-form + @hookform/resolvers**                                | Ergonomic form state for the multi-field register/onboarding/event forms; Zod resolver maps errors to fields.                                                                                                     |
| Styling              | **CSS Modules** (keep current)                                           | The codebase already styles every component with co-located `*.module.css`; no reason to churn.                                                                                                                   |
| State (UI)           | **React state + Server Components**                                      | Current `CalendarApp.tsx` state pattern moves to: server-fetched data via Prisma in Server Components, mutations via Server Actions, small client islands for modals/interactivity.                               |
| Date/time            | **Existing `lib/dateUtils.ts` + `Intl` (es-PE)**                         | Keep; formatting helpers already satisfy US 4.2.2.                                                                                                                                                                |
| Unit tests           | **Vitest**                                                               | Pure logic (`lib/selectors.ts`, date utils, validators, week-view overlap layout) is already pure functions — ideal Vitest targets.                                                                               |
| E2E tests            | **Playwright**                                                           | Covers the big flows: register-with-code → onboarding → calendar; admin code generation; event create/join; week-view overlap.                                                                                    |
| Lint/format          | **ESLint + Prettier**                                                    | Enforced in CI.                                                                                                                                                                                                   |
| CI/CD                | **GitHub Actions**                                                       | Lint → typecheck → unit tests → build on every PR; Prisma migration + deploy on merge to `main`.                                                                                                                  |
| Hosting              | **Vercel**                                                               | Native Next.js hosting; preview deployments per PR, production on `main`.                                                                                                                                         |

---

## 2. Architecture overview

```
┌────────────┐   HTTPS    ┌──────────────────────────────────────────┐
│  Browser    │ ─────────▶ │            Vercel (Next.js 16)            │
│  (React UI) │ ◀───────── │                                          │
└────────────┘            │  Server Components ──► Prisma ──┐          │
                          │  Server Actions  (guarded)      │          │
                          │  Middleware (auth/RBAC gates)   ▼          │
                          └─────────────────────────────► Supabase      │
                                                          ├─ Postgres  │
                                                          │  (users,   │
                                                          │   codes,   │
                                                          │   events)  │
                                                          ├─ Auth      │
                                                          └─ Storage   │
                                                             (pictures)│
```

**Request flow**

1. **Middleware** (`middleware.ts`) runs first: refreshes the Supabase session cookie, redirects unauthenticated users away from protected routes, and keeps normal users out of `/admin/*` (US 2.1.6).
2. **Server Components** read data through Prisma directly (users table, events for the visible month/week window).
3. **Mutations** (register, generate codes, create/join event, onboarding) go through **Server Actions** in `lib/actions/`, each of which: verifies the session, checks the role, validates input with Zod, executes via Prisma, and revalidates the affected route.
4. **Prisma** talks to Supabase Postgres over `DATABASE_URL` (connection pooler) for runtime and `DIRECT_URL` for migrations.

---

## 3. Data model (Prisma schema)

`prisma/schema.prisma` (sketch — the single source of truth once written):

```prisma
enum Role {
  ADMIN
  USER
}

enum InviteStatus {
  UNUSED
  USED
  EXPIRED
}

enum Modality {
  IN_PERSON   // "Presencial"
  VIRTUAL     // "Virtual"
}

model User {
  id                  String    @id                 // mirrors Supabase auth.users.id
  email               String    @unique
  fullName            String
  role                Role      @default(USER)      // US 1.1.5 — never ADMIN via registration
  birthday            DateTime? @db.Date            // shown in admin table (US 2.1.2)
  profession          String?                       // Profesión — optional (US 1.4.2)
  occupation          String?                       // Ocupación — mandatory (US 1.4.3)
  ikigai              String?                       // Ikigai — optional (US 1.4.2)
  onboardingCompleted Boolean   @default(false)     // one-time form gate (US 1.4.5)
  createdAt           DateTime  @default(now())     // registration date (US 2.1.2)

  inviteCodeId        String?   @unique
  inviteCode          InviteCode? @relation(fields: [inviteCodeId], references: [id])
  hostedEvents        Event[]   @relation("Host")
  memberships         EventAttendee[]
}

model InviteCode {
  id         String       @id @default(cuid())
  code       String       @unique                   // crypto-random, ≥ 128-bit entropy (US 4.1.4)
  status     InviteStatus @default(UNUSED)          // unused / used / expired (US 2.2.6)
  createdAt  DateTime     @default(now())
  usedAt     DateTime?                              // consumption date (US 2.2.6, US 2.3.1)
  usedBy     User?                                  // consumer identity (US 2.3.1)
}

model Event {
  id          String    @id @default(cuid())
  title       String
  category    String                              // TBD per US 3.1.1 — string now, enum/table later
  date        DateTime  @db.Date
  startTime   String                              // "HH:MM" 24h (keeps current model)
  endTime     String
  modality    Modality
  location    String?                             // physical address — required only if IN_PERSON (US 3.1.2/3.1.10)
  meetingUrl  String?                             // optional for VIRTUAL (US 3.1.11)
  description String
  pictureUrl  String?                             // Supabase Storage path (US 3.1.1, US 3.4.4)
  hostId      String
  host        User      @relation("Host", fields: [hostId], references: [id])
  attendees   EventAttendee[]
  createdAt   DateTime  @default(now())

  @@index([date])                                 // month/week range queries
}

model EventAttendee {
  event   Event  @relation(fields: [eventId], references: [id])
  eventId String
  user    User   @relation(fields: [userId], references: [id])
  userId  String

  @@id([eventId, userId])                         // a user can join an event only once
}
```

**Supabase Auth sync**: a Postgres trigger on `auth.users` insert creates the matching `public.User` row (id, email). Role, names and profile fields are filled by the registration action. This is the standard Supabase + Prisma pattern.

---

## 4. Auth & RBAC design

| Concern               | Implementation                                                                                                                                                                                                  | Stories covered          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Sign up               | Server Action `register`: Zod-validate → check invite code is `UNUSED` → `supabase.auth.signUp` → create `User` row in the **same transaction** that marks the code `USED` + `usedBy`/`usedAt` → session issued | US 1.1.1–1.1.6, US 2.2.7 |
| Code errors           | Distinct Zod refinement results → "code required" / "invalid, used or expired"                                                                                                                                  | US 1.1.2, US 1.1.3       |
| Login                 | `supabase.auth.signInWithPassword`; on success read `role` and redirect: `ADMIN → /admin`, `USER → /calendar`                                                                                                   | US 1.2.1–2.1.3           |
| Generic error         | Same message for wrong email or password                                                                                                                                                                        | US 1.2.4                 |
| Logout                | `supabase.auth.signOut` → redirect `/login`                                                                                                                                                                     | US 1.3.1                 |
| Onboarding gate       | Middleware + Server Component check: `USER` with `onboardingCompleted = false` is forced to `/onboarding`; form submits occupation (required) / profession / ikigai, then flips the flag                        | US 1.4.1–1.4.8           |
| Route protection      | Middleware matcher on `/calendar`, `/admin`, `/onboarding`; Server Actions re-verify role                                                                                                                       | US 2.1.6, US 4.1.1–4.1.2 |
| Password/code secrecy | Supabase Auth hashes passwords; invite codes generated with `crypto.randomBytes` (or `nanoid(21)`)                                                                                                              | US 4.1.4                 |

---

## 5. Feature mapping — stories → implementation

### Epic 1 — Roles & Auth

| Story                        | Implementation                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| US 1.1 Register with code    | Route `app/(auth)/register`; Server Action `register`; transaction code → user; Zod schema `registerSchema`          |
| US 1.2 Login / role redirect | Route `app/(auth)/login`; role read after sign-in                                                                    |
| US 1.3 Logout                | Profile menu → `signOut` action (replaces current demo `logout` in `CalendarApp.tsx`)                                |
| US 1.4 Onboarding form       | Route `app/onboarding`; `onboardingSchema` (occupation required); flag flip; admin table reads the fields (US 1.4.7) |

### Epic 2 — Admin

| Story                 | Implementation                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US 2.1 Users table    | Route `app/admin/users`; Server Component queries `User` with pagination + `searchParams` search (name/email); total count; role-guarded                                    |
| US 2.2 Generate codes | Modal (reuse `components/Modal.tsx` pattern): quantity input → Server Action `generateInviteCodes(count)` (validated min/max) → results step with "copy all" / per-row copy |
| US 2.3 Code usage     | Route `app/admin/codes`; list with status badges ("Sin usar" / used-by + date / expired)                                                                                    |

### Epic 3 — Events

| Story                  | Implementation                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| US 3.1 Create event    | `AddEventModal` (existing component, wired to Server Action `createEvent`); `eventSchema` carries all validation messages: required fields, no past date (3.1.5), no past start today (3.1.6), end > start (3.1.7); modality makes `location` conditionally required (3.1.9–3.1.10); picture: client-resize to fixed size → Storage upload → save path |
| US 3.2 Join/leave      | Server Action `toggleJoin(eventId)` upserting/deleting `EventAttendee`; button state from membership                                                                                                                                                                                                                                                   |
| US 3.3 Browse calendar | Keep `MonthView`/`WeekView`; Server Component fetches events for the visible window; navigation window (±3 months) enforced in the nav handlers (3.3.7–3.3.11); **week overlap layout**: new pure function in `lib/selectors.ts` (interval-cluster column packing) returning `left/width` per block (3.3.12–3.3.15) — unit-tested with Vitest          |
| US 3.4 Event detail    | Keep `EventDetailModal`; add picture rendering, Virtual label + clickable `meetingUrl` (3.4.1), openable from every entry point (3.4.5)                                                                                                                                                                                                                |

### Epic 4 — Cross-cutting

| Story                       | Implementation                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| US 4.1 Security/persistence | Middleware + action guards; Supabase Postgres persistence; bcrypt via Supabase Auth                                                              |
| US 4.2 Spanish copy         | Keep `lib/strings.ts` pattern — all new copy (register, onboarding, admin, modality, validation errors) goes there; dates via `lib/dateUtils.ts` |

---

## 6. Target project structure

```
app/
  (auth)/login/page.tsx           # login
  (auth)/register/page.tsx        # US 1.1
  onboarding/page.tsx             # US 1.4
  calendar/page.tsx               # US 3.x (server component + client islands)
  admin/users/page.tsx            # US 2.1
  admin/codes/page.tsx            # US 2.2 / 2.3
components/                       # existing components, kept & extended
lib/
  db.ts                           # Prisma singleton
  supabase/                       # server & browser clients (@supabase/ssr)
  actions/                        # Server Actions: auth.ts, onboarding.ts,
                                  #   invites.ts, events.ts, admin.ts
  validation/                     # Zod schemas (one per form, shared)
  selectors.ts / dateUtils.ts / strings.ts   # kept as-is
prisma/
  schema.prisma
  migrations/
tests/
  unit/                           # Vitest: selectors, validators, overlap layout
  e2e/                            # Playwright: auth flow, admin flow, events
.github/workflows/
  ci.yml
middleware.ts                     # session refresh + RBAC gates
```

---

## 7. CI/CD — GitHub Actions

`.github/workflows/ci.yml` — two jobs:

**Job `verify` (every PR + push to `main`)**

1. Checkout → setup Node 22 + pnpm cache
2. `pnpm install --frozen-lockfile`
3. `prisma validate` + `prisma generate`
4. ESLint + Prettier check
5. `tsc --noEmit`
6. `vitest run` (unit)
7. `next build`

**Job `deploy` (on merge to `main`, needs `verify`)**

1. `prisma migrate deploy` against production `DATABASE_URL`
2. Vercel deployment (native Git integration handles preview builds per PR; the production deploy can ride on Vercel's integration or run via `vercel deploy --prod` in the job)
3. Optional: Playwright E2E suite as a nightly cron job

**Secrets** (GitHub repo settings): `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`.

---

## 8. Environment variables

```
# .env.local (never committed)
DATABASE_URL=...        # Supabase pooled connection (pgBouncer) — runtime
DIRECT_URL=...          # Supabase direct connection — migrations
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only (Server Actions)
```

---

## 9. Phased roadmap

| Phase               | Scope                                                                                                                                                         | Stories        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **0 — Foundations** | Supabase env, Prisma schema + migration, Supabase SSR clients, auth→public sync trigger, CI pipeline, dev seed (admin account + invite codes + sample events) | —              |
| **1 — Access**      | Login/logout with role redirect, middleware + action guards, invite-code generation, registration with invite code, onboarding gate                           | Epic 1, US 2.2 |
| **2 — Admin**       | Users table (pagination/search/count), codes list & usage view                                                                                                | US 2.1, US 2.3 |
| **3 — Events**      | Create event (validation, modality, picture upload), join/leave, month/week views with overlap layout + ±3-month window, event detail                         | Epic 3         |
| **4 — Hardening**   | E2E suite, copy review (es-PE), performance pass, production deploy                                                                                           | Epic 4         |

---

## 10. What stays from the current prototype

- All presentational components (`MonthView`, `WeekView`, `AddEventModal`,
  `EventDetailModal`, `DayModal`, `Modal`, `Toast`, `Header`, `ProfileMenu`)
  and their CSS Modules.
- `lib/dateUtils.ts`, `lib/strings.ts`, `lib/selectors.ts` (extended, not
  rewritten — e.g. the week-block builder gains the overlap layout pass).
- The seed-data approach in `lib/constants.ts` is replaced by Prisma queries,
  with the seed file repurposed into a `prisma/seed.ts` for local development.
