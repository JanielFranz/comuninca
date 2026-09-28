"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import type {
  CalendarEvent,
  CalendarView,
  CategoryKey,
  CurrentUser,
  EventFormState,
  EventModality,
  User,
} from "@/lib/types"
import { CONFIG, MOBILE_BREAKPOINT, TINY_BREAKPOINT } from "@/lib/constants"
import {
  computeNavStep,
  dateKey,
  fmtDayHeader,
  fmtMonthYear,
  fmtWeekRange,
  parseDateKey,
} from "@/lib/dateUtils"
import {
  buildActiveEvent,
  buildCategoryOptions,
  buildDayModalEvents,
  buildMonthCells,
  buildWeekData,
  weekdayLabels,
} from "@/lib/selectors"
import { STRINGS } from "@/lib/strings"
import { displayName, initialsFor } from "@/lib/userDisplay"
import { signOut } from "@/lib/actions/auth"
import { createEvent, toggleJoin } from "@/lib/actions/events"
import { checkEventInput } from "@/lib/validation/events"
import { pictureErrorMessage, processPictureFile } from "@/lib/storage"

import Header from "./Header"
import CategoryLegend from "./CategoryLegend"
import MonthView from "./MonthView"
import WeekView from "./WeekView"
import AddEventModal from "./AddEventModal"
import DayModal from "./DayModal"
import EventDetailModal from "./EventDetailModal"
import ProfileMenu from "./ProfileMenu"
import Toast from "./Toast"
import styles from "./CalendarApp.module.css"

interface AppState {
  currentDate: Date
  calendarView: CalendarView
  showAddModal: boolean
  showDayModal: boolean
  dayModalDate: string | null
  showEventModal: boolean
  activeEventId: string | null
  /** es-PE message when the last join/leave attempt failed; "" when none. */
  joinError: string
  showProfileMenu: boolean
  toast: string
  eventForm: EventFormState
}

/**
 * A join/leave click flips this instantly so the button feels responsive,
 * ahead of the server round trip. It is reconciled against reality (cleared)
 * as soon as a fresh `events` prop arrives from `router.refresh()` — see the
 * effect below — so it can never permanently drift from the real DB state.
 */
interface OptimisticJoin {
  eventId: string
  joined: boolean
}

function emptyForm(dateStr: string): EventFormState {
  return {
    title: "",
    category: "social",
    date: dateStr,
    startTime: "18:00",
    endTime: "19:00",
    modality: "IN_PERSON",
    location: "",
    description: "",
    error: "",
    picture: "",
    pictureError: "",
    pictureStatus: "idle",
    picturePreviewUrl: "",
  }
}

function initialState(
  today: string,
  initialDate?: string,
  initialView?: CalendarView,
): AppState {
  const todayDate = parseDateKey(today)
  return {
    currentDate: initialDate ? parseDateKey(initialDate) : todayDate,
    calendarView: initialView ?? CONFIG.defaultView,
    showAddModal: false,
    showDayModal: false,
    dayModalDate: null,
    showEventModal: false,
    activeEventId: null,
    joinError: "",
    showProfileMenu: false,
    toast: "",
    eventForm: emptyForm(today),
  }
}

interface CalendarAppProps {
  user: { id: string; fullName: string; email: string }
  /** Server-fetched events for the clamped window (real user ids). */
  events: CalendarEvent[]
  /** Every host/attendee in `events` plus the current user. */
  people: User[]
  /** Server "today" (Lima) as an ISO "YYYY-MM-DD" key. */
  today: string
  /**
   * Clamped initial date (ISO "YYYY-MM-DD") from the `?date=` URL param,
   * already validated + window-clamped server-side (feature #19). Falls
   * back to `today` when absent.
   */
  initialDate?: string
  /** Clamped initial view from the `?view=` URL param. Falls back to CONFIG.defaultView when absent. */
  initialView?: CalendarView
}

