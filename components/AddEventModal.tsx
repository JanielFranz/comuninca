import { useRef } from "react"
import type { FormEvent } from "react"
import type {
  CategoryKey,
  CategoryOption,
  EventFormState,
  EventModality,
} from "@/lib/types"
import { STRINGS } from "@/lib/strings"
import Modal, { ModalCloseButton } from "./Modal"
import styles from "./AddEventModal.module.css"

interface AddEventModalProps {
  form: EventFormState
  categoryOptions: CategoryOption[]
  isPending: boolean
  onTitleChange: (value: string) => void
  onCategorySelect: (key: CategoryKey) => void
  onDateChange: (value: string) => void
  onStartChange: (value: string) => void
  onEndChange: (value: string) => void
  onModalityChange: (value: EventModality) => void
  onLocationChange: (value: string) => void
  onGroupUrlChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  /** A picture was selected (resize/validation runs immediately); null clears it. */
  onPictureSelect: (file: File | null) => void
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

export default function AddEventModal({
  form,
  categoryOptions,
  isPending,
  onTitleChange,
  onCategorySelect,
  onDateChange,
  onStartChange,
  onEndChange,
  onModalityChange,
  onLocationChange,
  onGroupUrlChange,
  onDescriptionChange,
  onPictureSelect,
  onSubmit,
  onClose,
}: AddEventModalProps) {
  const t = STRINGS.addEventModal
  const isVirtual = form.modality === "VIRTUAL"
  const modalities: { value: EventModality; label: string }[] = [
    { value: "IN_PERSON", label: t.modalityInPerson },
    { value: "VIRTUAL", label: t.modalityVirtual },
  ]
  const pictureBusy =
    form.pictureStatus === "processing" || form.pictureStatus === "error"
  const pictureInputRef = useRef<HTMLInputElement>(null)

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

      <form onSubmit={onSubmit} noValidate>
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

        <div id="event-modality-label" className={styles.labelSpaced}>
          {t.modalityLabel}
        </div>
        <div
          role="radiogroup"
          aria-labelledby="event-modality-label"
          className={styles.modalityRow}
        >
          {modalities.map((m) => (
            <label key={m.value} className={styles.modalityOption}>
              <input
                type="radio"
                name="event-modality"
                value={m.value}
                checked={form.modality === m.value}
                onChange={() => onModalityChange(m.value)}
                className={styles.modalityRadio}
              />
              <span className={styles.modalityText}>{m.label}</span>
            </label>
          ))}
        </div>

        <label className={styles.label} htmlFor="event-location">
          {isVirtual ? t.meetingUrlLabel : t.locationLabel}
        </label>
        <input
          id="event-location"
          type={isVirtual ? "url" : "text"}
          value={form.location}
          onChange={(e) => onLocationChange(e.target.value)}
          placeholder={
            isVirtual ? t.meetingUrlPlaceholder : t.locationPlaceholder
          }
          className={styles.textInput}
        />

        <label className={styles.label} htmlFor="event-group-url">
          {t.groupUrlLabel}
        </label>
        <input
          id="event-group-url"
          type="url"
          autoComplete="off"
          value={form.groupUrl}
          onChange={(e) => onGroupUrlChange(e.target.value)}
          placeholder={t.groupUrlPlaceholder}
          aria-describedby="event-group-url-hint"
          className={styles.textInputTight}
        />
        <div id="event-group-url-hint" className={styles.fieldHint}>
          {t.groupUrlHint}
        </div>

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

        <label className={styles.label} htmlFor="event-picture">
          {t.pictureLabel}
        </label>
        <input
          id="event-picture"
          ref={pictureInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onPictureSelect(e.target.files?.[0] ?? null)}
          disabled={form.pictureStatus === "processing"}
          className={styles.fileInput}
        />
        {form.pictureStatus === "processing" && (
          <div className={styles.pictureHint} role="status">
            {t.pictureProcessing}
          </div>
        )}
        {form.picturePreviewUrl && (
          <div className={styles.picturePreviewRow}>
            {/* Selected-file preview; not the final resized upload, so a
                plain <img> (not next/image) at a fixed-aspect-ratio box. */}
            <img
              src={form.picturePreviewUrl}
              alt=""
              className={styles.picturePreview}
            />
            <button
              type="button"
              onClick={() => {
                if (pictureInputRef.current) pictureInputRef.current.value = ""
                onPictureSelect(null)
              }}
              className={styles.pictureRemoveButton}
            >
              {t.pictureRemove}
            </button>
          </div>
        )}
        {form.pictureError && (
          <div className={styles.error} role="alert">
            {form.pictureError}
          </div>
        )}

        {form.error && (
          <div className={styles.error} role="alert">
            {form.error}
          </div>
        )}

        <div className={styles.buttonRow}>
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelButton}
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            className={styles.submitButton}
            disabled={isPending || pictureBusy}
            aria-busy={isPending}
          >
            {isPending ? t.submitting : t.submit}
          </button>
        </div>
      </form>
    </Modal>
  )
}
