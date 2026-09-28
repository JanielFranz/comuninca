import Link from "next/link"
import LogoutButton from "@/components/LogoutButton"
import { requireAdminOrRedirect } from "@/lib/auth"
import { STRINGS } from "@/lib/strings"
import styles from "./page.module.css"

export default async function AdminPage() {
  const user = await requireAdminOrRedirect()

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>{STRINGS.admin.title}</h1>
      <p className={styles.meta}>
        {STRINGS.admin.signedInAs} {user.email}
      </p>
      <Link href="/admin/codes" className={styles.link}>
        {STRINGS.admin.codesLink}
      </Link>
      <Link href="/admin/users" className={styles.link}>
        {STRINGS.admin.usersLink}
      </Link>
      <LogoutButton />
    </main>
  )
}
