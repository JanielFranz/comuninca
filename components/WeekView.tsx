import type { WeekData } from "@/lib/types";
import styles from "./WeekView.module.css";

interface WeekViewProps {
  weekData: WeekData;
  onEventClick: (id: string) => void;
}

export default function WeekView({ weekData, onEventClick }: WeekViewProps) {
  const { days, hours, nowTop } = weekData;

  return (
    <div className={styles.wrapper}>
      <div className={styles.dayHeaderRow}>
        <div />
        {days.map((d) => (
          <div key={d.key} className={styles.dayHeader}>
            <div className={styles.dayHeaderLabel}>{d.label}</div>
            <div
              className={styles.dayHeaderNum}
              style={{ background: d.numBg, color: d.numColor }}
            >
              {d.dayNum}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.gridBody}>
        <div>
          {hours.map((h) => (
            <div key={h.key} className={styles.hourLabel}>
              {h.label}
            </div>
          ))}
        </div>

        {days.map((d) => (
          <div key={d.key} className={styles.dayColumn}>
            {hours.map((h) => (
              <div key={h.key} className={styles.hourLine} />
            ))}

            {d.blocks.map((b) => (
              <div
                key={b.id}
                onClick={() => onEventClick(b.id)}
                className={styles.block}
                style={{
                  top: `${b.top}px`,
                  height: `${b.height}px`,
                  background: b.bg,
                  borderLeftColor: b.color,
                }}
              >
                <div className={styles.blockTitle}>{b.title}</div>
                <div className={styles.blockTime}>{b.timeLabel}</div>
              </div>
            ))}

            {d.showNow && (
              <div className={styles.nowLine} style={{ top: `${nowTop}px` }}>
                <span className={styles.nowDot} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
