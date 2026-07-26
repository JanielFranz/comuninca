# Comuninca — User Stories & Acceptance Criteria

> Derived from the product intent: the app must support an **admin** role and a
> **normal user** role. Admins manage users and generate invite/access codes;
> normal users register with an invite code and interact with the community
> events calendar (post, join, browse).

## Roles

| Role            | Description                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Admin**       | Trusted operator. Manages the user base, generates invite/access codes that allow new normal users to register, and views the total list of registered normal users. |
| **Normal user** | Community member. Creates an account using an invite/access code provided by an admin, posts events, joins events, and browses the calendar.                         |

## Current state of the codebase

The app (Next.js 16 App Router + TypeScript) already provides the unauthenticated
calendar surface that the normal-user stories build on:

- Demo login (`components/LoginScreen.tsx`, `CalendarApp.tsx` `submitLogin`)
- Month/week calendar views (`MonthView.tsx`, `WeekView.tsx`)
- Add-event modal (`AddEventModal.tsx`)
- Event detail with join/leave toggle (`EventDetailModal.tsx`, `toggleJoin` in `CalendarApp.tsx`)
- Profile menu / logout (`ProfileMenu.tsx`)

What is **not** yet implemented and is required by the stories below:

- A persistent backend / database (today everything lives in React state in `lib/constants.ts` seed data).
- A real auth system with role assignment (admin vs. normal user).
- An invite/access-code generation and redemption flow.
- A registration screen distinct from the demo login.
- An admin user-management table.

These stories describe the target product behavior, independent of the current
in-memory prototype implementation.

---

## Epic 1 — Roles & Authentication

### US 1.1 — Register a normal-user account using an invite/access code

**As a** visitor with a valid invite/access code,
**I want** to create my own account in the app,
**So that** I can participate in the community as a normal user.

**Acceptance criteria**

- **AC 1.1.1** — Given a visitor is on the login screen, when they choose the
  "register" option, then a registration form is shown requesting at least:
  full name, email, password, and an invite/access code.
- **AC 1.1.2** — Given the visitor submits the form without an invite/access
  code, when the form is validated, then submission is blocked and an error
  message indicates the code is required.
- **AC 1.1.3** — Given the visitor enters an invite/access code that does not
  exist or has already been used/expired, when they submit, then registration is
  rejected and an error message indicates the code is invalid.
- **AC 1.1.4** — Given the visitor enters a valid, unused invite/access code
  and all other required fields are correct, when they submit, then:
  - a new normal-user account is created,
  - the invite/access code is marked as consumed/used (single-use),
  - the user is redirected to the calendar screen in an authenticated session.
- **AC 1.1.5** — Given the registration succeeds, when the new account is
  created, then the account's role is "normal user" by default (never "admin").
- **AC 1.1.6** — Given a visitor attempts to register with an email that is
  already registered, when they submit, then registration is rejected with a
  clear "email already in use" message.

### US 1.2 — Log in with role-aware redirection

**As a** registered user (admin or normal user),
**I want** to log in and be routed according to my role,
**So that** I land on the screen relevant to me.

**Acceptance criteria**

- **AC 2.1.1** — Given a registered user enters valid credentials, when they
  submit the login form, then they are authenticated and a session is started.
- **AC 2.1.2** — Given the authenticated user has the admin role, when login
  completes, then they are redirected to the admin dashboard (user management).
- **AC 2.1.3** — Given the authenticated user has the normal-user role, when
  login completes, then they are redirected to the community calendar.
- **AC 2.1.4** — Given a user enters invalid credentials, when they submit,
  then login is rejected with an error message that does not reveal which of
  the email or password was wrong.

### US 1.4 — Complete onboarding profile on first login

**As a** newly registered normal user,
**I want** to be asked about my profession, occupation, and ikigai on my first
login,
**So that** my community profile reflects who I am and what I do.

**Acceptance criteria**

- **AC 1.4.1** — Given a normal user has just completed registration (US 1.1)
  or is logging in for the first time after their account was created, when
  their authenticated session starts, then an onboarding form is shown before
  the calendar screen.
