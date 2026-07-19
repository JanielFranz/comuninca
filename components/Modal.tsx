import type { CSSProperties, MouseEvent, ReactNode } from "react";
import styles from "./Modal.module.css";

interface ModalProps {
  onClose: () => void;
  maxWidth: number;
  maxHeight?: string;
  zIndex?: number;
  closeLabel: string;
  children: ReactNode;
}

export default function Modal({
  onClose,
  maxWidth,
  maxHeight = "88vh",
  zIndex = 100,
  closeLabel,
  children,
}: ModalProps) {
  function stopPropagation(e: MouseEvent) {
    e.stopPropagation();
  }

  const overlayStyle: CSSProperties = { zIndex };
  const panelStyle: CSSProperties = { maxWidth, maxHeight };

  return (
    <div className={styles.overlay} style={overlayStyle} onClick={onClose}>
      <div className={styles.panel} style={panelStyle} onClick={stopPropagation}>
        {children}
      </div>
    </div>
  );
}

export function ModalCloseButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={styles.closeButton}
    >
      ✕
    </button>
  );
}
