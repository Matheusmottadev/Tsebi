"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { HttpError } from "@/lib/http";
import {
  listAuditLogsAdmin,
  listAppointmentSlotsAdmin,
  listCouponsAdmin,
  listNewsletterAdmin,
  listOrdersAdmin,
  listProductsAdmin,
  listRepairsAdmin,
  listUsersAdmin,
  listVipAdmin,
  studioAuthLogout,
  studioAuthMe,
  type AdminOrderSummary,
} from "@/services/admin";
import { DrawerAuditoria } from "@/components/admin/DrawerAuditoria";
import { DrawerNovaNotificacao } from "@/components/admin/DrawerNovaNotificacao";
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
import type { ActivityItem, AdminPageKey, GlobalSearchTarget, KpiData, RecentOrder } from "./types";
import { InicioPage } from "./pages/InicioPage";
import { ConnectedPage, type ConnectedPanelData } from "./pages/ConnectedPage";
import styles from "./StudioAdminPanel.module.css";

const EMPTY_CONNECTED_DATA: ConnectedPanelData = {
  orders: [],
  products: [],
  users: [],
  appointmentSlots: [],
  repairs: [],
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

type GlobalSearchResult = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  target: GlobalSearchTarget;
};

type GlobalSearchGroup = {
  label: "PEDIDOS" | "PRODUTOS" | "USUÁRIOS" | "CUPONS";
  items: GlobalSearchResult[];
};

