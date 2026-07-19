import type { CSSProperties } from "react";
import type { MonthCell } from "@/lib/types";
import { STRINGS } from "@/lib/strings";
import styles from "./MonthView.module.css";

interface MonthViewProps {
  weekdayLabels: string[];
  cells: MonthCell[];
  onCellClick: (dateStr: string, hasEvents: boolean) => void;
}

export default function MonthView({ weekdayLabels, cells, onCellClick }: MonthViewProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.weekdayRow}>
        {weekdayLabels.map((wd, i) => (
          <div key={`${wd}-${i}`} className={styles.weekdayLabel}>
            {wd}
          </div>
        ))}
      </div>
      <div className={styles.grid}>
        {cells.map((cell) => {
          const cellVars = {
            "--cell-bg": cell.cellBg,
            "--cell-opacity": cell.cellOpacity,
          } as CSSProperties;
          return (
            <div
              key={cell.key}
              onClick={() => onCellClick(cell.dateStr, cell.hasEvents)}
              className={styles.cell}
              style={cellVars}
            >
              <div className={styles.cellTopRow}>
                <span
                  className={styles.dayNum}
                  style={{ background: cell.numBg, color: cell.numColor }}
                >
                  {cell.dayNum}
                </span>
                {cell.hasCount && (
                  <span className={styles.countBadge}>{cell.count}</span>
                )}
              </div>

              {cell.previews.map((pv) => (
                <div key={pv.id} className={styles.preview}>
                  <span
                    className={styles.previewDot}
                    style={{ background: pv.color }}
                  />
                  <span className={styles.previewText}>{pv.title}</span>
                </div>
              ))}

              {cell.hasMore && (
                <div className={styles.more}>{STRINGS.monthView.more(cell.moreCount)}</div>
              )}

              {cell.hasDotsOnly && (
                <div className={styles.dotsRow}>
                  {cell.dots.map((dot, i) => (
                    <span
                      key={i}
                      className={styles.smallDot}
                      style={{ background: dot }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
