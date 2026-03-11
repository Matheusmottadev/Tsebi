"use client";

import {
  FileText,
  LayoutGrid,
  Mail,
  MessageCircle,
  Package,
  ShoppingBag,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AdminPageKey } from "./types";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  activePage: AdminPageKey;
  onChangePage: (page: AdminPageKey) => void;
  pendingOrders: number;
  openCare: number;
};

type NavItem = {
  key: AdminPageKey;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

export function Sidebar({ activePage, onChangePage, pendingOrders, openCare }: SidebarProps) {
  const groups: NavGroup[] = [
    {
      label: "Geral",
      items: [
        { key: "inicio", label: "Início", icon: LayoutGrid },
        { key: "pedidos", label: "Pedidos", icon: Package, badge: pendingOrders },
        { key: "produtos", label: "Produtos", icon: ShoppingBag },
        { key: "usuarios", label: "Usuários", icon: Users },
      ],
    },
    {
      label: "Relacionamento",
      items: [
        { key: "atendimentos", label: "Atendimentos", icon: MessageCircle, badge: openCare },
        { key: "lista_vip", label: "Lista VIP", icon: Star },
        { key: "newsletter", label: "Newsletter", icon: Mail },
      ],
    },
    {
      label: "Comercial",
      items: [
        { key: "cupons", label: "Cupons", icon: Tag },
        { key: "auditoria", label: "Auditoria", icon: FileText },
      ],
    },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoBlock}>
        <h1>TSEBI</h1>
        <p>Painel Administrativo</p>
      </div>

      <nav className={styles.nav} aria-label="Navegação do painel">
        {groups.map((group) => (
          <div key={group.label} className={styles.group}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.navItem} ${isActive ? styles.active : ""}`}
                  onClick={() => onChangePage(item.key)}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={14} strokeWidth={1.6} aria-hidden="true" />
                  <span>{item.label}</span>
                  {typeof item.badge === "number" ? <span className={styles.badge}>{item.badge}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <footer className={styles.footer}>
        <span className={styles.avatar}>AD</span>
        <div>
          <strong>Admin</strong>
          <small>Tsebi Brasil</small>
        </div>
      </footer>
    </aside>
  );
}

