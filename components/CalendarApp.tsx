"use client"

import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import type {
  CalendarEvent,
  CalendarView,
  CategoryKey,
  CurrentUser,
  EventFormState,
  Screen,
} from "@/lib/types"
import {
  CONFIG,
  MOBILE_BREAKPOINT,
  SEED_EVENTS,
  TINY_BREAKPOINT,
  TODAY,
} from "@/lib/constants"
import {
  addDays,
  addMinutesStr,
  addMonths,
  dateKey,
  fmtDayHeader,
  fmtMonthYear,
  fmtWeekRange,
  nextId,
  parseDateKey,
} from "@/lib/dateUtils"
import {
  buildActiveEvent,
  buildAttendeeOptions,
  buildCategoryOptions,
  buildDayModalEvents,
  buildMonthCells,
  buildWeekData,
  weekdayLabels,
} from "@/lib/selectors"
import { STRINGS } from "@/lib/strings"

import LoginScreen from "./LoginScreen"
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
  screen: Screen
  loginEmail: string
  loginPassword: string
  loginError: string
  isLoggingIn: boolean
  currentUser: CurrentUser | null
  currentDate: Date
  calendarView: CalendarView
  events: CalendarEvent[]
  showAddModal: boolean
  showDayModal: boolean
  dayModalDate: string | null
  showEventModal: boolean
  activeEventId: string | null
  showProfileMenu: boolean
  toast: string
  eventForm: EventFormState
}

function emptyForm(dateStr?: string): EventFormState {
  return {
    title: "",
    category: "social",
    date: dateStr || dateKey(TODAY),
    startTime: "18:00",
    endTime: "19:00",
    location: "",
    description: "",
    attendeeIds: [],
    error: "",
  }
}

function initialState(): AppState {
  return {
    screen: "login",
    loginEmail: "",
    loginPassword: "",
    loginError: "",
    isLoggingIn: false,
    currentUser: null,
    currentDate: TODAY,
    calendarView: CONFIG.defaultView,
    events: SEED_EVENTS.slice(),
    showAddModal: false,
    showDayModal: false,
    dayModalDate: null,
    showEventModal: false,
    activeEventId: null,
    showProfileMenu: false,
    toast: "",
    eventForm: emptyForm(dateKey(TODAY)),
  }
}