- **AC 1.4.2** — Given the onboarding form is displayed, then it contains three
  fields:
  - **Profesión** — optional,
  - **Ocupación** — mandatory,
  - **Ikigai** — optional.
- **AC 1.4.3** — Given the user submits the form with **Ocupación** empty, when
  validation runs, then submission is blocked and an error message indicates
  that "Ocupación" is required.
- **AC 1.4.4** — Given the user fills in "Ocupación" (and optionally
  "Profesión" and "Ikigai"), when they submit, then the values are saved to the
  user's profile, the onboarding form is dismissed, and the user is taken to the
  community calendar.
- **AC 1.4.5** — Given the user has already completed this onboarding form on a
  previous session, when they log in again, then the form is **not** shown again
  (it is a one-time step).
- **AC 1.4.6** — Given the onboarding is mandatory, when the user attempts to
  dismiss/close the form without filling in "Ocupación", then the form cannot
  be skipped — the user must provide "Ocupación" before reaching the calendar.
- **AC 1.4.7** — Given the onboarding data is saved, when an admin views the
  user in the user-management table (US 2.1), then "Profesión", "Ocupación"
  and "Ikigai" are available as columns or expandable details for that user.
- **AC 1.4.8** — Given the user is an admin, when they log in for the first
  time, then this onboarding form is **not** shown — it applies only to the
  normal-user role.
- **AC 1.4.9** — Given all copy must remain in Spanish (es-PE), when the form is
  rendered, then labels ("Profesión", "Ocupación", "Ikigai"), placeholders, and
  validation messages live alongside the existing strings in `lib/strings.ts`.

### US 1.3 — Log out

**As a** any authenticated user,
**I want** to end my session,
**So that** my account is protected on shared devices.

**Acceptance criteria**

- **AC 3.1.1** — Given an authenticated user opens the profile menu, when they
  click "Cerrar sesión", then the session is terminated and they are returned
  to the login screen.
- **AC 3.1.2** — Given a user has logged out, when they attempt to navigate to
  a protected screen via the URL, then they are redirected to the login screen.

---

## Epic 2 — Admin: User Management

### US 2.1 — View the total list of normal users

**As an** admin,
**I want** to see a table listing all registered normal users,
**So that** I can oversee the community membership.

**Acceptance criteria**

- **AC 2.1.1** — Given an admin is authenticated and on the admin dashboard,
  when the dashboard loads, then a table of all normal users is displayed.
- **AC 2.1.2** — Given the user table is rendered, then each row shows at
  least: full name, email, registration date, birthday and occupation
  and the invite/access code used at sign-up.
- **AC 2.1.3** — Given the admin is viewing the table, then a total count of
  normal users is shown (e.g. "Total de usuarios: 42").
- **AC 2.1.4** — Given the table contains more rows than fit on one page, when
  the admin scrolls or paginates, then the table supports pagination (or
  virtualized scrolling) so all users are reachable.
- **AC 2.1.5** — Given the admin wants to find a specific user, when they
  enter a search query (by name or email), then the table filters to show only
  matching rows.
- **AC 2.1.6** — Given a non-admin (normal user or unauthenticated visitor)
  attempts to access the admin dashboard URL, when the request is evaluated,
  then access is denied and they are redirected to the login screen (or shown a
  403/forbidden state).

### US 2.2 — Generate an invite/access code

**As an** admin,
**I want** to generate invite/access codes,
**So that** I can grant specific people the ability to register as normal users.

**Acceptance criteria**

- **AC 2.2.1** — Given an admin is on the admin dashboard, when they click the
  "Generar código de invitación" action, then a popup opens asking the admin
  how many new unique invite/access codes they want to create.
- **AC 2.2.2** — Given the quantity popup is open, when the admin enters an
  invalid quantity (empty, zero, or below the allowed minimum), then the
  generation action is disabled and a validation hint is shown.
