"use client";

import { Search } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import styles from "./Topbar.module.css";

type TopbarProps = {
  title: string;
  actionLabel: string;
  onAction: () => void;
  onOpenGlobalSearch: () => void;
  notificationsSlot?: ReactNode;
};

export function Topbar({ title, actionLabel, onAction, onOpenGlobalSearch, notificationsSlot }: TopbarProps) {
  const formattedDate = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      }).format(new Date()),
    []
  );

  return (
    <header
      className={styles.topbar}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "nowrap",
        width: "100%",
      }}
    >
      <div className={styles.topbarLeft} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <h2>{title}</h2>
        <p>{formattedDate}</p>
      </div>

      <div
        className={styles.topbarRight}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 20,
          marginLeft: "auto",
          whiteSpace: "nowrap",
        }}
      >
        <button type="button" className={styles.searchBtn} aria-label="Pesquisa global" onClick={onOpenGlobalSearch}>
          <Search size={16} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <div className={styles.bellBtn}>{notificationsSlot}</div>
        <button type="button" className={styles.newBtn} onClick={onAction}>
          {actionLabel}
        </button>
      </div>
    </header>
  );
}
