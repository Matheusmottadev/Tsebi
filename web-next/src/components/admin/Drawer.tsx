"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onCancel?: () => void;
  onSave?: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  disableSave?: boolean;
}

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  onCancel,
  onSave,
  cancelLabel = "Cancelar",
  saveLabel = "Salvar",
  disableSave = false,
}: DrawerProps) {
  const openClass = isOpen ? styles.open : "";

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      <div className={`${styles.drawerOverlay} ${openClass}`} onClick={onClose} aria-hidden="true" />

      <aside
        className={`${styles.drawer} ${openClass}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
        aria-label={title}
      >
        <header className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} className={styles.closeBtn} aria-label="Fechar">
            <X size={20} strokeWidth={1.8} />
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        {footer ? (
          <div className={styles.drawerFooter}>{footer}</div>
        ) : (
          <footer className={styles.drawerFooter}>
            <button type="button" className={styles.btn} onClick={onCancel || onClose}>
              {cancelLabel}
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onSave} disabled={disableSave}>
              {saveLabel}
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}