- **AC 2.2.3** — Given the admin has entered a valid quantity, when they
  confirm the action, then exactly that many new unique invite/access codes are
  created and the same popup transitions from the "choose how many" step to a
  results step showing all the newly generated codes.
- **AC 2.2.4** — Given the results step is showing the generated codes, when
  the admin triggers the "copy all" action, then the full set of code strings is
  copied to the clipboard in a single action and a confirmation is shown.
- **AC 2.2.5** — Given the results step is showing the generated codes, when
  the admin triggers the per-row copy action on an individual code, then that
  single code string is copied to the clipboard and a confirmation is shown.
- **AC 2.2.6** — Given a code has been generated, then it is persisted with at
  least the following properties: the code string, its status (unused / used /
  expired), the creation date, and (once consumed) the user it was consumed by
  and the consumption date.
- **AC 2.2.7** — Given a code is created as single-use, when a visitor
  successfully registers with it, then its status becomes "used" and any further
  registration attempt with the same code is rejected (see US 1.1.3).
- **AC 2.2.8** — Given the admin has reviewed the generated codes, when they
  close the popup, then the codes remain available in the codes list (see US 2.3)
  and the admin is returned to the admin dashboard.

### US 2.3 — View invite/access code usage

**As an** admin,
**I want** to track which codes have been used and by whom,
**So that** I can audit community access.

**Acceptance criteria**

- **AC 2.3.1** — Given the codes list is displayed, when a code has been used,
  then the row shows the name/email of the user who consumed it and the
  consumption date.
- **AC 2.3.2** — Given the codes list is displayed, when a code is still
  unused, then the row indicates "Sin usar".
- **AC 2.3.3** — Given the codes list is displayed, when a code was revoked or
  expired, then the row is visually distinguished from active unused codes.

---

## Epic 3 — Normal user: Events

> The flows below describe event interactions scoped to an authenticated normal
> user. They map to the existing `AddEventModal`, `EventDetailModal` and join
> logic in `CalendarApp.tsx`, extended to a real authenticated identity and a
> persistent store.

### US 3.1 — Post (create) an event

**As a** normal user,
**I want** to post a new event on the calendar,
**So that** my neighbors can discover it and join.

**Acceptance criteria**

- **AC 3.1.1** — Given an authenticated normal user is on the calendar, when
  they open the "Agregar evento" modal, then a form is shown with fields: title, category (I will define it later),
  date, start time, end time, **modality (Presencial / Virtual)**, location
  (physical address when "Presencial", or an optional meeting link/URL when
  "Virtual"), description, and they can upload a picture (fixed size).
