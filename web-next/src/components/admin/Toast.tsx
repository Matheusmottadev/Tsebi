"use client";

import styles from "./Toast.module.css";

type ToastProps = {
  message: string;
  visible: boolean;
};

export function Toast({ message, visible }: ToastProps) {
  if (!message || !visible) return null;
  return (
    <div role="status" aria-live="polite" className={`${styles.toast} ${styles.toastVisible}`}>
      {message}
    </div>
  );
}
