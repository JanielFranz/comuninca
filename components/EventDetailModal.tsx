import type { ActiveEventView } from "@/lib/types"
import { STRINGS } from "@/lib/strings"
import Modal, { ModalCloseButton } from "./Modal"
import styles from "./EventDetailModal.module.css"

interface EventDetailModalProps {
  event: ActiveEventView
  onToggleJoin: () => void
  onClose: () => void
}

export default function EventDetailModal({
  event,
  onToggleJoin,
  onClose,
}: EventDetailModalProps) {
  const t = STRINGS.eventDetailModal

  return (
    <Modal
      onClose={onClose}
      maxWidth={440}
      maxHeight="85vh"
      zIndex={110}
      closeLabel={t.close}
    >
      <div className={styles.headerRow}>
        <div className={styles.categoryTag} style={{ background: event.tagBg }}>
          <span
            className={styles.categoryDot}
            style={{ background: event.color }}
          />
          <span className={styles.categoryLabel}>{event.categoryLabel}</span>
        </div>
        <ModalCloseButton onClick={onClose} label={t.close} />
      </div>

      <div className={styles.title}>{event.title}</div>
      <div className={styles.metaLine}>
        {event.dateLabel} · {event.timeLabel}
      </div>
      <div className={styles.locationLine}>{event.location}</div>

      <div className={styles.description}>{event.description}</div>

      <div className={styles.sectionLabel}>{t.hostedBy}</div>
      <div className={styles.hostRow}>
        <span className={styles.hostAvatar}>{event.hostInitials}</span>
        <span className={styles.hostName}>{event.hostName}</span>
      </div>

      <div className={styles.sectionLabel}>{t.going(event.attendeeCount)}</div>
      <div className={styles.attendeesRow}>
        {event.attendees.map((at, i) => (
          <span key={i} className={styles.attendeeAvatar}>
            {at.initials}
          </span>
        ))}
        {event.noAttendees && (
          <span className={styles.noAttendees}>{t.noAttendeesYet}</span>
        )}
      </div>

      <button
        type="button"
        onClick={onToggleJoin}
        className={styles.joinButton}
        style={{ background: event.joinBg, color: event.joinColor }}
      >
        {event.joinLabel}
      </button>
    </Modal>
  )
}
