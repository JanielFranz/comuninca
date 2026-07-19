import type { MouseEvent } from "react";
import { STRINGS } from "@/lib/strings";
import styles from "./ProfileMenu.module.css";

interface ProfileMenuProps {
  userName: string;
  userEmail: string;
  onLogout: () => void;
  onClose: () => void;
}

export default function ProfileMenu({
  userName,
  userEmail,
  onLogout,
  onClose,
}: ProfileMenuProps) {
  function stopPropagation(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dropdown} onClick={stopPropagation}>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{userName}</div>
          <div className={styles.userEmail}>{userEmail}</div>
        </div>
        <button type="button" onClick={onLogout} className={styles.logoutButton}>
          {STRINGS.profileMenu.logout}
        </button>
      </div>
    </div>
  );
}