export default function CalendarApp() {
  const [state, setState] = useState<AppState>(initialState)
  // Deterministic on first paint (server + client); corrected on mount below.
  const [viewportWidth, setViewportWidth] = useState(1280)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Login ----
  function setLoginEmail(v: string) {
    patchState({ loginEmail: v, loginError: "" })
  }
  function setLoginPassword(v: string) {
    patchState({ loginPassword: v, loginError: "" })
  }
  function submitLogin(e: FormEvent) {
    e.preventDefault()
    const email = state.loginEmail
    const password = state.loginPassword
    if (!email.trim() || !password.trim()) {
      patchState({ loginError: STRINGS.login.missingFieldsError })
      return
    }
    patchState({ isLoggingIn: true })
    setTimeout(() => {
      const namePart = email.split("@")[0].replace(/[._]+/g, " ").trim()
      const name =
        namePart
          .split(" ")
          .filter(Boolean)
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" ") || "Tú"
      const initials = name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
      patchState({
        isLoggingIn: false,
        currentUser: { id: "me", name, initials, email },
        screen: "calendar",
      })
    }, 750)
  }

  // ---- Navigation ----
  function goToday() {
    patchState({ currentDate: TODAY })
  }
  function goPrev() {
    patchState((s) => ({
      currentDate:
        s.calendarView === "month"
          ? addMonths(s.currentDate, -1)
          : addDays(s.currentDate, -7),
    }))
  }
  function goNext() {
    patchState((s) => ({
      currentDate:
        s.calendarView === "month"
          ? addMonths(s.currentDate, 1)
          : addDays(s.currentDate, 7),
    }))
  }
  function setView(v: CalendarView) {
    patchState({ calendarView: v })
  }

  // ---- Add / edit event form ----
  function openAddModal(dStr?: string) {
    patchState((s) => ({
      showAddModal: true,
      showDayModal: false,
      eventForm: emptyForm(dStr || dateKey(s.currentDate)),
    }))
  }
  function closeAddModal() {
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
  function toggleFormAttendee(uid: string) {
    patchState((s) => {
      const ids = s.eventForm.attendeeIds.slice()
      const i = ids.indexOf(uid)
      if (i >= 0) ids.splice(i, 1)
      else ids.push(uid)
      return { eventForm: { ...s.eventForm, attendeeIds: ids } }
    })
  }
  function submitForm(e: FormEvent) {
    e.preventDefault()
    const f = state.eventForm
    if (!f.title.trim() || !f.date || !f.startTime) {
      patchState({
        eventForm: { ...f, error: STRINGS.addEventModal.validationError },
      })
      return
    }
    const ev: CalendarEvent = {
      id: nextId(),
      title: f.title.trim(),
      category: f.category,
      date: f.date,
      startTime: f.startTime,
      endTime:
        f.endTime && f.endTime > f.startTime
          ? f.endTime
          : addMinutesStr(f.startTime, 60),
      location: f.location.trim(),
      description: f.description.trim(),
      hostId: "me",
      attendeeIds: f.attendeeIds.slice(),
    }
    patchState((s) => ({
      events: [...s.events, ev],
      showAddModal: false,
      toast: STRINGS.addEventModal.toastSuccess,
    }))
    queueToastClear()
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
    patchState({ activeEventId: id, showEventModal: true })
  }
  function closeEventDetail() {
    patchState({ showEventModal: false })
  }
  function toggleJoin(id: string) {
    patchState((s) => ({
      events: s.events.map((ev) => {
        if (ev.id !== id) return ev
        const ids = ev.attendeeIds.slice()
        const i = ids.indexOf("me")
        if (i >= 0) ids.splice(i, 1)
        else ids.push("me")
        return { ...ev, attendeeIds: ids }
      }),
    }))
  }

  // ---- Profile menu ----
  function toggleProfileMenu() {
    patchState((s) => ({ showProfileMenu: !s.showProfileMenu }))
  }
  function closeProfileMenu() {
    patchState({ showProfileMenu: false })
  }
  function logout() {
    patchState({
      screen: "login",
      showProfileMenu: false,
      currentUser: null,
      loginEmail: "",
      loginPassword: "",
      loginError: "",
    })
  }

  // ---- Derived / view-model data ----
  const isMobile = viewportWidth < MOBILE_BREAKPOINT
  const isTiny = viewportWidth < TINY_BREAKPOINT
  const isMonthView = state.calendarView === "month"

  const weekData = buildWeekData({
    currentDate: state.currentDate,
    events: state.events,
    weekStart: CONFIG.weekStart,
  })
  const monthCells = isMonthView
    ? buildMonthCells({
        currentDate: state.currentDate,
        events: state.events,
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
    state.events,
    state.activeEventId,
    state.currentUser,
  )
  const categoryOptions = buildCategoryOptions(state.eventForm.category)
  const attendeeOptions = buildAttendeeOptions(state.eventForm.attendeeIds)
  const dayModalEvents = buildDayModalEvents(state.events, state.dayModalDate)
  const dayModalLabel = state.dayModalDate
    ? fmtDayHeader(parseDateKey(state.dayModalDate))
    : ""
  const weekdayLabelsArr = weekdayLabels(CONFIG.weekStart)

  return (
    <div className={styles.appShell}>
      {state.screen === "login" && (
        <LoginScreen
          email={state.loginEmail}
          password={state.loginPassword}
          error={state.loginError}
          isLoggingIn={state.isLoggingIn}
          onEmailChange={setLoginEmail}
          onPasswordChange={setLoginPassword}
          onSubmit={submitLogin}
        />
      )}

      {state.screen === "calendar" && (
        <div className={styles.calendarScreen}>
          <Header
            showWordmark={!isTiny}
            headerLabel={headerLabel}
            calendarView={state.calendarView}
            onPrev={goPrev}
            onNext={goNext}
            onToday={goToday}
            onSetMonthView={() => setView("month")}
            onSetWeekView={() => setView("week")}
            showAddButton={!isMobile}
            onAddEventClick={() => openAddModal()}
            userInitials={state.currentUser?.initials ?? ""}
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
      )}

      {state.showAddModal && (
        <AddEventModal
          form={state.eventForm}
          categoryOptions={categoryOptions}
          attendeeOptions={attendeeOptions}
          onTitleChange={(v) => updateForm("title", v)}
          onCategorySelect={(k: CategoryKey) => updateForm("category", k)}
          onDateChange={(v) => updateForm("date", v)}
          onStartChange={(v) => updateForm("startTime", v)}
          onEndChange={(v) => updateForm("endTime", v)}
          onLocationChange={(v) => updateForm("location", v)}
          onDescriptionChange={(v) => updateForm("description", v)}
          onAttendeeToggle={toggleFormAttendee}
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
            if (state.activeEventId) toggleJoin(state.activeEventId)
          }}
          onClose={closeEventDetail}
        />
      )}

      {state.showProfileMenu && (
        <ProfileMenu
          userName={state.currentUser?.name ?? ""}
          userEmail={state.currentUser?.email ?? ""}
          onLogout={logout}
          onClose={closeProfileMenu}
        />
      )}

      {state.toast && <Toast message={state.toast} />}
    </div>
  )
}