export default function CalendarApp({
  user,
  events: serverEvents,
  people,
  today,
  initialDate,
  initialView,
}: CalendarAppProps) {
  const router = useRouter()
  const [isCreating, startCreate] = useTransition()
  const [isJoining, startJoin] = useTransition()
  const [state, setState] = useState<AppState>(() =>
    initialState(today, initialDate, initialView),
  )
  const [optimisticJoin, setOptimisticJoin] = useState<OptimisticJoin | null>(
    null,
  )
  // Deterministic on first paint (server + client); corrected on mount below.
  const [viewportWidth, setViewportWidth] = useState(1280)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards against a stale async resize result overwriting a later selection.
  const pictureRequestRef = useRef(0)

  // The server props (and thus `serverEvents`) only change after a
  // `router.refresh()` following a successful mutation, so a new reference
  // here means the DB truth has landed — the optimistic overlay is no
  // longer needed and must not be left to drift from it. Adjusted during
  // render (not an effect) per React's "adjusting state when a prop
  // changes" pattern, so it lands in the same commit as the new props.
  const [prevServerEvents, setPrevServerEvents] = useState(serverEvents)
  if (serverEvents !== prevServerEvents) {
    setPrevServerEvents(serverEvents)
    setOptimisticJoin(null)
  }

  function patchState(
    patch: Partial<AppState> | ((s: AppState) => Partial<AppState>),
  ) {
    setState((prev) => ({
      ...prev,
      ...(typeof patch === "function" ? patch(prev) : patch),
    }))
  }

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth)
    }
    onResize()
    window.addEventListener("resize", onResize)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        patchState({
          showAddModal: false,
          showDayModal: false,
          showEventModal: false,
          showProfileMenu: false,
        })
      }
    }
    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("keydown", onKeyDown)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  // ---- Navigation ----
  // `today` never changes across renders of a given page load, so re-parsing
  // it here (instead of caching it in state) keeps `goToday` and the
  // boundary checks below trivially correct even if the surrounding state
  // updates for unrelated reasons.
  const todayDate = parseDateKey(today)
  // "Hoy" always jumps back to today's period unconditionally (AC 3.3.10) —
  // `today` is always inside its own navigation window by construction, so
  // this never needs a boundary check, unlike goPrev/goNext below.
  function goToday() {
    patchState({ currentDate: todayDate })
  }
  // computeNavStep (lib/dateUtils.ts) is the single source of truth for both
  // performing the move and (via isPrevDisabled/isNextDisabled below)
  // disabling the button — it returns `null` at the window's edge, in which
  // case this is a no-op (AC 3.3.8/3.3.9/3.3.11): defense-in-depth in case
  // the click somehow fires while the button is disabled.
  function goPrev() {
    patchState((s) => {
      const next = computeNavStep(
        "prev",
        s.currentDate,
        s.calendarView,
        todayDate,
        CONFIG.weekStart,
      )
      return next ? { currentDate: next } : {}
    })
  }
  function goNext() {
    patchState((s) => {
      const next = computeNavStep(
        "next",
        s.currentDate,
        s.calendarView,
        todayDate,
        CONFIG.weekStart,
      )
      return next ? { currentDate: next } : {}
    })
  }
  function setView(v: CalendarView) {
    patchState({ calendarView: v })
  }
  const isPrevDisabled =
    computeNavStep(
      "prev",
      state.currentDate,
      state.calendarView,
      todayDate,
      CONFIG.weekStart,
    ) === null
  const isNextDisabled =
    computeNavStep(
      "next",
      state.currentDate,
      state.calendarView,
      todayDate,
      CONFIG.weekStart,
    ) === null

  // Keeps the URL bookmarkable/shareable without a server round trip: a
  // native `history.replaceState`, NOT `router.push`/`router.replace` from
  // next/navigation, which would trigger a full Next App Router
  // navigation/refetch of app/calendar/page.tsx on every click — the whole
  // ±3-month window's events are already loaded client-side (feature #14),
  // so every click should stay instant. This only touches the browser's own
  // history entry (a DOM/browser side effect, not `setState`), so it does
  // not trip the `react-hooks/set-state-in-effect` rule feature #17 hit.
  const currentDateKey = dateKey(state.currentDate)
  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    url.searchParams.set("date", currentDateKey)
    url.searchParams.set("view", state.calendarView)
    window.history.replaceState(null, "", url)
  }, [currentDateKey, state.calendarView])

  // ---- Add / edit event form ----
  function openAddModal(dStr?: string) {
    patchState((s) => ({
      showAddModal: true,
      showDayModal: false,
      eventForm: emptyForm(dStr || dateKey(s.currentDate)),
    }))
  }
  function closeAddModal() {
    if (state.eventForm.picturePreviewUrl) {
      URL.revokeObjectURL(state.eventForm.picturePreviewUrl)
    }
    patchState({ showAddModal: false })
  }
  function updateForm<K extends keyof EventFormState>(
    field: K,
    value: EventFormState[K],
  ) {
    patchState((s) => ({
      eventForm: { ...s.eventForm, [field]: value, error: "" },
    }))
  }
  // The picture pipeline (resize/encode) runs client-side (`lib/storage.ts`)
  // as soon as a file is selected, independent of the rest of the form.
  function handlePictureSelect(file: File | null) {
    const requestId = ++pictureRequestRef.current
    if (state.eventForm.picturePreviewUrl) {
      URL.revokeObjectURL(state.eventForm.picturePreviewUrl)
    }
    if (!file) {
      patchState((s) => ({
        eventForm: {
          ...s.eventForm,
          picture: "",
          pictureError: "",
          pictureStatus: "idle",
          picturePreviewUrl: "",
        },
      }))
      return
    }
    const previewUrl = URL.createObjectURL(file)
    patchState((s) => ({
      eventForm: {
        ...s.eventForm,
        picture: "",
        pictureError: "",
        pictureStatus: "processing",
        picturePreviewUrl: previewUrl,
      },
    }))
    processPictureFile(file).then((result) => {
      // A newer selection superseded this one; drop the stale result.
      if (pictureRequestRef.current !== requestId) return
      if (result.ok) {
        patchState((s) => ({
          eventForm: {
            ...s.eventForm,
            picture: result.dataUrl,
            pictureStatus: "ready",
            pictureError: "",
          },
        }))
      } else {
        patchState((s) => ({
          eventForm: {
            ...s.eventForm,
            picture: "",
            pictureStatus: "error",
            pictureError: pictureErrorMessage(result.error),
          },
        }))
      }
    })
  }
  function submitForm(e: FormEvent) {
    e.preventDefault()
    if (isCreating) return
    const f = state.eventForm
    const t = STRINGS.addEventModal
    // A pending resize or an unresolved picture error blocks submission
    // (the submit button is also disabled for the same reason).
    if (f.pictureStatus === "processing" || f.pictureStatus === "error") return
    // The single location input is the address (Presencial) or the meeting
    // link (Virtual); map it onto the right key.
    const isVirtual = f.modality === "VIRTUAL"
    const payload = {
      title: f.title,
      category: f.category,
      date: f.date,
      startTime: f.startTime,
      endTime: f.endTime,
      modality: f.modality,
      location: isVirtual ? "" : f.location,
      meetingUrl: isVirtual ? f.location : "",
      description: f.description,
      picture: f.picture || undefined,
    }
    const checked = checkEventInput(payload)
    if (!checked.valid) {
      patchState({ eventForm: { ...f, error: checked.message } })
      return
    }
    startCreate(async () => {
      const result = await createEvent(payload)
      if (result.ok) {
        if (f.picturePreviewUrl) URL.revokeObjectURL(f.picturePreviewUrl)
        patchState({
          showAddModal: false,
          eventForm: emptyForm(today),
          toast: t.toastSuccess,
        })
        queueToastClear()
        router.refresh()
        return
      }
      let message: string = t.errors.unexpected
      if (result.error === "INVALID_INPUT" || result.error === "INVALID_PICTURE")
        message = result.message
      else if (result.error === "UNAUTHENTICATED")
        message = t.errors.sessionExpired
      else if (result.error === "FORBIDDEN") message = t.errors.forbidden
      patchState((s) => ({ eventForm: { ...s.eventForm, error: message } }))
    })
  }
  function queueToastClear() {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => patchState({ toast: "" }), 2600)
  }

  // ---- Day modal ----
  function handleDayClick(dStr: string, hasEvents: boolean) {
    if (hasEvents) patchState({ showDayModal: true, dayModalDate: dStr })
    else openAddModal(dStr)
  }
  function closeDayModal() {
    patchState({ showDayModal: false })
  }
  function onAddFromDayModal() {
    const d = state.dayModalDate
    patchState({ showDayModal: false })
    openAddModal(d ?? undefined)
  }
  function handleDayModalEventClick(id: string) {
    patchState({ showDayModal: false })
    openEventDetail(id)
  }

  // ---- Event detail ----
  function openEventDetail(id: string) {
    patchState({ activeEventId: id, showEventModal: true, joinError: "" })
  }
  function closeEventDetail() {
    patchState({ showEventModal: false, joinError: "" })
  }
  // Calls the real toggleJoin Server Action. The button flips instantly via
  // `optimisticJoin` (reconciled once the post-mutation `router.refresh()`
  // delivers fresh server props, see the effect above); on failure the
  // optimistic flag is rolled back and an es-PE error is shown, and the
  // displayed membership is left exactly as it was.
  function handleToggleJoin(id: string) {
    if (isJoining) return
    const ev = events.find((e) => e.id === id)
    if (!ev) return
    const currentlyGoing = ev.attendeeIds.indexOf(user.id) >= 0
    setOptimisticJoin({ eventId: id, joined: !currentlyGoing })
    patchState({ joinError: "" })
    startJoin(async () => {
      const result = await toggleJoin({ eventId: id })
      if (result.ok) {
        router.refresh()
        return
      }
      setOptimisticJoin(null)
      const message =
        result.error === "UNAUTHENTICATED"
          ? STRINGS.addEventModal.errors.sessionExpired
          : STRINGS.eventDetailModal.joinError
      patchState({ joinError: message })
    })
  }

  // ---- Profile menu ----
  function toggleProfileMenu() {
    patchState((s) => ({ showProfileMenu: !s.showProfileMenu }))
  }
  function closeProfileMenu() {
    patchState({ showProfileMenu: false })
  }
  async function logout() {
    patchState({ showProfileMenu: false })
    await signOut()
    router.push("/login")
    router.refresh()
  }

  // ---- Derived / view-model data ----
  // Server events are the source of truth; only a short-lived optimistic
  // flip (cleared by the effect above once fresh props land) is layered on
  // top, purely so the join button feels instant.
  const events = useMemo(() => {
    if (!optimisticJoin) return serverEvents
    return serverEvents.map((ev) => {
      if (ev.id !== optimisticJoin.eventId) return ev
      const currentlyGoing = ev.attendeeIds.indexOf(user.id) >= 0
      if (currentlyGoing === optimisticJoin.joined) return ev
      const attendeeIds = optimisticJoin.joined
        ? [...ev.attendeeIds, user.id]
        : ev.attendeeIds.filter((id) => id !== user.id)
      return { ...ev, attendeeIds }
    })
  }, [serverEvents, optimisticJoin, user.id])
  const name =
    displayName(user.fullName, user.email) || STRINGS.fallbackUserName
  const currentUser: CurrentUser = {
    id: user.id,
    name,
    initials: initialsFor(name) || initialsFor(STRINGS.fallbackUserName),
    email: user.email,
  }
  const isMobile = viewportWidth < MOBILE_BREAKPOINT
  const isTiny = viewportWidth < TINY_BREAKPOINT
  const isMonthView = state.calendarView === "month"

  const weekData = buildWeekData({
    currentDate: state.currentDate,
    today,
    events,
    weekStart: CONFIG.weekStart,
  })
  const monthCells = isMonthView
    ? buildMonthCells({
        currentDate: state.currentDate,
        today,
        events,
        weekStart: CONFIG.weekStart,
        isMobile,
        showEventPreviews: CONFIG.showEventPreviews,
      })
    : []
  const headerLabel = isMonthView
    ? fmtMonthYear(state.currentDate)
    : fmtWeekRange(
        parseDateKey(weekData.days[0].dateStr),
        parseDateKey(weekData.days[6].dateStr),
      )

  const activeEvent = buildActiveEvent(
    events,
    state.activeEventId,
    people,
    currentUser,
  )
  const categoryOptions = buildCategoryOptions(state.eventForm.category)
  const dayModalEvents = buildDayModalEvents(events, state.dayModalDate)
  const dayModalLabel = state.dayModalDate
    ? fmtDayHeader(parseDateKey(state.dayModalDate))
    : ""
  const weekdayLabelsArr = weekdayLabels(CONFIG.weekStart)

  return (
    <div className={styles.appShell}>
      <div className={styles.calendarScreen}>
        <Header
          showWordmark={!isTiny}
          headerLabel={headerLabel}
          calendarView={state.calendarView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          isPrevDisabled={isPrevDisabled}
          isNextDisabled={isNextDisabled}
          onSetMonthView={() => setView("month")}
          onSetWeekView={() => setView("week")}
          showAddButton={!isMobile}
          onAddEventClick={() => openAddModal()}
          userInitials={currentUser.initials}
          onToggleProfileMenu={toggleProfileMenu}
        />

        <CategoryLegend />

        {isMonthView ? (
          <MonthView
            weekdayLabels={weekdayLabelsArr}
            cells={monthCells}
            onCellClick={handleDayClick}
          />
        ) : (
          <WeekView weekData={weekData} onEventClick={openEventDetail} />
        )}

        {isMobile && (
          <button
            onClick={() => openAddModal()}
            aria-label={STRINGS.header.addEvent}
            className={styles.fab}
          >
            +
          </button>
        )}
      </div>

      {state.showAddModal && (
        <AddEventModal
          form={state.eventForm}
          categoryOptions={categoryOptions}
          isPending={isCreating}
          onTitleChange={(v) => updateForm("title", v)}
          onCategorySelect={(k: CategoryKey) => updateForm("category", k)}
          onDateChange={(v) => updateForm("date", v)}
          onStartChange={(v) => updateForm("startTime", v)}
          onEndChange={(v) => updateForm("endTime", v)}
          onModalityChange={(v: EventModality) => updateForm("modality", v)}
          onLocationChange={(v) => updateForm("location", v)}
          onDescriptionChange={(v) => updateForm("description", v)}
          onPictureSelect={handlePictureSelect}
          onSubmit={submitForm}
          onClose={closeAddModal}
        />
      )}

      {state.showDayModal && (
        <DayModal
          label={dayModalLabel}
          events={dayModalEvents}
          onEventClick={handleDayModalEventClick}
          onAddEvent={onAddFromDayModal}
          onClose={closeDayModal}
        />
      )}

      {state.showEventModal && (
        <EventDetailModal
          event={activeEvent}
          onToggleJoin={() => {
            if (state.activeEventId) handleToggleJoin(state.activeEventId)
          }}
          onClose={closeEventDetail}
          isJoinPending={isJoining}
          joinError={state.joinError}
        />
      )}

      {state.showProfileMenu && (
        <ProfileMenu
          userName={currentUser.name}
          userEmail={currentUser.email}
          onLogout={logout}
          onClose={closeProfileMenu}
        />
      )}

      {state.toast && <Toast message={state.toast} />}
    </div>
  )
}
