"use client"

import { useEffect } from "react"
import Image from "next/image"
import type { ActiveEventView } from "@/lib/types"
import { STRINGS } from "@/lib/strings"
import { isValidGroupUrl, isValidMeetingUrl } from "@/lib/validation/events"
import Modal, { ModalCloseButton } from "./Modal"
import styles from "./EventDetailModal.module.css"

interface EventDetailModalProps {
  event: ActiveEventView
  onToggleJoin: () => void
  onClose: () => void
  /** True while a join/leave request is in flight; disables the button. */
  isJoinPending: boolean
  /** es-PE message when the last join/leave attempt failed; "" when none. */
  joinError: string
}

export default function EventDetailModal({
  event,
  onToggleJoin,
  onClose,
  isJoinPending,
  joinError,
}: EventDetailModalProps) {
  const t = STRINGS.eventDetailModal

  // Esc-to-close (AC 3.4.3): local to this modal only — the shared `Modal`
  // component has no key handling of its own, and this feature deliberately
  // does not change it (every other modal keeps its current behavior).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  // Defense in depth (per feature #15's review): re-validate the stored
  // meeting URL before ever rendering it as a link, even though `createEvent`
  // already validated it at write time. Narrowed to a single `string | null`
  // so the JSX below never needs a type assertion.
  const meetingLink =
    event.modality === "VIRTUAL" &&
    event.meetingUrl !== null &&
    isValidMeetingUrl(event.meetingUrl)
      ? event.meetingUrl
      : null
  // Same defense in depth for the group link. It is only ever non-null for
  // the host and the people who joined (server + `buildActiveEvent`), so
  // showing it whenever it is present is what reveals it after "Unirme".
  const groupLink =
    event.groupUrl !== null && isValidGroupUrl(event.groupUrl)
      ? event.groupUrl
      : null

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

      {event.pictureUrl && (
        <div className={styles.pictureWrap}>
          <Image
            src={event.pictureUrl}
            alt={t.eventPictureAlt(event.title)}
            fill
            sizes="(max-width: 440px) 100vw, 440px"
            className={styles.picture}
          />
        </div>
      )}

      <div className={styles.title}>{event.title}</div>
      <div className={styles.metaLine}>
        {event.dateLabel} · {event.timeLabel}
      </div>
      {event.modality === "IN_PERSON" ? (
        <div className={styles.locationLine}>{event.location}</div>
      ) : (
        <div className={styles.locationLine}>
          {t.virtualLabel}
          {meetingLink && (
            <>
              {" · "}
              <a
                href={meetingLink}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.meetingLink}
              >
                {meetingLink}
              </a>
            </>
          )}
        </div>
      )}

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
        disabled={isJoinPending}
        className={styles.joinButton}
        style={{ background: event.joinBg, color: event.joinColor }}
      >
        {event.joinLabel}
      </button>
      {groupLink && (
        <div className={styles.groupSection}>
          <div className={styles.sectionLabel}>{t.groupLabel}</div>
          <a
            href={groupLink}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.groupLink}
          >
            {groupLink}
          </a>
        </div>
      )}
      {joinError && (
        <div className={styles.joinError} role="alert">
          {joinError}
        </div>
      )}
    </Modal>
  )
}
