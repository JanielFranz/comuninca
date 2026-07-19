import type { CalendarView } from "@/lib/types";
import { STRINGS } from "@/lib/strings";
import styles from "./Header.module.css";

interface HeaderProps {
  showWordmark: boolean;
  headerLabel: string;
  calendarView: CalendarView;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSetMonthView: () => void;
  onSetWeekView: () => void;
  showAddButton: boolean;
  onAddEventClick: () => void;
  userInitials: string;
  onToggleProfileMenu: () => void;
}

export default function Header({
  showWordmark,
  headerLabel,
  calendarView,
  onPrev,
  onNext,
  onToday,
  onSetMonthView,
  onSetWeekView,
  showAddButton,
  onAddEventClick,
  userInitials,
  onToggleProfileMenu,
}: HeaderProps) {
  const t = STRINGS.header;
  const isMonth = calendarView === "month";

  return (
    <header className={styles.header}>
      <div className={styles.brandRow}>
        <div className={styles.brandMark}>C</div>
        {showWordmark && <div className={styles.brandName}>{STRINGS.meta.title}</div>}
      </div>

      <div className={styles.navGroup}>
        <button
          onClick={onPrev}
          aria-label={t.previous}
          className={styles.navButton}
        >
          ‹
        </button>
        <button onClick={onToday} className={styles.todayButton}>
          {t.today}
        </button>
        <button onClick={onNext} aria-label={t.next} className={styles.navButton}>
          ›
        </button>
        <div className={styles.headerLabel}>{headerLabel}</div>
      </div>

      <div className={styles.rightGroup}>
        <div className={styles.viewToggle}>
          <button
            onClick={onSetMonthView}
            className={
              isMonth
                ? `${styles.viewToggleButton} ${styles.viewToggleButtonActive}`
                : styles.viewToggleButton
            }
          >
            {t.month}
          </button>
          <button
            onClick={onSetWeekView}
            className={
              !isMonth
                ? `${styles.viewToggleButton} ${styles.viewToggleButtonActive}`
                : styles.viewToggleButton
            }
          >
            {t.week}
          </button>
        </div>

        {showAddButton && (
          <button onClick={onAddEventClick} className={styles.addButton}>
            <span className={styles.addButtonIcon}>+</span>
            <span>{t.addEvent}</span>
          </button>
        )}

        <button
          onClick={onToggleProfileMenu}
          className={styles.avatarButton}
        >
          {userInitials}
        </button>
      </div>
    </header>
  );
}
