"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./page.module.css";

interface SortLink {
  href: string;
  label: string;
  active: boolean;
}

interface Props {
  sortLinks: SortLink[];
}

export function ProductsMobileSortPanel({ sortLinks }: Props) {
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
        className={styles.productsToolbarSortBtn}
        onClick={open}
        aria-label="Ordenar produtos"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.productsToolbarSortIcon}>
          <line x1="2" y1="4.5" x2="16" y2="4.5" />
          <line x1="2" y1="9.5" x2="12" y2="9.5" />
          <line x1="2" y1="14.5" x2="8" y2="14.5" />
          <line x1="2" y1="19.5" x2="5" y2="19.5" />
          <path d="M18.5 2H21V13H23.5L19.75 22L16 13H18.5Z" style={{ fill: "#111", stroke: "none" }} />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`${styles.mobileFilterOverlay} ${isClosing ? styles.mobileFilterOverlayClosing : ""}`}
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Ordenar por"
        >
          <div
            className={`${styles.mobileFilterPanel} ${isClosing ? styles.mobileFilterPanelClosing : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.mobileFilterHeader}>
              <span className={styles.mobileFilterTitle}>Ordenar por</span>
              <button
                type="button"
                className={styles.mobileFilterClose}
                onClick={close}
                aria-label="Fechar ordenação"
              >
                ✕
              </button>
            </div>

            <div className={styles.mobileSortBody}>
              {sortLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`${styles.mobileSortOption} ${link.active ? styles.mobileSortOptionActive : ""}`}
                >
                  <span className={styles.mobileSortRadio}>
                    {link.active && <span className={styles.mobileSortRadioDot} />}
                  </span>
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
