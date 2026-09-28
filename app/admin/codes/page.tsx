import Link from "next/link"
import { redirect } from "next/navigation"
import CodesTable from "@/components/admin/CodesTable"
import GenerateCodesModal from "@/components/admin/GenerateCodesModal"
import { listInviteCodes } from "@/lib/actions/invites"
import { requireAdminOrRedirect } from "@/lib/auth"
import { buildCodesHref, type CodeStatus } from "@/lib/codesQuery"
import { STRINGS } from "@/lib/strings"
import styles from "./page.module.css"

const BASE = "/admin/codes"

export default async function AdminCodesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdminOrRedirect()
  const t = STRINGS.admin.codes
  const sp = await searchParams
  const result = await listInviteCodes({ page: sp.page, status: sp.status })

  if (!result.ok && result.error === "UNAUTHENTICATED") redirect("/login")
  if (!result.ok && result.error === "FORBIDDEN") redirect("/calendar")

  const filters: { label: string; status: CodeStatus | null }[] = [
    { label: t.filterAll, status: null },
    { label: t.filterUnused, status: "UNUSED" },
    { label: t.filterUsed, status: "USED" },
    { label: t.filterRevoked, status: "EXPIRED" },
  ]

  return (
    <main className={styles.page}>
      <Link href="/admin" className={styles.back}>
        {t.backToPanel}
      </Link>
      <h1 className={styles.title}>{t.pageTitle}</h1>
      <p className={styles.description}>{t.pageDescription}</p>
      <GenerateCodesModal />

      <section className={styles.list} aria-labelledby="codes-list-title">
        <h2 id="codes-list-title" className={styles.listTitle}>
          {t.listTitle}
        </h2>

        {!result.ok ? (
          <p role="alert" className={styles.error}>
            {t.listErrorTitle} {t.listErrorHint}
          </p>
        ) : (
          <>
            <nav aria-label={t.filterLabel} className={styles.filters}>
              {filters.map((f) => (
                <Link
                  key={f.label}
                  href={buildCodesHref(BASE, 1, f.status)}
                  className={
                    f.status === result.status
                      ? `${styles.filter} ${styles.filterActive}`
                      : styles.filter
                  }
                  aria-current={f.status === result.status ? "true" : undefined}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
            <p className={styles.total}>{t.total(result.total)}</p>

            {result.codes.length === 0 ? (
              <p className={styles.empty}>
                {result.status ? t.emptyNoResults : t.emptyNoCodes}
              </p>
            ) : (
              <CodesTable codes={result.codes} />
            )}

            {result.total > 0 ? (
              <nav aria-label={t.paginationLabel} className={styles.pagination}>
                {result.page > 1 ? (
                  <Link
                    href={buildCodesHref(BASE, result.page - 1, result.status)}
                    rel="prev"
                  >
                    {t.previous}
                  </Link>
                ) : (
                  <span className={styles.disabled}>{t.previous}</span>
                )}
                <span>{t.pageOf(result.page, result.pageCount)}</span>
                {result.page < result.pageCount ? (
                  <Link
                    href={buildCodesHref(BASE, result.page + 1, result.status)}
                    rel="next"
                  >
                    {t.next}
                  </Link>
                ) : (
                  <span className={styles.disabled}>{t.next}</span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </main>
  )
}
