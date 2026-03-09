"use client";

import styles from "./HelpCenterTabs.module.css";

type HelpCenterTab = "help" | "faq" | "delivery" | "care";

type HelpCenterTabsProps = {
  activeTab: HelpCenterTab;
  onTabChange: (tab: HelpCenterTab) => void;
};

const LINKS: Array<{ id: HelpCenterTab; label: string }> = [
  { id: "help", label: "Precisa de ajuda?" },
  { id: "faq", label: "Perguntas Frequentes" },
  { id: "delivery", label: "Entrega e Devolucoes" },
  { id: "care", label: "Servicos de Cuidado" },
];

export function HelpCenterTabs({ activeTab, onTabChange }: HelpCenterTabsProps) {
  return (
    <section className={styles.tabsBar} aria-label="Navegacao de ajuda">
      <div className={styles.inner}>
        <p className={styles.title}>PRECISA DE AJUDA?</p>
        <nav className={styles.links} aria-label="Secoes de ajuda">
          <ul className={styles.linksList}>
            {LINKS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.link} ${activeTab === item.id ? styles.linkActive : ""}`}
                  onClick={() => onTabChange(item.id)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}

export type { HelpCenterTab };
