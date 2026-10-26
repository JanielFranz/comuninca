import { describe, expect, it } from "vitest"
import { applyOptimisticJoin, buildActiveEvent } from "@/lib/selectors"
import type { CalendarEvent, CurrentUser, User } from "@/lib/types"

const GROUP = "https://chat.whatsapp.com/AbCdEf123456"

const me: CurrentUser = {
  id: "me-id",
  name: "Luz Quispe",
  initials: "LQ",
  email: "luz@x.test",
}
const host: User = { id: "host-id", name: "Ava Reyes", initials: "AR" }
const other: User = { id: "other-id", name: "Marco Tanaka", initials: "MT" }
const people: User[] = [host, other]

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "ev-1",
    title: "Feria",
    category: "expoferia",
    date: "2026-09-27",
    startTime: "18:00",
    endTime: "19:00",
    location: "Plaza",
    description: "d",
    modality: "IN_PERSON",
    meetingUrl: null,
    groupUrl: null,
    pictureUrl: null,
    hostId: host.id,
    attendeeIds: [],
    ...over,
  }
}

describe("buildActiveEvent group link", () => {
  const view = (ev: CalendarEvent) => buildActiveEvent([ev], ev.id, people, me)

  it("is shown to someone who joined", () => {
    expect(
      view(event({ groupUrl: GROUP, attendeeIds: [me.id] })).groupUrl,
    ).toBe(GROUP)
  })

  it("is shown to the host", () => {
    expect(view(event({ groupUrl: GROUP, hostId: me.id })).groupUrl).toBe(GROUP)
  })

  it("is withheld from someone who has not joined, even if the data carries it", () => {
    const v = view(event({ groupUrl: GROUP, attendeeIds: [other.id] }))
    expect(v.groupUrl).toBeNull()
    expect(JSON.stringify(v)).not.toContain("whatsapp")
  })

  it("is null when the event has no group", () => {
    expect(view(event({ attendeeIds: [me.id] })).groupUrl).toBeNull()
  })

  it("the empty placeholder has none", () => {
    expect(buildActiveEvent([event()], null, people, me).groupUrl).toBeNull()
  })
})

describe("applyOptimisticJoin", () => {
  it("is a no-op without a pending join", () => {
    const events = [event({ groupUrl: null })]
    expect(applyOptimisticJoin(events, null, me.id)).toBe(events)
  })

  it("joining adds the user and shows the link handed back by toggleJoin", () => {
    const [ev] = applyOptimisticJoin(
      [event()],
      { eventId: "ev-1", joined: true, groupUrl: GROUP },
      me.id,
    )
    expect(ev.attendeeIds).toEqual([me.id])
    expect(ev.groupUrl).toBe(GROUP)
  })

  it("joining before toggleJoin answers adds the user but invents no link", () => {
    const [ev] = applyOptimisticJoin(
      [event()],
      { eventId: "ev-1", joined: true },
      me.id,
    )
    expect(ev.attendeeIds).toEqual([me.id])
    expect(ev.groupUrl).toBeNull()
  })

  it("leaving removes the user and hides the link again", () => {
    const [ev] = applyOptimisticJoin(
      [event({ attendeeIds: [me.id, other.id], groupUrl: GROUP })],
      { eventId: "ev-1", joined: false },
      me.id,
    )
    expect(ev.attendeeIds).toEqual([other.id])
    expect(ev.groupUrl).toBeNull()
  })

  it("the host leaving their own event keeps their link", () => {
    const [ev] = applyOptimisticJoin(
      [event({ hostId: me.id, attendeeIds: [me.id], groupUrl: GROUP })],
      { eventId: "ev-1", joined: false },
      me.id,
    )
    expect(ev.attendeeIds).toEqual([])
    expect(ev.groupUrl).toBe(GROUP)
  })

  it("only touches the event being toggled", () => {
    const a = event({ id: "ev-1" })
    const b = event({ id: "ev-2", groupUrl: null })
    const out = applyOptimisticJoin(
      [a, b],
      { eventId: "ev-1", joined: true, groupUrl: GROUP },
      me.id,
    )
    expect(out[1]).toBe(b)
  })

  it("does nothing when the state already matches", () => {
    const joined = event({ attendeeIds: [me.id], groupUrl: GROUP })
    const [ev] = applyOptimisticJoin(
      [joined],
      { eventId: "ev-1", joined: true, groupUrl: GROUP },
      me.id,
    )
    expect(ev).toBe(joined)
  })
})
