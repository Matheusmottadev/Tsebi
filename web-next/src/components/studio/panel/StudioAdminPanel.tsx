"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { HttpError } from "@/lib/http";
import {
  listAuditLogsAdmin,
  listCouponsAdmin,
  listNewsletterAdmin,
  listOrdersAdmin,
  listPrivateCareAdmin,
  listProductsAdmin,
  listUsersAdmin,
  listVipAdmin,
  studioAuthMe,
  type AdminOrderSummary,
} from "@/services/admin";
import { DrawerAuditoria } from "@/components/admin/DrawerAuditoria";
import { DrawerNewsletter } from "@/components/admin/DrawerNewsletter";
import { DrawerNovoAtendimento } from "@/components/admin/DrawerNovoAtendimento";
import { DrawerNovoCadastroVIP } from "@/components/admin/DrawerNovoCadastroVIP";
import { DrawerNovoCupom } from "@/components/admin/DrawerNovoCupom";
import { DrawerNovoPedido } from "@/components/admin/DrawerNovoPedido";
import { DrawerNovoProduto } from "@/components/admin/DrawerNovoProduto";
import { DrawerNovoUsuario } from "@/components/admin/DrawerNovoUsuario";
import { Toast } from "@/components/admin/Toast";
import { PAGE_TITLES } from "./data";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { ActivityItem, AdminPageKey, KpiData, RecentOrder } from "./types";
import { InicioPage } from "./pages/InicioPage";
import { ConnectedPage, type ConnectedPanelData } from "./pages/ConnectedPage";
import styles from "./StudioAdminPanel.module.css";

const EMPTY_CONNECTED_DATA: ConnectedPanelData = {
  orders: [],
  products: [],
  users: [],
  privateCare: [],
  vip: [],
  newsletter: [],
  coupons: [],
  audit: [],
};

function formatCurrency(amountCents: number, currency = "BRL", maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
    maximumFractionDigits,
  }).format((Number(amountCents || 0) || 0) / 100);
}

function formatCurrencyCompact(amountCents: number): string {
  const amount = (Number(amountCents || 0) || 0) / 100;
  if (amount >= 1000) {
    const rounded = Math.round((amount / 1000) * 10) / 10;
    return `R$ ${String(rounded).replace(/\.0$/, "")}k`;
  }
  return formatCurrency(amountCents, "BRL", 0);
}

function parseIsoDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function inMonth(date: Date | null, reference: Date): boolean {
  if (!date) return false;
  return date.getFullYear() === reference.getFullYear() && date.getMonth() === reference.getMonth();
}

function previousMonth(reference: Date): Date {
  return new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
}

function toDelta(current: number, previous: number): { delta: string; tone: "positive" | "negative" } {
  if (current === 0 && previous === 0) {
    return { delta: "↑ 0% vs mês anterior", tone: "positive" };
  }
  const ratio = previous <= 0 ? 100 : ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(ratio));
  const positive = ratio >= 0;
  return {
    delta: `${positive ? "↑" : "↓"} ${rounded}% vs mês anterior`,
    tone: positive ? "positive" : "negative",
  };
}

function toRecentOrderStatus(order: AdminOrderSummary): RecentOrder["status"] {
  const status = String(order.status || "").toLowerCase();
  const tracking = String(order.trackingStatus || "").toLowerCase();
  if (tracking.includes("shipped") || tracking.includes("transit") || tracking.includes("delivered")) {
    return "Enviado";
  }
  if (status === "paid") return "Pago";
  if (status === "pending_payment") return "Pendente";
  if (status === "canceled" || status === "failed" || status === "refunded") return "Cancelado";
  if (status === "processing") return "Enviado";
  return "Pendente";
}

