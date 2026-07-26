import type { FormEvent } from "react"
import type {
  AttendeeOption,
  CategoryKey,
  CategoryOption,
  EventFormState,
} from "@/lib/types"
import { STRINGS } from "@/lib/strings"
import Modal, { ModalCloseButton } from "./Modal"
import styles from "./AddEventModal.module.css"

interface AddEventModalProps {
  form: EventFormState
  categoryOptions: CategoryOption[]
  attendeeOptions: AttendeeOption[]
  onTitleChange: (value: string) => void
  onCategorySelect: (key: CategoryKey) => void
  onDateChange: (value: string) => void
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onLocationChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onAttendeeToggle: (id: string) => void
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export default function AddEventModal({
  form,
  categoryOptions,
  attendeeOptions,
  onTitleChange,
  onCategorySelect,
  onDateChange,
  onStartChange,
  onEndChange,
  onLocationChange,
  onDescriptionChange,
  onAttendeeToggle,
  onSubmit,
  onClose,
}: AddEventModalProps) {
  const t = STRINGS.addEventModal

  return (
    <Modal
      onClose={onClose}
      maxWidth={480}
      maxHeight="88vh"
      zIndex={100}
      closeLabel={t.close}
    >
      <div className={styles.headerRow}>
        <div className={styles.title}>{t.title}</div>
        <ModalCloseButton onClick={onClose} label={t.close} />
      </div>

      <form onSubmit={onSubmit}>
        <label className={styles.label} htmlFor="event-title">
          {t.titleLabel}
        </label>
        <input
          id="event-title"
          type="text"
          value={form.title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder={t.titlePlaceholder}
          className={styles.textInput}
        />

        <label className={styles.labelSpaced}>{t.categoryLabel}</label>
        <div className={styles.pillRow}>
          {categoryOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onCategorySelect(opt.key)}
              className={styles.pill}
              style={{
                background: opt.bg,
                borderColor: opt.border,
                color: opt.textColor,
              }}
            >
              <span
                className={styles.pillDot}
                style={{ background: opt.dot }}
              />
              {opt.label}
            </button>
          ))}
        </div>

        <div className={styles.dateTimeRow}>
          <div className={styles.dateTimeCol}>
            <label className={styles.label} htmlFor="event-date">
              {t.dateLabel}
            </label>
            <input
              id="event-date"
              type="date"
              value={form.date}
              onChange={(e) => onDateChange(e.target.value)}
              className={styles.dateTimeInput}
            />
          </div>
          <div className={styles.dateTimeCol}>
            <label className={styles.label} htmlFor="event-start">
              {t.startLabel}
            </label>
            <input
              id="event-start"
              type="time"
              value={form.startTime}
              onChange={(e) => onStartChange(e.target.value)}
              className={styles.dateTimeInput}
            />
          </div>
          <div className={styles.dateTimeCol}>
            <label className={styles.label} htmlFor="event-end">
              {t.endLabel}
            </label>
            <input
              id="event-end"
              type="time"
              value={form.endTime}
              onChange={(e) => onEndChange(e.target.value)}
              className={styles.dateTimeInput}
            />
          </div>
        </div>

        <label className={styles.label} htmlFor="event-location">
          {t.locationLabel}
        </label>
        <input
          id="event-location"
          type="text"
          value={form.location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder={t.locationPlaceholder}
          className={styles.textInput}
        />

        <label className={styles.label} htmlFor="event-description">
          {t.descriptionLabel}
        </label>
        <textarea
          id="event-description"
          value={form.description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t.descriptionPlaceholder}
          rows={3}
          className={styles.textarea}
        />

        <label className={styles.labelSpaced}>{t.attendeesLabel}</label>
        <div className={styles.attendeeRow}>
          {attendeeOptions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onAttendeeToggle(a.id)}
              className={styles.attendeePill}
              style={{
                background: a.bg,
                borderColor: a.border,
                color: a.textColor,
              }}
            >
              <span className={styles.attendeeAvatar}>{a.initials}</span>
              {a.name}
            </button>
          ))}
        </div>

        {form.error && <div className={styles.error}>{form.error}</div>}

        <div className={styles.buttonRow}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelButton}
          >
            {t.cancel}
          </button>
          <button type="submit" className={styles.submitButton}>
            {t.submit}
          </button>
        </div>
      </form>
    </Modal>
  )
}
