import { redirect } from "next/navigation"
import OnboardingForm from "@/components/OnboardingForm"
import { requireUserOrRedirect } from "@/lib/auth"

export default async function OnboardingPage() {
  const user = await requireUserOrRedirect()
  // Admins never onboard (AC 1.4.8); completed users never see it again (AC 1.4.5).
  if (user.role === "ADMIN") redirect("/admin")
  if (user.onboardingCompleted) redirect("/calendar")

  return <OnboardingForm />
}
