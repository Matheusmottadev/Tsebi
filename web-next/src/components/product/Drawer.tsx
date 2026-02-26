"use client";

import { useEffect, useMemo, useRef } from "react";
import styles from "./ProductDrawer.module.css";

type DrawerProps = {
  open: boolean;
  title: string;
  productImage: string;
  productName: string;
  imageBaseUrl?: string;
  width?: "default" | "wide";
  onClose: () => void;
  children: React.ReactNode;
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Drawer({ open, title, width = "default", onClose, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastActiveElementRef = useRef<HTMLElement | null>(null);
  const labelledById = useMemo(() => `drawer-title-${title.toLowerCase().replace(/\s+/g, "-")}`, [title]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;

    lastActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const html = document.documentElement;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const previousHtmlOverflow = html.style.overflow;
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = "hidden";
    html.style.overflow = "hidden";
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;

    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusables?.[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      html.style.overflow = previousHtmlOverflow;
      lastActiveElementRef.current?.focus();
    };
  }, [open, onClose]);

  return (
    <div
      className={`${styles.overlay} ${open ? styles.open : ""}`}
      aria-hidden={!open}
      onClick={onClose}
      onWheelCapture={(event) => event.stopPropagation()}
      onTouchMoveCapture={(event) => event.stopPropagation()}
    >
      <aside
        ref={panelRef}
        className={`${styles.drawer} ${width === "wide" ? styles.drawerWide : ""} ${open ? styles.open : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledById}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.contentArea}>
          <header className={styles.header}>
            <h2 id={labelledById}>{title}</h2>
            <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Fechar painel">
              x
            </button>
          </header>
          <div className={styles.content}>{children}</div>
        </div>
      </aside>
    </div>
  );
}