- **AC 3.1.2** — Given the user submits the form with a required field empty
  (title, category, date, start time, end time, description, or — when modality
  is "Presencial" — the physical address), when validation runs, then submission
  is blocked and the existing validation error is shown ("Todos los campos son
  obligatorios.").
- **AC 3.1.3** — Given the user submits a valid form, when the event is
  created, then:
  - the event is persisted with the signed-in user recorded as the host,
  - the event appears on the calendar at the chosen date/time,
  - a success toast is shown ("Evento agregado al calendario"),
  - the modal closes.
- **AC 3.1.4** — Given the user opens the modal from an empty day (or uses the
  day modal's "+ Agregar evento este día" action), when the form opens, then
  the date field is pre-filled with that day's date.
- **AC 3.1.5** — Given the user picks a date earlier than today, when they
  submit the form, then submission is blocked and an error is shown ("No puedes
  crear un evento en una fecha pasada.").
- **AC 3.1.6** — Given the user picks today's date and a start time that has
  already passed (i.e. earlier than the current time), when they submit, then
  submission is blocked and an error is shown ("La hora de inicio ya ha
  pasado.").
- **AC 3.1.7** — Given the user picks an end time that is earlier than or equal
  to the start time, when they submit, then submission is blocked and an error
  is shown ("La hora de fin debe ser posterior a la hora de inicio.").
- **AC 3.1.8** — Given the user picks a valid date (today or future) and valid
  times (start in the future, end after start), when they submit, then the event
  is created (see AC 3.1.3) and no time-validation error is shown.
- **AC 3.1.9** — Given the user selects "Virtual" as the modality, when they
  submit the form without a physical address (and optionally with a meeting
  link), then submission is **not** blocked for the missing address — the event
  is recorded as virtual and the physical address field is not required.
- **AC 3.1.10** — Given the user selects "Presencial" as the modality, when they
  submit the form without a physical address, then submission is blocked per
  AC 3.1.2 and the "Todos los campos son obligatorios." error is shown.
- **AC 3.1.11** — Given the user selects "Virtual" and provides a meeting link,
  when the event is saved, then the link is stored with the event and shown to
  other users in the event detail (see US 3.4) so they can join the online
  session.

### US 3.2 — Join an event

**As a** normal user,
**I want** to join an event I'm interested in,
**So that** the host knows I'm attending.

**Acceptance criteria**

- **AC 3.2.1** — Given an authenticated normal user opens an event they are not
  yet attending, when they click "Unirme al evento", then the current user is
  added to the event's attendee list and the button switches to the
  "Ya vas ✓" state.
- **AC 3.2.2** — Given the user is already attending an event, when they click
  the join/leave toggle again, then they are removed from the attendee list and
  the button reverts to "Unirme al evento".
- **AC 3.2.3** — Given the user joins or leaves an event, when the change is
  applied, then the attendee count and the attendee list in the event detail
  modal update accordingly.
- **AC 3.2.4** — Given the user is the host of an event, when the event detail
  is shown, then the host is displayed as "Tú" and the user is implicit
  (consistent with current `buildActiveEvent` behavior).

### US 3.3 — Browse events on the calendar

**As a** normal user,
**I want** to view community events on a calendar,
**So that** I can find things to take part in.

**Acceptance criteria**

- **AC 3.3.1** — Given an authenticated normal user is on the calendar, when
  the month view is active, then events are rendered as previews/dots on their
  corresponding days, with a count indicator per day.
- **AC 3.3.2** — Given the normal user switches to week view, when the week is
  rendered, then events appear as time-blocked cards positioned by their start
  and end times, with the current-time line drawn on today's column. Overlapping
  events (same or intersecting time ranges) must both remain visible and
  individually clickable — they cannot be allowed to stack on top of each other
  so that only one is visible (see AC 3.3.12–3.3.15).
- **AC 3.3.12** — Given two or more events on the same day share the exact same
  start and end time, when the week is rendered, then the events are laid out
  side-by-side (each card taking an equal fraction of the column width) so that
  the user can see there are multiple events at that time and can click each one.
- **AC 3.3.13** — Given two or more events on the same day have overlapping but
  non-identical time ranges, when the week is rendered, then the cards are
  positioned at their respective start times and their horizontal placement is
  adjusted (side-by-side while they overlap) so neither fully hides the other.
- **AC 3.3.14** — Given a group of overlapping events, when they are laid out,
  then each card in the group shows at least its title (truncated if needed) and
  its time label, and remains wide enough to be readable and clickable.
- **AC 3.3.15** — Given overlapping events, when the user clicks one of the
  side-by-side cards, then only that specific event's detail modal opens (no
  misclick into the adjacent event).
- **AC 3.3.3** — Given the calendar is shown, when the user clicks a day that
  has events, then the day modal opens listing that day's events with title,
  time, and location (the physical address for "Presencial" events, or a
  "Virtual" label for virtual events).
- **AC 3.3.4** — Given the day modal is open, when the user clicks an event in
  the list, then the day modal closes and the event detail modal opens.
- **AC 3.3.5** — Given the user navigates with "Anterior" / "Hoy" / "Siguiente",
  when a navigation action is triggered, then the calendar moves to the
  previous/today/next period (month in month view, week in week view), subject to
  the navigation window defined in AC 3.3.7.
- **AC 3.3.6** — Given the user clicks an empty day, when the day has no
  events, then the add-event modal opens pre-filled with that date instead of
  the day modal.
- **AC 3.3.7** — Given the calendar is shown, when the user navigates, then the
  visible period is bounded to a maximum of **three months before** and **three
  months after** the current date — i.e. months earlier than `current month − 3`
  cannot be reached by "Anterior" and months later than `current month + 3`
  cannot be reached by "Siguiente".
- **AC 3.3.8** — Given the user is on the earliest allowed month (current date
  month − 3), when they click "Anterior", then the "Anterior" action is disabled
  (or no-op) and the calendar stays on that month.
- **AC 3.3.9** — Given the user is on the latest allowed month (current date
  month + 3), when they click "Siguiente", then the "Siguiente" action is
  disabled (or no-op) and the calendar stays on that month.
- **AC 3.3.10** — Given the user is outside the allowed window via "Hoy", when
  they click "Hoy", then the calendar jumps back to the current date's period
  within the allowed window.
- **AC 3.3.11** — Given the week view is active, when the user navigates beyond
  a week that falls entirely outside the three-month-before/after window, then
  the same boundary rule applies — navigation past the window's edge is blocked.

### US 3.4 — View event details

**As a** normal user,
**I want** to open an event and see its full details,
**So that** I can decide whether to join.

**Acceptance criteria**

- **AC 3.4.1** — Given the normal user opens an event, when the event detail
  modal renders, then it shows: category label and color (as defined in
  US 3.1.1), date, time range, **location** — for "Presencial" events the
  physical address, or for "Virtual" events a "Virtual" label together with the
  meeting link (if one was provided, per AC 3.1.11) as a clickable URL,
  description, the picture uploaded at creation time (see AC 3.4.4), host
  name/initials, and the attendee list.
- **AC 3.4.2** — Given the event has no attendees other than the host, when the
  detail modal renders, then it shows "Nadie aún — sé el primero en unirte."
- **AC 3.4.3** — Given the user closes the modal (Esc, close button, or
  backdrop), when a close action is triggered, then the modal is dismissed
  without losing the underlying calendar state.
- **AC 3.4.4** — Given the event was created with an uploaded picture (per
  US 3.1.1), when the detail modal renders, then the picture is displayed at the
  fixed size defined by the form.
- **AC 3.4.5** — Given the user opens the detail modal from any entry point
  (a week-view overlap card per AC 3.3.15, a day-modal list item per AC 3.3.4,
  or a month-view day), when the modal opens, then the same full detail view and
  join/leave action (US 3.2) are available regardless of where it was opened
  from.

---

## Epic 4 — Cross-cutting / Non-functional

### US 4.1 — Authorization & data persistence

**As the** product owner,
**I want** role-based access control and a persistent store,
**So that** user data, codes, and events survive page refreshes and stay secure.

**Acceptance criteria**

- **AC 4.1.1** — Given any protected screen, when it is accessed without an
  authenticated session, then the user is redirected to the login screen.
- **AC 4.1.2** — Given a normal user, when they interact with the app, then
  they can never reach admin-only screens (user management, code generation)
  through navigation or direct URL — such access is rejected.
- **AC 4.1.3** — Given the browser is refreshed, when the app reloads, then
  the authenticated session, registered users, generated codes, and posted
  events are restored from a persistent store (replacing today's in-memory seed
  data in `lib/constants.ts`).
- **AC 4.1.4** — Given the app stores credentials, when authentication occurs,
  then passwords are never stored in plain text and invite/access codes are not
  trivially guessable.

### US 4.2 — Localization (Spanish)

**As the** product owner,
**I want** the UI to remain in Spanish (es-PE),
**So that** the target community can use the app.

**Acceptance criteria**

- **AC 4.2.1** — Given any new screen added for these stories (registration,
  admin dashboard, code generation), when it is rendered, then all user-facing
  copy is in Spanish and centralized alongside `lib/strings.ts`.
- **AC 4.2.2** — Given dates/times are displayed (registration date, code
  consumption date, event times), when they are formatted, then they use the
  es-PE locale via the existing `lib/dateUtils.ts` formatting helpers.
