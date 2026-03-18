"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./HelpCenterTabs.module.css";

type HelpCenterTab = "help" | "faq" | "delivery" | "care";

type HelpCenterTabsProps = {
  activeTab: HelpCenterTab;
  onTabChange: (tab: HelpCenterTab) => void;
};

const LINKS: Array<{ id: HelpCenterTab; label: string }> = [
  { id: "help", label: "Precisa de ajuda?" },
  { id: "faq", label: "Perguntas Frequentes" },
  { id: "delivery", label: "Entrega e Devoluções" },
  { id: "care", label: "Cuidados e Reparos" },
];

export function HelpCenterTabs({ activeTab, onTabChange }: HelpCenterTabsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  const activeLabel = LINKS.find((l) => l.id === activeTab)?.label ?? LINKS[0].label;

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  return (
    <section className={styles.tabsBar} ref={barRef} aria-label="Navegacao de ajuda">

      {/* ── DESKTOP: horizontal tab bar (original) ── */}
      <div className={styles.desktopBar}>
        <p className={styles.desktopTitle}>Frequently Asked Questions</p>
        <nav className={styles.desktopLinks} aria-label="Secoes de ajuda">
          <ul className={styles.desktopLinksList}>
            {LINKS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.desktopLink} ${activeTab === item.id ? styles.desktopLinkActive : ""}`}
                  onClick={() => onTabChange(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* ── MOBILE: active label + Menu dropdown ── */}
      <div className={styles.bar}>
        <p className={styles.title}>{activeLabel}</p>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setIsOpen((o) => !o)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          Menu
          <svg
            className={`${styles.menuChevron} ${isOpen ? styles.menuChevronOpen : ""}`}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <nav
        className={`${styles.dropdown} ${isOpen ? styles.dropdownOpen : ""}`}
        aria-label="Secoes de ajuda"
        aria-hidden={!isOpen}
      >
        <ul className={styles.dropdownList} role="listbox">
          {LINKS.map((item) => (
            <li
              key={item.id}
              className={activeTab === item.id ? styles.activeItem : ""}
              role="option"
              aria-selected={activeTab === item.id}
            >
              <button
                type="button"
                className={`${styles.dropdownLink} ${activeTab === item.id ? styles.dropdownLinkActive : ""}`}
                tabIndex={isOpen ? 0 : -1}
                onClick={() => {
                  onTabChange(item.id);
                  setIsOpen(false);
                }}
              >
                <span className={styles.dropdownLinkText}>{item.label}</span>
                {activeTab === item.id && (
                  <span className={styles.dropdownCheck} aria-hidden="true">✓</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

export type { HelpCenterTab };
