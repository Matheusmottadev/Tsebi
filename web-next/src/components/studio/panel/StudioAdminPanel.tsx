"use client";

import {
  FileText,
  Mail,
  MessageCircle,
  Package,
  ShoppingBag,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Cormorant_Garamond, Jost } from "next/font/google";
import { useMemo, useState } from "react";
import { PAGE_TITLES, RECENT_ORDERS } from "./data";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { AdminPageKey } from "./types";
import { InicioPage } from "./pages/InicioPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import styles from "./StudioAdminPanel.module.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-cormorant",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-jost",
});

const PLACEHOLDER_META: Record<Exclude<AdminPageKey, "inicio">, { icon: LucideIcon; subtitle: string }> = {
  pedidos: {
    icon: Package,
    subtitle: "Acompanhe status, pagamento e logística dos pedidos em um só fluxo.",
  },
  produtos: {
    icon: ShoppingBag,
    subtitle: "Gerencie catálogo, variações e estoque da coleção Tsebi.",
  },
  usuarios: {
    icon: Users,
    subtitle: "Visualize contas, segmentação e histórico dos clientes.",
  },
  atendimentos: {
    icon: MessageCircle,
    subtitle: "Central de solicitações privadas com prioridade de resposta.",
  },
  lista_vip: {
    icon: Star,
    subtitle: "Acompanhe membros VIP e ofertas exclusivas da base premium.",
  },
  newsletter: {
    icon: Mail,
    subtitle: "Planeje campanhas e monitore captação de inscritos.",
  },
  cupons: {
    icon: Tag,
    subtitle: "Crie e acompanhe incentivos comerciais por período e canal.",
  },
  auditoria: {
    icon: FileText,
    subtitle: "Rastreie alterações administrativas com visão cronológica.",
  },
};

export function StudioAdminPanel() {
  const [activePage, setActivePage] = useState<AdminPageKey>("inicio");

  const pendingOrders = useMemo(() => RECENT_ORDERS.filter((order) => order.status === "Pendente").length, []);
  const openCare = 6;

  const pageTitle = PAGE_TITLES[activePage];

  return (
    <div className={`${styles.app} ${cormorant.variable} ${jost.variable}`}>
      <Sidebar
        activePage={activePage}
        onChangePage={setActivePage}
        pendingOrders={pendingOrders}
        openCare={openCare}
      />

      <main className={styles.main}>
        <Topbar title={pageTitle} onNewProduct={() => setActivePage("produtos")} />

        <section className={styles.content}>
          {activePage === "inicio" ? (
            <InicioPage />
          ) : (
            <PlaceholderPage
              title={PAGE_TITLES[activePage]}
              subtitle={PLACEHOLDER_META[activePage].subtitle}
              icon={PLACEHOLDER_META[activePage].icon}
            />
          )}
        </section>
      </main>
    </div>
  );
}

