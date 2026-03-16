"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";

interface Props {
  children: React.ReactNode;
  resultsCount?: number;
  clearHref?: string;
}

export function ProductsMobileFilterPanel({ children, resultsCount, clearHref }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 1000);
  }, []);

  const open = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setIsClosing(false);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className={styles.productsToolbarFilterBtn}
        onClick={open}
        aria-label="Abrir filtros"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.productsToolbarFilterIcon}>
          <path d="M4 7h16" />
          <circle cx="9" cy="7" r="1.8" />
          <path d="M4 12h16" />
          <circle cx="15" cy="12" r="1.8" />
          <path d="M4 17h16" />
          <circle cx="11.5" cy="17" r="1.8" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`${styles.mobileFilterOverlay} ${isClosing ? styles.mobileFilterOverlayClosing : ""}`}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Filtros"
        >
          <div
            className={`${styles.mobileFilterPanel} ${isClosing ? styles.mobileFilterPanelClosing : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.mobileFilterHeader}>
              <span className={styles.mobileFilterTitle}>Filtros</span>
              <div className={styles.mobileFilterHeaderActions}>
                {clearHref && (
                  <a href={clearHref} className={styles.mobileFilterClear} onClick={close}>
                    Limpar tudo
                  </a>
                )}
                <button
                  type="button"
                  className={styles.mobileFilterClose}
                  onClick={close}
                  aria-label="Fechar filtros"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className={styles.mobileFilterBody}>{children}</div>

            {resultsCount !== undefined && (
              <div className={styles.mobileFilterFooter}>
                <button
                  type="button"
                  className={styles.mobileFilterApply}
                  onClick={close}
                >
                  Ver {resultsCount} {resultsCount === 1 ? "peça" : "peças"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
