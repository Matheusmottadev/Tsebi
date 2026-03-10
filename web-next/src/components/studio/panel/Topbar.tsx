"use client";

import { Bell } from "lucide-react";
import styles from "./Topbar.module.css";

type TopbarProps = {
  title: string;
  onNewProduct: () => void;
};

export function Topbar({ title, onNewProduct }: TopbarProps) {
  const formattedDate = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <header className={styles.topbar}>
      <div>
        <h2>{title}</h2>
        <p>{formattedDate}</p>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.bellBtn} aria-label="Notificações">
          <Bell size={16} strokeWidth={1.7} aria-hidden="true" />
          <span className={styles.dot} aria-hidden="true" />
        </button>
        <button type="button" className={styles.newBtn} onClick={onNewProduct}>
          + Novo Produto
        </button>
      </div>
    </header>
  );
}

