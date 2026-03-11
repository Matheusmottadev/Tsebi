"use client";

import { useEffect } from "react";
import styles from "./ConfirmModal.module.css";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  isOpen,
  title,
  text,
  onConfirm,
  onCancel,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <button className={styles.backdrop} type="button" onClick={onCancel} aria-label="Fechar" />
      <div className={styles.modal}>
        <h3 className={styles.modalTitle}>{title}</h3>
        <p className={styles.modalText}>{text}</p>
        <div className={styles.modalFooter}>
          <button type="button" className={styles.btnCancel} onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${styles.btnConfirm} ${danger ? styles.btnDanger : ""}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
