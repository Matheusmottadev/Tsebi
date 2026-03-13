"use client";

import styles from "../account.module.css";
import type { AccountTab } from "./AccountShell";

const TABS: { key: AccountTab; label: string }[] = [
  { key: "overview", label: "Visão Geral" },
  { key: "profile", label: "Meu Perfil" },
  { key: "orders", label: "Meus Pedidos" },
  { key: "appointments", label: "Atendimentos Privados" },
  { key: "wishlist", label: "Lista de Desejos" },
  { key: "recommendations", label: "Recomendações" },
  { key: "repairs", label: "Serviços de Reparo" },
];

type Props = {
  activeTab: AccountTab;
  onNavigate: (tab: AccountTab) => void;
};

export function AccountNav({ activeTab, onNavigate }: Props) {
  return (
    <nav className={styles.nav} aria-label="Navegação da conta">
      <div className={styles.navInner}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`${styles.navTab} ${activeTab === key ? styles.navTabActive : ""}`}
            onClick={() => onNavigate(key)}
            aria-current={activeTab === key ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