function toRecentOrderLabel(order: AdminOrderSummary): string {
  const raw = String(order.id || "").trim();
  if (!raw) return "-";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function toRecentOrderProduct(order: AdminOrderSummary): string {
  const service = String(order.shippingSelectedService || "").trim();
  const carrier = String(order.shippingSelectedCarrierName || order.carrier || "").trim();
  if (service && carrier) return `${service} — ${carrier}`;
  if (service) return service;
  if (carrier) return carrier;
  return "Produto do pedido";
}

function toRelativeTime(value: string | null): string {
  const date = parseIsoDate(value);
  if (!date) return "agora";
  const diffMs = date.getTime() - Date.now();
  const diffMin = Math.round(diffMs / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHours = Math.round(diffMin / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function buildDashboardKpis(data: ConnectedPanelData): KpiData[] {
  const now = new Date();
  const prev = previousMonth(now);

  const thisMonthOrders = data.orders.filter((order) => inMonth(parseIsoDate(order.createdAt), now));
  const prevMonthOrders = data.orders.filter((order) => inMonth(parseIsoDate(order.createdAt), prev));

  const payableStatuses = new Set(["paid", "processing"]);
  const thisRevenue = thisMonthOrders
    .filter((order) => payableStatuses.has(String(order.status || "").toLowerCase()))
    .reduce((sum, order) => sum + Number(order.amount || 0), 0);
  const prevRevenue = prevMonthOrders
    .filter((order) => payableStatuses.has(String(order.status || "").toLowerCase()))
    .reduce((sum, order) => sum + Number(order.amount || 0), 0);

  const thisOrdersCount = thisMonthOrders.length;
  const prevOrdersCount = prevMonthOrders.length;

  const thisTicket = thisOrdersCount > 0 ? thisRevenue / thisOrdersCount : 0;
  const prevTicket = prevOrdersCount > 0 ? prevRevenue / prevOrdersCount : 0;

  const thisUsersCount = data.users.filter((user) => inMonth(parseIsoDate(user.createdAt), now)).length;
  const prevUsersCount = data.users.filter((user) => inMonth(parseIsoDate(user.createdAt), prev)).length;

  const receitaDelta = toDelta(thisRevenue, prevRevenue);
  const pedidosDelta = toDelta(thisOrdersCount, prevOrdersCount);
  const ticketDelta = toDelta(thisTicket, prevTicket);
  const clientesDelta = toDelta(thisUsersCount, prevUsersCount);

  return [
    {
      id: "receita",
      label: "RECEITA DO MÊS",
      value: formatCurrencyCompact(thisRevenue),
      delta: receitaDelta.delta,
      tone: receitaDelta.tone,
    },
    {
      id: "pedidos",
      label: "PEDIDOS",
      value: String(thisOrdersCount),
      delta: pedidosDelta.delta,
      tone: pedidosDelta.tone,
    },
    {
      id: "ticket",
      label: "TICKET MÉDIO",
      value: formatCurrency(Math.round(thisTicket), "BRL", 0),
      delta: ticketDelta.delta,
      tone: ticketDelta.tone,
    },
    {
      id: "clientes",
      label: "NOVOS CLIENTES",
      value: String(thisUsersCount),
      delta: clientesDelta.delta,
      tone: clientesDelta.tone,
    },
  ];
}

function buildRecentOrders(data: ConnectedPanelData): RecentOrder[] {
  return [...data.orders]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5)
    .map((order) => ({
      id: toRecentOrderLabel(order),
      cliente: order.userName || order.userEmail || "Cliente",
      produto: toRecentOrderProduct(order),
      valor: formatCurrency(order.amount, order.currency, 0),
      status: toRecentOrderStatus(order),
    }));
}

function buildActivityItems(data: ConnectedPanelData): ActivityItem[] {
  const fromAudit = [...data.audit]
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 5)
    .map((log, index) => ({
      id: log.id || `audit-${index}`,
      text: log.summary || `${log.action} em ${log.entityType}`,
      time: toRelativeTime(log.createdAt),
      important: ["CREATE", "UPDATE", "DELETE"].includes(String(log.action || "").toUpperCase()),
    }));

  if (fromAudit.length > 0) return fromAudit;

  return buildRecentOrders(data).map((order, index) => ({
    id: `order-${index}-${order.id}`,
    text: `Pedido ${order.id} de ${order.cliente}`,
    time: "recente",
    important: index < 2,
  }));
}

const OPEN_ORDER_STATUSES = new Set([
  "pending",
  "pending_payment",
  "payment_pending",
  "awaiting_payment",
  "processing",
  "in_progress",
  "paid",
  "approved",
  "pendente",
  "aguardando_pagamento",
  "em_andamento",
]);

const CLOSED_CARE_STATUSES = new Set([
  "completed",
  "closed",
  "resolved",
  "declined",
  "canceled",
  "cancelled",
  "cancelado",
  "recusado",
  "concluido",
  "concluído",
  "finalizado",
]);

const TOPBAR_BUTTONS: Record<AdminPageKey, { label: string }> = {
  inicio: { label: "Sair" },
  pedidos: { label: "+ Novo Pedido" },
  produtos: { label: "+ Novo Produto" },
  usuarios: { label: "+ Novo Usuário" },
  atendimentos: { label: "+ Novo Atendimento" },
  lista_vip: { label: "+ Novo Cadastro" },
  newsletter: { label: "Editar" },
  cupons: { label: "+ Novo Cupom" },
  auditoria: { label: "Exportar" },
};

export function StudioAdminPanel() {
  const router = useRouter();
  const [activePage, setActivePage] = useState<AdminPageKey>("inicio");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectedData, setConnectedData] = useState<ConnectedPanelData>(EMPTY_CONNECTED_DATA);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openDrawer = (name: string) => setActiveDrawer(name);
  const closeDrawer = () => setActiveDrawer(null);

  useEffect(() => {
    setActiveDrawer(null);
  }, [activePage]);

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      toastTimerRef.current = null;
    }, 3000);
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    async function loadConnectedData() {
      setIsLoading(true);
      setErrorMessage("");

      const results = await Promise.allSettled([
        studioAuthMe({ cache: "no-store" }),
        listOrdersAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listProductsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listUsersAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listPrivateCareAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listVipAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listNewsletterAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listCouponsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listAuditLogsAdmin({ limit: 200, offset: 0 }, { cache: "no-store" }),
      ]);

      if (cancelled) return;

      const next: ConnectedPanelData = {
        orders: [],
        products: [],
        users: [],
        privateCare: [],
        vip: [],
        newsletter: [],
        coupons: [],
        audit: [],
      };
      const failures: string[] = [];

      const authResult = results[0];
      if (authResult.status === "fulfilled") {
        if (!authResult.value.authenticated) {
          failures.push("Sessão admin não autenticada. Faça login em /admin/login.");
        }
      } else if (authResult.reason instanceof HttpError) {
        if (authResult.reason.status === 401 || authResult.reason.status === 403) {
          failures.push("Sessão admin expirada. Faça login em /admin/login.");
        } else {
          failures.push("Falha ao validar sessão admin.");
        }
      } else {
        failures.push("Falha ao validar sessão admin.");
      }

      const ordersResult = results[1];
      if (ordersResult.status === "fulfilled") {
        next.orders = Array.isArray(ordersResult.value.orders) ? ordersResult.value.orders : [];
      } else {
        failures.push("Pedidos indisponíveis");
      }

      const productsResult = results[2];
      if (productsResult.status === "fulfilled") {
        next.products = Array.isArray(productsResult.value.rows) ? productsResult.value.rows : [];
      } else {
        failures.push("Produtos indisponíveis");
      }

      const usersResult = results[3];
      if (usersResult.status === "fulfilled") {
        next.users = Array.isArray(usersResult.value.users) ? usersResult.value.users : [];
      } else {
        failures.push("Usuários indisponíveis");
      }

      const privateCareResult = results[4];
      if (privateCareResult.status === "fulfilled") {
        next.privateCare = Array.isArray(privateCareResult.value.rows) ? privateCareResult.value.rows : [];
      } else {
        failures.push("Atendimentos indisponíveis");
      }

      const vipResult = results[5];
      if (vipResult.status === "fulfilled") {
        next.vip = Array.isArray(vipResult.value.rows) ? vipResult.value.rows : [];
      } else {
        failures.push("Lista VIP indisponível");
      }

      const newsletterResult = results[6];
      if (newsletterResult.status === "fulfilled") {
        next.newsletter = Array.isArray(newsletterResult.value.rows) ? newsletterResult.value.rows : [];
      } else {
        failures.push("Newsletter indisponível");
      }

      const couponsResult = results[7];
      if (couponsResult.status === "fulfilled") {
        next.coupons = Array.isArray(couponsResult.value.rows) ? couponsResult.value.rows : [];
      } else {
        failures.push("Cupons indisponíveis");
      }

      const auditResult = results[8];
      if (auditResult.status === "fulfilled") {
        next.audit = Array.isArray(auditResult.value.logs) ? auditResult.value.logs : [];
      } else {
        failures.push("Auditoria indisponível");
      }

      setConnectedData(next);
      setErrorMessage(failures.length > 0 ? failures.join(". ") : "");
      setIsLoading(false);
    }

    loadConnectedData();
    return () => {
      cancelled = true;
    };
  }, [refreshIndex]);

  const pendingOrders = useMemo(() => {
    const openCount = connectedData.orders.filter((order) => {
      const status = String(order.status || "").trim().toLowerCase();
      return OPEN_ORDER_STATUSES.has(status);
    }).length;
    if (openCount > 0) return openCount;
    return connectedData.orders.length;
  }, [connectedData.orders]);

  const openCare = useMemo(() => {
    const openCount = connectedData.privateCare.filter((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      return !CLOSED_CARE_STATUSES.has(status);
    }).length;
    if (openCount > 0) return openCount;
    return connectedData.privateCare.length;
  }, [connectedData.privateCare]);

  const kpis = useMemo(() => buildDashboardKpis(connectedData), [connectedData]);
  const recentOrders = useMemo(() => buildRecentOrders(connectedData), [connectedData]);
  const activity = useMemo(() => buildActivityItems(connectedData), [connectedData]);

  const topbarConfig = TOPBAR_BUTTONS[activePage];
  const pageTitle = PAGE_TITLES[activePage];
  const topbarActionLabel = topbarConfig.label;

  const handleTopbarButton = () => {
    if (activePage === "inicio") {
      router.push("/admin/login");
      return;
    }
    openDrawer(activePage);
  };

  function handleSaved(shouldReload: boolean) {
    if (shouldReload) {
      setRefreshIndex((current) => current + 1);
    }
    showToast("Salvo com sucesso");
  }

  return (
    <div className={styles.app}>
      <Sidebar activePage={activePage} onChangePage={setActivePage} pendingOrders={pendingOrders} openCare={openCare} />

      <main className={styles.main}>
        <Topbar title={pageTitle} actionLabel={topbarActionLabel} onAction={handleTopbarButton} />

        <section className={styles.content}>
          {activePage === "inicio" ? (
            <InicioPage
              kpis={kpis}
              recentOrders={recentOrders}
              activities={activity}
              loading={isLoading}
              errorMessage={errorMessage}
              onViewAllOrders={() => setActivePage("pedidos")}
            />
          ) : (
            <ConnectedPage page={activePage} data={connectedData} loading={isLoading} errorMessage={errorMessage} />
          )}
        </section>
      </main>

      {activeDrawer === "pedidos" ? (
        <DrawerNovoPedido isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(false)} />
      ) : null}
      {activeDrawer === "produtos" ? (
        <DrawerNovoProduto isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
      {activeDrawer === "usuarios" ? (
        <DrawerNovoUsuario isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
      {activeDrawer === "atendimentos" ? <DrawerNovoAtendimento isOpen={true} onClose={closeDrawer} /> : null}
      {activeDrawer === "lista_vip" ? <DrawerNovoCadastroVIP isOpen={true} onClose={closeDrawer} /> : null}
      {activeDrawer === "newsletter" ? (
        <DrawerNewsletter
          isOpen={true}
          onClose={closeDrawer}
          rows={connectedData.newsletter}
          onRowsChange={(rows) => setConnectedData((current) => ({ ...current, newsletter: rows }))}
          onSaved={() => handleSaved(false)}
        />
      ) : null}
      {activeDrawer === "cupons" ? (
        <DrawerNovoCupom isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
      {activeDrawer === "auditoria" ? (
        <DrawerAuditoria isOpen={true} onClose={closeDrawer} rows={connectedData.audit} onSaved={() => handleSaved(false)} />
      ) : null}
      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
