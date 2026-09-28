import Link from "next/link"
import { redirect } from "next/navigation"
import UsersTable from "@/components/admin/UsersTable"
import { listUsers } from "@/lib/actions/admin"
import { requireAdminOrRedirect } from "@/lib/auth"
import { STRINGS } from "@/lib/strings"
import { USERS_SEARCH_MAX_LENGTH, buildUsersHref } from "@/lib/usersQuery"
import styles from "./page.module.css"

const BASE = "/admin/users"

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdminOrRedirect()
  const t = STRINGS.admin.users
  const sp = await searchParams
  const result = await listUsers({ page: sp.page, q: sp.q })

  if (!result.ok) {
    if (result.error === "UNAUTHENTICATED") redirect("/login")
    if (result.error === "FORBIDDEN") redirect("/calendar")
    return (
      <main className={styles.page}>
        <Link href="/admin" className={styles.back}>
          {t.backToPanel}
        </Link>
        <h1 className={styles.title}>{t.pageTitle}</h1>
        <p role="alert" className={styles.error}>
          {t.errorTitle} {t.errorHint}
        </p>
      </main>
    )
  }

  const { users, total, matching, page, pageCount, q } = result

  return (
    <main className={styles.page}>
      <Link href="/admin" className={styles.back}>
        {t.backToPanel}
      </Link>
      <h1 className={styles.title}>{t.pageTitle}</h1>
      <p className={styles.description}>{t.pageDescription}</p>
      <p className={styles.total}>
        {t.total(total)}
        {q ? (
          <span className={styles.matching}> · {t.matching(matching)}</span>
        ) : null}
      </p>

      <form method="get" action={BASE} className={styles.search} role="search">
        <label htmlFor="users-q" className={styles.label}>
          {t.searchLabel}
        </label>
        <div className={styles.searchRow}>
          <input
            id="users-q"
            name="q"
            type="search"
            defaultValue={q}
            maxLength={USERS_SEARCH_MAX_LENGTH}
            placeholder={t.searchPlaceholder}
            className={styles.input}
          />
          <button type="submit" className={styles.button}>
            {t.searchSubmit}
          </button>
          {q ? (
            <Link href={BASE} className={styles.clear}>
              {t.searchClear}
            </Link>
          ) : null}
        </div>
      </form>

      {users.length === 0 ? (
        <p className={styles.empty}>{q ? t.emptyNoResults : t.emptyNoUsers}</p>
      ) : (
        <UsersTable users={users} />
      )}

      {matching > 0 ? (
        <nav aria-label={t.paginationLabel} className={styles.pagination}>
          {page > 1 ? (
            <Link href={buildUsersHref(BASE, page - 1, q)} rel="prev">
              {t.previous}
            </Link>
          ) : (
            <span className={styles.disabled}>{t.previous}</span>
          )}
          <span>{t.pageOf(page, pageCount)}</span>
          {page < pageCount ? (
            <Link href={buildUsersHref(BASE, page + 1, q)} rel="next">
              {t.next}
            </Link>
          ) : (
            <span className={styles.disabled}>{t.next}</span>
          )}
        </nav>
      ) : null}
    </main>
  )
}
