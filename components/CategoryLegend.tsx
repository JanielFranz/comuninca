import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/constants"
import styles from "./CategoryLegend.module.css"

export default function CategoryLegend() {
  return (
    <div className={styles.legend}>
      {CATEGORY_ORDER.map((key) => {
        const meta = CATEGORY_META[key]
        return (
          <div key={key} className={styles.item}>
            <span className={styles.dot} style={{ background: meta.color }} />
            {meta.label}
          </div>
        )
      })}
    </div>
  )
}
