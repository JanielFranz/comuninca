import type { UserRow } from "@/lib/actions/admin"
import { fmtDate, fmtDateOnly } from "@/lib/dateUtils"
import { STRINGS } from "@/lib/strings"
import styles from "./UsersTable.module.css"

function orDash(value: string | null): string {
  return value && value.trim() ? value : STRINGS.admin.users.missing
}

export default function UsersTable({ users }: { users: UserRow[] }) {
  const t = STRINGS.admin.users
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <caption className={styles.caption}>{t.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.colName}</th>
            <th scope="col">{t.colEmail}</th>
            <th scope="col">{t.colCreatedAt}</th>
            <th scope="col">{t.colBirthday}</th>
            <th scope="col">{t.colOccupation}</th>
            <th scope="col">{t.colInviteCode}</th>
            <th scope="col">{t.colDetails}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.fullName}</td>
              <td className={styles.break}>{u.email}</td>
              <td>{fmtDate(u.createdAt)}</td>
              <td>{u.birthday ? fmtDateOnly(u.birthday) : t.missing}</td>
              <td>{orDash(u.occupation)}</td>
              <td className={styles.mono}>{orDash(u.inviteCode)}</td>
              <td>
                <details className={styles.details}>
                  <summary>{t.detailsToggle}</summary>
                  <dl className={styles.dl}>
                    <dt>{t.detailsProfession}</dt>
                    <dd>{orDash(u.profession)}</dd>
                    <dt>{t.detailsIkigai}</dt>
                    <dd>{orDash(u.ikigai)}</dd>
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
