import type { DayModalEventView } from "@/lib/types";
import { STRINGS } from "@/lib/strings";
import Modal, { ModalCloseButton } from "./Modal";
import styles from "./DayModal.module.css";

interface DayModalProps {
  label: string;
  events: DayModalEventView[];
  onEventClick: (id: string) => void;
  onAddEvent: () => void;
  onClose: () => void;
}

export default function DayModal({
  label,
  events,
  onEventClick,
  onAddEvent,
  onClose,
}: DayModalProps) {
  const t = STRINGS.dayModal;

  return (
    <Modal onClose={onClose} maxWidth={420} maxHeight="82vh" zIndex={100} closeLabel={t.close}>
      <div className={styles.headerRow}>
        <div className={styles.title}>{label}</div>
        <ModalCloseButton onClick={onClose} label={t.close} />
      </div>

      <div className={styles.list}>
        {events.map((ev) => (
          <div
            key={ev.id}
            onClick={() => onEventClick(ev.id)}
            className={styles.row}
            style={{ borderLeftColor: ev.color }}
          >
            <div className={styles.rowBody}>
              <div className={styles.rowTitle}>{ev.title}</div>
              <div className={styles.rowMeta}>
                {ev.timeLabel} · {ev.location}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={onAddEvent} className={styles.addButton}>
        {t.addOnThisDay}
      </button>
    </Modal>
  );
}
