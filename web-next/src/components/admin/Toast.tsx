"use client";

import styles from "./Toast.module.css";

type ToastProps = {
  message: string;
  visible: boolean;
};

export function Toast({ message, visible }: ToastProps) {
  if (!message) return null;
  return <div className={`${styles.toast} ${visible ? styles.toastVisible : ""}`}>{message}</div>;
}