function normalizeSearchValue(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matchesSearch(value: string, ...fields: unknown[]): boolean {
  const normalizedQuery = normalizeSearchValue(value);
  if (!normalizedQuery) return false;
  const haystack = fields.map((field) => normalizeSearchValue(field)).join(" ");
  return haystack.includes(normalizedQuery);
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

const TOPBAR_BUTTONS: Record<AdminPageKey, { label: string }> = {
  inicio: { label: "Sair" },
  pedidos: { label: "+ Novo Pedido" },
  produtos: { label: "+ Novo Produto" },
  usuarios: { label: "+ Novo Usuário" },
  atendimentos: { label: "+ Novo Horário" },
  reparos: { label: "Atualizar" },
  lista_vip: { label: "+ Novo Cadastro" },
  newsletter: { label: "Editar" },
  cupons: { label: "+ Novo Cupom" },
  auditoria: { label: "Exportar" },
  notificacoes: { label: "+ Nova Notificação" },
};

export function StudioAdminPanel() {
  const router = useRouter();
  const [activePage, setActivePage] = useState<AdminPageKey>("inicio");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [connectedData, setConnectedData] = useState<ConnectedPanelData>(EMPTY_CONNECTED_DATA);
  const [csrfToken, setCsrfToken] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchTarget, setGlobalSearchTarget] = useState<GlobalSearchTarget | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  const openDrawer = (name: string) => setActiveDrawer(name);
  const closeDrawer = () => setActiveDrawer(null);

  useEffect(() => {
    document.body.classList.remove("home-page", "home-legacy-page");
  }, []);

  useEffect(() => {
    setActiveDrawer(null);
  }, [activePage]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      if (isShortcut) {
        event.preventDefault();
        setIsGlobalSearchOpen(true);
        return;
      }
      if (event.key === "Escape") {
        setIsGlobalSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!isGlobalSearchOpen) return;
    const timer = window.setTimeout(() => {
      globalSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isGlobalSearchOpen]);

  function showToast(message: string) {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setToastMessage("");
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
        listAppointmentSlotsAdmin({ includePast: true }, { cache: "no-store" }),
        listRepairsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
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
        appointmentSlots: [],
        repairs: [],
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
        } else {
          setCsrfToken(String(authResult.value.csrfToken || ""));
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

      const appointmentSlotsResult = results[4];
      if (appointmentSlotsResult.status === "fulfilled") {
        next.appointmentSlots = Array.isArray(appointmentSlotsResult.value.rows) ? appointmentSlotsResult.value.rows : [];
      } else {
        failures.push("Atendimentos indisponíveis");
      }

      const repairsResult = results[5];
      if (repairsResult.status === "fulfilled") {
        next.repairs = Array.isArray(repairsResult.value.rows) ? repairsResult.value.rows : [];
      } else {
        failures.push("Reparos indisponíveis");
      }

      const vipResult = results[6];
      if (vipResult.status === "fulfilled") {
        next.vip = Array.isArray(vipResult.value.rows) ? vipResult.value.rows : [];
      } else {
        failures.push("Lista VIP indisponível");
      }

      const newsletterResult = results[7];
      if (newsletterResult.status === "fulfilled") {
        next.newsletter = Array.isArray(newsletterResult.value.rows) ? newsletterResult.value.rows : [];
      } else {
        failures.push("Newsletter indisponível");
      }

      const couponsResult = results[8];
      if (couponsResult.status === "fulfilled") {
        next.coupons = Array.isArray(couponsResult.value.rows) ? couponsResult.value.rows : [];
      } else {
        failures.push("Cupons indisponíveis");
      }

      const auditResult = results[9];
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
    const openCount = connectedData.appointmentSlots.filter((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      return status === "available" || status === "booked";
    }).length;
    if (openCount > 0) return openCount;
    return connectedData.appointmentSlots.length;
  }, [connectedData.appointmentSlots]);

  const pendingRepairs = useMemo(() => {
    const pendingCount = connectedData.repairs.filter((row) => String(row.status || "") === "pending").length;
    if (pendingCount > 0) return pendingCount;
    return connectedData.repairs.length;
  }, [connectedData.repairs]);

  const kpis = useMemo(() => buildDashboardKpis(connectedData), [connectedData]);
  const recentOrders = useMemo(() => buildRecentOrders(connectedData), [connectedData]);
  const activity = useMemo(() => buildActivityItems(connectedData), [connectedData]);
  const globalSearchGroups = useMemo<GlobalSearchGroup[]>(() => {
    const query = String(globalSearchQuery || "").trim();
    if (query.length < 2) return [];

    const orders = connectedData.orders
      .filter((order) =>
        matchesSearch(
          query,
          order.id,
          order.userName,
          order.userEmail,
          order.shippingSelectedService,
          order.shippingSelectedCarrierName,
          order.carrier
        )
      )
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 3)
      .map<GlobalSearchResult>((order) => ({
        id: `order-${order.id}`,
        title: toRecentOrderLabel(order),
        subtitle: order.userName || order.userEmail || "Cliente",
        meta: formatCurrency(order.amount, order.currency, 0),
        target: { page: "pedidos", kind: "order", id: String(order.id || "") },
      }));

    const products = connectedData.products
      .filter((product) =>
        matchesSearch(query, product.sku, product.name, product.category, product.collection, product.gender)
      )
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 3)
      .map<GlobalSearchResult>((product) => ({
        id: `product-${String(product.dbId || product.id || product.sku)}`,
        title: product.name || "-",
        subtitle: product.sku || "-",
        meta: formatCurrency(product.unitAmount, product.currency, 0),
        target: { page: "produtos", kind: "product", id: String(product.dbId || product.id || product.sku || "") },
      }));

    const users = connectedData.users
      .filter((user) => matchesSearch(query, user.name, user.email, user.cpf, user.phone))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 3)
      .map<GlobalSearchResult>((user) => ({
        id: `user-${user.id}`,
        title: user.name || "-",
        subtitle: user.email || "-",
        meta: user.phone || "-",
        target: { page: "usuarios", kind: "user", id: String(user.id || "") },
      }));

    const coupons = connectedData.coupons
      .filter((coupon) => matchesSearch(query, coupon.code, coupon.description))
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 3)
      .map<GlobalSearchResult>((coupon) => ({
        id: `coupon-${coupon.code}`,
        title: coupon.code || "-",
        subtitle: coupon.description || "Cupom",
        meta: coupon.active ? "Ativo" : "Inativo",
        target: { page: "cupons", kind: "coupon", id: String(coupon.code || "") },
      }));

    const groups: GlobalSearchGroup[] = [];
    if (orders.length > 0) groups.push({ label: "PEDIDOS", items: orders });
    if (products.length > 0) groups.push({ label: "PRODUTOS", items: products });
    if (users.length > 0) groups.push({ label: "USUÁRIOS", items: users });
    if (coupons.length > 0) groups.push({ label: "CUPONS", items: coupons });
    return groups;
  }, [connectedData, globalSearchQuery]);

  const topbarConfig = TOPBAR_BUTTONS[activePage];
  const pageTitle = PAGE_TITLES[activePage];
  const topbarActionLabel = topbarConfig.label;
  const hasGlobalSearchResults = globalSearchGroups.some((group) => group.items.length > 0);

  const handleTopbarButton = async () => {
    if (activePage === "inicio") {
      try {
        await studioAuthLogout();
      } catch {
        showToast("Não foi possível encerrar a sessão.");
      } finally {
        router.replace("/admin/login");
        router.refresh();
      }
      return;
    }
    if (activePage === "reparos") {
      setRefreshIndex((current) => current + 1);
      return;
    }
    openDrawer(activePage);
  };

  function handleGlobalSearchSelect(target: GlobalSearchTarget) {
    setIsGlobalSearchOpen(false);
    setGlobalSearchQuery("");
    setActivePage(target.page);
    setGlobalSearchTarget(target);
  }

  const handleGlobalSearchTargetHandled = useCallback(() => {
    setGlobalSearchTarget(null);
  }, []);

  function handleSaved(shouldReload: boolean) {
    if (shouldReload) {
      setRefreshIndex((current) => current + 1);
    }
    showToast("Salvo com sucesso");
  }

  return (
    <div
      className={styles.app}
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        background: "#f7f7f7",
        color: "#333",
        overflowX: "hidden",
      }}
    >
      <Sidebar
        activePage={activePage}
        onChangePage={setActivePage}
        pendingOrders={pendingOrders}
        openCare={openCare}
        pendingRepairs={pendingRepairs}
      />

      <main
        className={styles.main}
        style={{
          marginLeft: 220,
          flex: 1,
          minWidth: 0,
          width: "calc(100% - 220px)",
          minHeight: "100vh",
          background: "#f7f7f7",
        }}
      >
        <Topbar
          title={pageTitle}
          actionLabel={topbarActionLabel}
          onAction={handleTopbarButton}
          onOpenGlobalSearch={() => setIsGlobalSearchOpen(true)}
        />

        <section
          className={styles.content}
          style={{
            padding: "36px 40px",
            width: "100%",
            minWidth: 0,
          }}
        >
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
            <ConnectedPage
              page={activePage}
              data={connectedData}
              loading={isLoading}
              errorMessage={errorMessage}
              csrfToken={csrfToken}
              onRequestRefresh={() => setRefreshIndex((current) => current + 1)}
              onOpenCreateAppointment={activePage === "atendimentos" ? () => openDrawer("atendimentos") : undefined}
              globalSearchTarget={globalSearchTarget}
              onGlobalSearchTargetHandled={handleGlobalSearchTargetHandled}
            />
          )}
        </section>
      </main>

      {isGlobalSearchOpen ? (
        <>
          <button
            type="button"
            className={styles.globalSearchBackdrop}
            aria-label="Fechar pesquisa global"
            onClick={() => setIsGlobalSearchOpen(false)}
          />
          <div className={styles.globalSearchModal}>
            <div className={styles.globalSearchInputWrap}>
              <Search size={14} className={styles.globalSearchIcon} aria-hidden="true" />
              <input
                ref={globalSearchInputRef}
                className={styles.globalSearchInput}
                type="text"
                placeholder="Pesquisar em tudo..."
                value={globalSearchQuery}
                onChange={(event) => setGlobalSearchQuery(event.target.value)}
              />
            </div>

            {String(globalSearchQuery || "").trim().length < 2 ? (
              <p className={styles.globalSearchEmpty}>Digite pelo menos 2 caracteres para pesquisar.</p>
            ) : hasGlobalSearchResults ? (
              globalSearchGroups.map((group) => (
                <section key={group.label} className={styles.resultGroup}>
                  <p className={styles.resultGroupLabel}>{group.label}</p>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.resultItem}
                      onClick={() => handleGlobalSearchSelect(item.target)}
                    >
                      <span>
                        <strong className={styles.resultItemMain}>{item.title}</strong>
                        <small className={styles.resultItemSub}>{item.subtitle}</small>
                      </span>
                      <span className={styles.resultItemMeta}>{item.meta}</span>
                    </button>
                  ))}
                </section>
              ))
            ) : (
              <p className={styles.globalSearchEmpty}>Nenhum resultado encontrado.</p>
            )}
          </div>
        </>
      ) : null}

      {activeDrawer === "pedidos" ? (
        <DrawerNovoPedido isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(false)} />
      ) : null}
      {activeDrawer === "produtos" ? (
        <DrawerNovoProduto isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
      {activeDrawer === "usuarios" ? (
        <DrawerNovoUsuario isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
      {activeDrawer === "atendimentos" ? (
        <DrawerNovoAtendimento isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(true)} />
      ) : null}
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
      {activeDrawer === "notificacoes" ? (
        <DrawerNovaNotificacao isOpen={true} onClose={closeDrawer} onSaved={() => handleSaved(false)} />
      ) : null}
      <Toast message={toastMessage} visible={toastVisible} />
    </div>
  );
}
