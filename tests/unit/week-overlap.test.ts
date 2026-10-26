/**
 * Feature #18 — week view overlap layout (AC 3.3.2, 3.3.12–3.3.15).
 *
 * Pure-function tests against `buildWeekData`'s per-day interval-graph
 * column packing: `WeekBlock.left`/`WeekBlock.width` (CSS percentages) must
 * keep every overlapping card visible and clickable, side-by-side, while
 * leaving non-overlapping events at full width. No mocks needed — this is
 * pure math over plain data.
 */
import { describe, expect, it } from "vitest"
import { parseDateKey } from "@/lib/dateUtils"
import { buildWeekData } from "@/lib/selectors"
import type { CalendarEvent } from "@/lib/types"

const DAY = "2026-08-05" // a Wednesday; arbitrary but fixed
const CURRENT_DATE = parseDateKey(DAY)

function makeEvent(
  id: string,
  startTime: string,
  endTime: string,
  title = id,
): CalendarEvent {
  return {
    id,
    title,
    category: "convivencia",
    date: DAY,
    startTime,
    endTime,
    location: "",
    description: "",
    modality: "IN_PERSON",
    meetingUrl: null,
    groupUrl: null,
    pictureUrl: null,
    hostId: "u1",
    attendeeIds: [],
  }
}

function blocksFor(events: CalendarEvent[]) {
  const data = buildWeekData({
    currentDate: CURRENT_DATE,
    today: DAY,
    events,
    weekStart: "sunday",
  })
  const day = data.days.find((d) => d.dateStr === DAY)
  if (!day) throw new Error("day not found in week data")
  return day.blocks
}

function byId(blocks: ReturnType<typeof blocksFor>, id: string) {
  const b = blocks.find((x) => x.id === id)
  if (!b) throw new Error(`block ${id} not found`)
  return b
}

describe("buildWeekData: overlap layout", () => {
  it("identical start+end: both events split the column 50/50, deterministic by id", () => {
    const events = [
      makeEvent("e2", "09:00", "10:00"),
      makeEvent("e1", "09:00", "10:00"),
    ]
    const blocks = blocksFor(events)
    const e1 = byId(blocks, "e1")
    const e2 = byId(blocks, "e2")
    expect(e1.width).toBe(50)
    expect(e2.width).toBe(50)
    // Tie-break by id: "e1" < "e2" sorts first and takes the lower column.
    expect(e1.left).toBe(0)
    expect(e2.left).toBe(50)
  })

  it("triple overlap: three mutually-overlapping events split into thirds", () => {
    const events = [
      makeEvent("e1", "09:00", "11:00"),
      makeEvent("e2", "09:30", "10:30"),
      makeEvent("e3", "10:00", "10:15"),
    ]
    const blocks = blocksFor(events)
    const e1 = byId(blocks, "e1")
    const e2 = byId(blocks, "e2")
    const e3 = byId(blocks, "e3")

    expect(e1.width).toBeCloseTo(100 / 3, 5)
    expect(e2.width).toBeCloseTo(100 / 3, 5)
    expect(e3.width).toBeCloseTo(100 / 3, 5)

    const lefts = [e1.left, e2.left, e3.left].sort((a, b) => a - b)
    expect(lefts[0]).toBeCloseTo(0, 5)
    expect(lefts[1]).toBeCloseTo(100 / 3, 5)
    expect(lefts[2]).toBeCloseTo(200 / 3, 5)
    // All distinct columns.
    expect(new Set(lefts.map((l) => Math.round(l * 100)))).toHaveProperty(
      "size",
      3,
    )
  })

  it("chained partial overlaps (A-B, B-C, A-C don't) form one connected component sharing totalColumns", () => {
    // A 9:00-10:00, B 9:30-10:30, C 10:15-11:00. A and C never intersect,
    // but the chain through B makes all three one component.
    const events = [
      makeEvent("ea", "09:00", "10:00"),
      makeEvent("eb", "09:30", "10:30"),
      makeEvent("ec", "10:15", "11:00"),
    ]
    const blocks = blocksFor(events)
    const a = byId(blocks, "ea")
    const b = byId(blocks, "eb")
    const c = byId(blocks, "ec")

    // A naive pairwise-only implementation would treat A and C as
    // unrelated to B's cluster; here all three must share one width
    // fraction because they form a single connected component.
    expect(a.width).toBeCloseTo(50, 5)
    expect(b.width).toBeCloseTo(50, 5)
    expect(c.width).toBeCloseTo(50, 5)

    // For every pair whose time ranges actually intersect, their [left,
    // left+width] ranges must not overlap (different columns). A-B and
    // B-C intersect; A-C does not (so their column reuse is fine).
    const rangesDisjoint = (
      x: { left: number; width: number },
      y: { left: number; width: number },
    ) => x.left + x.width <= y.left || y.left + y.width <= x.left

    expect(rangesDisjoint(a, b)).toBe(true)
    expect(rangesDisjoint(b, c)).toBe(true)
  })

  it("non-overlapping sequential events each get full width, independently", () => {
    const events = [
      makeEvent("e1", "09:00", "10:00"),
      makeEvent("e2", "11:00", "12:00"),
    ]
    const blocks = blocksFor(events)
    const e1 = byId(blocks, "e1")
    const e2 = byId(blocks, "e2")
    expect(e1).toMatchObject({ left: 0, width: 100 })
    expect(e2).toMatchObject({ left: 0, width: 100 })
  })

  it("touching-but-not-overlapping (A ends exactly when B starts) counts as no overlap", () => {
    const events = [
      makeEvent("e1", "09:00", "10:00"),
      makeEvent("e2", "10:00", "11:00"),
    ]
    const blocks = blocksFor(events)
    const e1 = byId(blocks, "e1")
    const e2 = byId(blocks, "e2")
    expect(e1).toMatchObject({ left: 0, width: 100 })
    expect(e2).toMatchObject({ left: 0, width: 100 })
  })

  it("is deterministic: identical input produces byte-identical left/width on repeated calls", () => {
    const events = [
      makeEvent("e1", "09:00", "11:00"),
      makeEvent("e2", "09:30", "10:30"),
      makeEvent("e3", "10:00", "10:15"),
      makeEvent("e4", "13:00", "14:00"),
    ]
    const run = () =>
      blocksFor(events).map((b) => ({ id: b.id, left: b.left, width: b.width }))
    expect(run()).toEqual(run())
  })

  it("a day with a mix: a lone event stays full width while a separate overlapping pair splits, independently", () => {
    const events = [
      makeEvent("lone", "08:00", "08:30"),
      makeEvent("p1", "18:00", "19:00"),
      makeEvent("p2", "18:30", "19:30"),
    ]
    const blocks = blocksFor(events)
    const lone = byId(blocks, "lone")
    const p1 = byId(blocks, "p1")
    const p2 = byId(blocks, "p2")

    expect(lone).toMatchObject({ left: 0, width: 100 })
    expect(p1.width).toBe(50)
    expect(p2.width).toBe(50)
    expect(new Set([p1.left, p2.left])).toEqual(new Set([0, 50]))
  })
})
