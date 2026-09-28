"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "@/lib/actions/auth"
import { STRINGS } from "@/lib/strings"
import styles from "./LogoutButton.module.css"

export default function LogoutButton() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onLogout() {
    startTransition(async () => {
      await signOut()
      router.push("/login")
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      className={styles.button}
      onClick={onLogout}
      disabled={isPending}
    >
      {STRINGS.profileMenu.logout}
    </button>
  )
}
