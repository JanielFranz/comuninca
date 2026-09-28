import { redirect } from "next/navigation"
import CalendarApp from "@/components/CalendarApp"
import { listEvents } from "@/lib/actions/events"
import { requireOnboardedUserOrRedirect } from "@/lib/auth"
import { STRINGS } from "@/lib/strings"
import {
  dateKey,
  parseCalendarDateParam,
  parseDateKey,
  parseViewParam,
} from "@/lib/dateUtils"

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireOnboardedUserOrRedirect()
  const sp = await searchParams
  const result = await listEvents()

  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") redirect("/login")
    return (
      <main role="alert">
        <h1>{STRINGS.calendarPage.errorTitle}</h1>
        <p>{STRINGS.calendarPage.errorHint}</p>
      </main>
    )
  }

  // Feature #19: an out-of-range or malformed `date`/`view` URL param is
  // clamped into the ±3-month navigation window here, never a 500 — see
  // `parseCalendarDateParam`/`parseViewParam` in lib/dateUtils.ts. This does
  // NOT change what `listEvents()` fetches (it already loads the whole
  // window regardless of which specific period is being viewed).
  const todayDate = parseDateKey(result.today)
  const initialDate = dateKey(parseCalendarDateParam(sp.date, todayDate))
  const initialView = parseViewParam(sp.view)

  return (
    <CalendarApp
      user={{ id: user.id, fullName: user.fullName, email: user.email }}
      events={result.events}
      people={result.people}
      today={result.today}
      initialDate={initialDate}
      initialView={initialView}
    />
  )
}
