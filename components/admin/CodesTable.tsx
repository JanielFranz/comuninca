import type { CodeRow } from "@/lib/actions/invites"
import { fmtDate } from "@/lib/dateUtils"
import { STRINGS } from "@/lib/strings"
import RevokeCodeButton from "./RevokeCodeButton"
import styles from "./CodesTable.module.css"

const t = STRINGS.admin.codes

const STATUS_LABEL = {
  UNUSED: t.statusUnused,
  USED: t.statusUsed,
  EXPIRED: t.statusRevoked,
} as const

const STATUS_CLASS = {
  UNUSED: styles.badgeUnused,
  USED: styles.badgeUsed,
  EXPIRED: styles.badgeRevoked,
} as const

function Usage({ row }: { row: CodeRow }) {
  if (row.status === "UNUSED") return <span>{t.usageUnused}</span>
  if (row.status === "EXPIRED") {
    return <span className={styles.revokedText}>{t.usageRevoked}</span>
  }
  return (
    <div>
      {row.usedBy ? (
        <>
          <div>{row.usedBy.fullName}</div>
          <div className={styles.break}>{row.usedBy.email}</div>
        </>
      ) : null}
      {row.usedAt ? (
        <div className={styles.muted}>{t.usedOn(fmtDate(row.usedAt))}</div>
      ) : null}
    </div>
  )
}

export default function CodesTable({ codes }: { codes: CodeRow[] }) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{t.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.colCode}</th>
            <th scope="col">{t.colStatus}</th>
            <th scope="col">{t.colCreatedAt}</th>
            <th scope="col">{t.colUsage}</th>
            <th scope="col">{t.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {codes.map((c) => (
            <tr key={c.id}>
              <td
                className={
                  c.status === "EXPIRED"
                    ? `${styles.mono} ${styles.revokedCode}`
                    : styles.mono
                }
              >
                {c.code}
              </td>
              <td>
                <span className={`${styles.badge} ${STATUS_CLASS[c.status]}`}>
                  {STATUS_LABEL[c.status]}
                </span>
              </td>
              <td>{fmtDate(c.createdAt)}</td>
              <td>
                <Usage row={c} />
              </td>
              <td>
                {c.status === "UNUSED" ? <RevokeCodeButton id={c.id} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
