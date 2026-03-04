"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PublicUser } from "@/types";
import { StudioLogoutButton } from "./StudioLogoutButton";
import styles from "./StudioShell.module.css";

type StudioShellProps = {
  admin: PublicUser;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function StudioShell({ admin, title, subtitle, children }: StudioShellProps) {
  const pathname = usePathname();

  const tabs = [
    { href: "/studio", label: "Inicio" },
    { href: "/studio/users", label: "Usuarios" },
    { href: "/studio/orders", label: "Pedidos" },
    { href: "/studio/products", label: "Produtos" },
    { href: "/studio/vip", label: "Lista VIP" },
    { href: "/studio/newsletter", label: "Newsletter" },
    { href: "/studio/coupons", label: "Cupons" },
    { href: "/studio/audit", label: "Auditoria" },
  ];

  const initials = String(admin.name || "AD")
    .split(" ")
    .map((part) => part.trim().charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.brandBlock} aria-label="Studio Tsebi">
          <h1>Studio Tsebi</h1>
        </div>

        <nav className={styles.tabs} aria-label="Studio secoes">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href || (tab.href !== "/studio" && pathname.startsWith(`${tab.href}/`));
            return (
              <Link key={tab.href} href={tab.href} className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}>
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.headActions}>
          <span className={styles.avatar} title={admin.email}>
            {initials || "AD"}
          </span>
          <StudioLogoutButton />
        </div>
      </header>

      <main className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </header>
        <section className={styles.content}>{children}</section>
      </main>
    </div>
  );
}
