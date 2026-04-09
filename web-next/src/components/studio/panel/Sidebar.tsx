"use client";

import {
  Bell,
  BriefcaseBusiness,
  FileText,
  Gift,
  LayoutGrid,
  Mail,
  MessageCircle,
  Package,
  ReceiptText,
  Settings2,
  ShoppingBag,
  Star,
  Tag,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminPageKey } from "./types";
import { useAdminAccess, useAdminPermission } from "./access-control";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  activePage: AdminPageKey;
  onChangePage: (page: AdminPageKey) => void;
  pendingOrders: number;
  openCare: number;
  pendingRepairs: number;
};

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  pageKey?: AdminPageKey;
  href?: string;
  badge?: number;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export function Sidebar({ activePage, onChangePage, pendingOrders, openCare, pendingRepairs }: SidebarProps) {
  const pathname = usePathname();
  const access = useAdminAccess();
  const canOrders = useAdminPermission("orders");
  const canUsers = useAdminPermission("users");
  const canBalance = useAdminPermission("balance");
  const canProducts = useAdminPermission("products");
  const isDirectoria = access?.role === "director" || access?.role === "superadmin";
  const groups: NavGroup[] = [
    {
      label: "Geral",
      items: [
        { key: "inicio", pageKey: "inicio", label: "Início", icon: LayoutGrid },
        ...(canOrders ? [{ key: "pedidos", pageKey: "pedidos" as const, label: "Pedidos", icon: Package, badge: pendingOrders }] : []),
        ...(canProducts ? [{ key: "produtos", pageKey: "produtos" as const, label: "Produtos", icon: ShoppingBag }] : []),
        ...(canUsers ? [{ key: "usuarios", pageKey: "usuarios" as const, label: "Usuários", icon: Users }] : []),
      ],
    },
    {
      label: "Relacionamento",
      items: [
        { key: "atendimentos", pageKey: "atendimentos", label: "Atendimentos", icon: MessageCircle, badge: openCare },
        { key: "reparos", pageKey: "reparos", label: "Reparos", icon: Wrench, badge: pendingRepairs },
        { key: "lista_vip", pageKey: "lista_vip", label: "Lista VIP", icon: Star },
        { key: "newsletter", pageKey: "newsletter", label: "Newsletter", icon: Mail },
      ],
    },
    {
      label: "Comercial",
      items: [
        { key: "cupons", pageKey: "cupons", label: "Cupons", icon: Tag },
        { key: "gift_cards", pageKey: "gift_cards", label: "Gift Cards", icon: Gift },
        ...(canBalance ? [{ key: "saldo_clientes", pageKey: "saldo_clientes" as const, label: "Saldo de Clientes", icon: BriefcaseBusiness }] : []),
        ...(isDirectoria ? [{ key: "auditoria", pageKey: "auditoria" as const, label: "Auditoria", icon: FileText }] : []),
        { key: "notificacoes", pageKey: "notificacoes", label: "Notificações", icon: Bell },
      ],
    },
    {
      label: "Fiscal",
      items: [
        { key: "nfse-link", href: "/admin/nfse", label: "Notas Fiscais", icon: ReceiptText },
        { key: "nfse-config-link", href: "/admin/nfse/configuracoes", label: "Configurações", icon: Settings2 },
      ],
    },
    ...(isDirectoria
      ? [
          {
            label: "Diretoria",
            items: [{ key: "diretoria", pageKey: "diretoria" as const, label: "Diretoria", icon: BriefcaseBusiness }],
          },
        ]
      : []),
  ];

  return (
    <aside
      className={styles.sidebar}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        bottom: 0,
        width: 220,
        minWidth: 220,
        background: "#111",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #1a1a1a",
        overflowX: "hidden",
        zIndex: 80,
      }}
    >
      <div className={styles.logoBlock} style={{ padding: "36px 28px 28px", borderBottom: "1px solid #2a2a2a" }}>
        <h1>TSEBI</h1>
        <p>Painel Administrativo</p>
      </div>

      <nav
        className={styles.nav}
        aria-label="Navegação do painel"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 0,
          marginTop: 0,
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "8px 0",
        }}
      >
        {groups.map((group) => (
          <div key={group.label} className={styles.group} style={{ display: "flex", flexDirection: "column" }}>
            <p className={styles.groupLabel} style={{ margin: 0, padding: "12px 28px 6px", fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", color: "#444", fontWeight: 300 }}>
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = item.href
                ? pathname === item.href || pathname.startsWith(`${item.href}/`)
                : activePage === item.pageKey;
              const sharedStyle = {
                border: 0,
                borderLeft: isActive ? "2px solid #fff" : "2px solid transparent",
                background: isActive ? "#1a1a1a" : "transparent",
                padding: "11px 28px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                cursor: "pointer",
                color: isActive ? "#fff" : "#bbb",
                fontSize: 12,
                fontWeight: 300,
                letterSpacing: "0.05em",
                textAlign: "left" as const,
                textDecoration: "none",
              };

              if (item.href) {
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                    aria-current={isActive ? "page" : undefined}
                    style={sharedStyle}
                  >
                    <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              }

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                  onClick={() => item.pageKey && onChangePage(item.pageKey)}
                  aria-current={isActive ? "page" : undefined}
                  style={sharedStyle}
                >
                  <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span>{item.label}</span>
                  {typeof item.badge === "number" ? (
                    <span
                      className={styles.badge}
                      style={{
                        marginLeft: "auto",
                        background: "#fff",
                        color: "#111",
                        borderRadius: 100,
                        fontSize: 9,
                        fontWeight: 400,
                        padding: "2px 7px",
                        lineHeight: 1,
                      }}
                    >
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <footer
        className={styles.footer}
        style={{ borderTop: "1px solid #2a2a2a", padding: "20px 28px", display: "flex", alignItems: "center", gap: 10 }}
      >
        <span
          className={styles.avatar}
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "#2a2a2a",
            border: "1px solid #3a3a3a",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "#fff",
          }}
        >
          AD
        </span>
        <div>
          <strong style={{ display: "block", fontSize: 12, fontWeight: 300, color: "#fff" }}>Admin</strong>
          <small style={{ display: "block", marginTop: 2, fontSize: 10, fontWeight: 300, color: "#555" }}>Tsebi Brasil</small>
        </div>
      </footer>
    </aside>
  );
}
