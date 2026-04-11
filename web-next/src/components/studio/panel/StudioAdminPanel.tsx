"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { HttpError } from "@/lib/http";
import {
  listAuditLogsAdmin,
  listAppointmentSlotsAdmin,
  listCouponsAdmin,
  listDirectoriaAdmins,
  listDirectoriaBalanceRequests,
  listGiftCardsAdmin,
  listNfseAdmin,
  listNewsletterAdmin,
  listOrdersAdmin,
  listProductsAdmin,
  listRepairsAdmin,
  listUsersAdmin,
  listVipAdmin,
  studioAuthLogout,
  studioAuthMe,
  type AdminAccessRow,
  type AdminOrderSummary,
} from "@/services/admin";
import { DrawerAuditoria } from "@/components/admin/DrawerAuditoria";
import { DrawerNovaNotificacao } from "@/components/admin/DrawerNovaNotificacao";
import { DrawerNewsletter } from "@/components/admin/DrawerNewsletter";
import { DrawerNovoAtendimento } from "@/components/admin/DrawerNovoAtendimento";
import { DrawerNovoCadastroVIP } from "@/components/admin/DrawerNovoCadastroVIP";
import { DrawerNovoCupom } from "@/components/admin/DrawerNovoCupom";
import { DrawerGiftCard } from "@/components/admin/DrawerGiftCard";
import { DrawerNovoPedido } from "@/components/admin/DrawerNovoPedido";
import { DrawerNovoProduto } from "@/components/admin/DrawerNovoProduto";
import { DrawerNovoUsuario } from "@/components/admin/DrawerNovoUsuario";
import { Toast } from "@/components/admin/Toast";
import { PAGE_TITLES } from "./data";
import { AdminPendingBell } from "./AdminPendingBell";
import { AdminStepUpModal } from "./AdminStepUpModal";
import { AdminNotificationBell } from "./AdminNotificationBell";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { AdminAccessProvider, RequirePermission, RequireRole } from "./access-control";
import type { ActivityItem, AdminPageKey, GlobalSearchTarget, KpiData, RecentOrder } from "./types";
import { BalancePage } from "./pages/BalancePage";
import { DiretoriaPage } from "./pages/DiretoriaPage";
import { InicioPage } from "./pages/InicioPage";
import { StatusPage } from "./pages/StatusPage";
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
  giftCards: [],
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
  label: string;
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

function formatAdminRoleLabel(role: string): string {
  if (role === "superadmin") return "Diretoria";
  if (role === "director") return "Gerente";
  return "Admin";
}

function formatNfseStatusLabel(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "autorizada") return "Autorizada";
  if (normalized === "cancelada") return "Cancelada";
  if (normalized === "erro") return "Com erro";
  if (normalized === "processando") return "Processando";
  return "Pendente";
}

function formatBalanceRequestStatusLabel(status: string): string {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "approved") return "Aprovada";
  if (normalized === "rejected") return "Rejeitada";
  return "Pendente";
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
  gift_cards: { label: "+ Novo Gift Card" },
  saldo_clientes: { label: "Atualizar" },
  status: { label: "Atualizar" },
  diretoria: { label: "Atualizar" },
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
  const [adminAccess, setAdminAccess] = useState<AdminAccessRow | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);
  const [notifLogsKey, setNotifLogsKey] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchTarget, setGlobalSearchTarget] = useState<GlobalSearchTarget | null>(null);
  const [homeSearchQuery, setHomeSearchQuery] = useState("");
  const [homeSearchLoading, setHomeSearchLoading] = useState(false);
  const [homeRemoteSearchGroups, setHomeRemoteSearchGroups] = useState<GlobalSearchGroup[]>([]);
  const [balanceCustomerTargetId, setBalanceCustomerTargetId] = useState<string | null>(null);
  const [diretoriaSearchTarget, setDiretoriaSearchTarget] = useState<{ kind: "admin" | "balance_request"; id: string } | null>(null);
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
      setAdminAccess(null);

      const next: ConnectedPanelData = {
        orders: [],
        products: [],
        users: [],
        appointmentSlots: [],
        repairs: [],
        vip: [],
        newsletter: [],
        coupons: [],
        giftCards: [],
        audit: [],
      };
      const failures: string[] = [];

      const canReadModule = (access: AdminAccessRow | null, moduleName: "orders" | "users" | "products") => {
        if (!access) return false;
        if (access.role === "director" || access.role === "superadmin") return true;
        return Array.isArray(access.permissions) && access.permissions.includes(moduleName);
      };
      const canReadAudit = (access: AdminAccessRow | null) => {
        if (!access) return false;
        return access.role === "director" || access.role === "superadmin";
      };

      let authValue: Awaited<ReturnType<typeof studioAuthMe>> | null = null;
      try {
        authValue = await studioAuthMe({ cache: "no-store" });
        if (!authValue.authenticated) {
          failures.push("Sessão admin não autenticada. Faça login em /admin/login.");
        } else {
          setCsrfToken(String(authValue.csrfToken || ""));
          setAdminAccess((authValue.access as AdminAccessRow) || null);
        }
      } catch (error) {
        if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
          failures.push("Sessão admin expirada. Faça login em /admin/login.");
        } else {
          failures.push("Falha ao validar sessão admin.");
        }
      }

      const access = (authValue?.access as AdminAccessRow) || null;
      if (!authValue?.authenticated) {
        if (!cancelled) {
          setConnectedData(next);
          setErrorMessage(failures.length > 0 ? failures.join(". ") : "");
          setIsLoading(false);
        }
        return;
      }

      const results = await Promise.allSettled([
        canReadModule(access, "orders") ? listOrdersAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }) : Promise.resolve({ orders: [] }),
        canReadModule(access, "products") ? listProductsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }) : Promise.resolve({ rows: [] }),
        canReadModule(access, "users") ? listUsersAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }) : Promise.resolve({ users: [] }),
        listAppointmentSlotsAdmin({ includePast: true }, { cache: "no-store" }),
        listRepairsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listVipAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listNewsletterAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listCouponsAdmin({ page: 1, pageSize: 200 }, { cache: "no-store" }),
        listGiftCardsAdmin({ page: 1, pageSize: 500 }, { cache: "no-store" }),
        canReadAudit(access) ? listAuditLogsAdmin({ limit: 200, offset: 0 }, { cache: "no-store" }) : Promise.resolve({ logs: [] }),
      ]);

      if (cancelled) return;

      const ordersResult = results[0];
      if (ordersResult.status === "fulfilled") {
        next.orders = Array.isArray(ordersResult.value.orders) ? ordersResult.value.orders : [];
      } else if (canReadModule(access, "orders")) {
        failures.push("Pedidos indisponíveis");
      }

      const productsResult = results[1];
      if (productsResult.status === "fulfilled") {
        next.products = Array.isArray(productsResult.value.rows) ? productsResult.value.rows : [];
      } else if (canReadModule(access, "products")) {
        failures.push("Produtos indisponíveis");
      }

      const usersResult = results[2];
      if (usersResult.status === "fulfilled") {
        next.users = Array.isArray(usersResult.value.users) ? usersResult.value.users : [];
      } else if (canReadModule(access, "users")) {
        failures.push("Usuários indisponíveis");
      }

      const appointmentSlotsResult = results[3];
      if (appointmentSlotsResult.status === "fulfilled") {
        next.appointmentSlots = Array.isArray(appointmentSlotsResult.value.rows) ? appointmentSlotsResult.value.rows : [];
      } else {
        failures.push("Atendimentos indisponíveis");
      }

      const repairsResult = results[4];
      if (repairsResult.status === "fulfilled") {
        next.repairs = Array.isArray(repairsResult.value.rows) ? repairsResult.value.rows : [];
      } else {
        failures.push("Reparos indisponíveis");
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

      const giftCardsResult = results[8];
      if (giftCardsResult.status === "fulfilled") {
        next.giftCards = Array.isArray(giftCardsResult.value.rows) ? giftCardsResult.value.rows : [];
      } else {
        failures.push("Gift cards indisponíveis");
      }

      const auditResult = results[9];
      if (auditResult.status === "fulfilled") {
        next.audit = Array.isArray(auditResult.value.logs) ? auditResult.value.logs : [];
      } else if (canReadAudit(access)) {
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
  const canSearchPrivilegedData = adminAccess?.role === "director" || adminAccess?.role === "superadmin";
  const homeLocalSearchGroups = useMemo<GlobalSearchGroup[]>(() => {
    const query = String(homeSearchQuery || "").trim();
    if (query.length < 2) return [];

    const orders = connectedData.orders
      .filter((order) =>
        matchesSearch(
          query,
          order.id,
          order.orderNumber,
          order.userName,
          order.userEmail,
          order.shippingSelectedService,
          order.shippingSelectedCarrierName,
          order.carrier
        )
      )
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 4)
      .map<GlobalSearchResult>((order) => ({
        id: `home-order-${order.id}`,
        title: toRecentOrderLabel(order),
        subtitle: order.userName || order.userEmail || "Cliente",
        meta: formatCurrency(order.amount, order.currency, 0),
        target: { page: "pedidos", kind: "order", id: String(order.id || "") },
      }));

    const customers = connectedData.users
      .filter((user) => matchesSearch(query, user.id, user.name, user.email, user.cpf, user.phone))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 4)
      .map<GlobalSearchResult>((user) => ({
        id: `home-user-${user.id}`,
        title: user.name || user.email || "Cliente",
        subtitle: user.email || user.phone || "Cliente",
        meta: "Cliente",
        target: { page: "usuarios", kind: "user", id: String(user.id || "") },
      }));

    const giftCards = connectedData.giftCards
      .filter((card) => matchesSearch(query, card.id, card.code, card.note))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 4)
      .map<GlobalSearchResult>((card) => ({
        id: `home-gift-card-${card.id}`,
        title: card.code || "Gift card",
        subtitle: card.note || "Gift card",
        meta: card.active ? "Ativo" : "Inativo",
        target: { page: "gift_cards", kind: "gift_card", id: String(card.id || "") },
      }));

    const groups: GlobalSearchGroup[] = [];
    if (orders.length > 0) groups.push({ label: "PEDIDOS", items: orders });
    if (customers.length > 0) groups.push({ label: "CLIENTES", items: customers });
    if (giftCards.length > 0) groups.push({ label: "GIFT CARDS", items: giftCards });
    return groups;
  }, [connectedData, homeSearchQuery]);

  useEffect(() => {
    const query = String(homeSearchQuery || "").trim();
    if (query.length < 2) {
      setHomeRemoteSearchGroups([]);
      setHomeSearchLoading(false);
      return;
    }

    setHomeRemoteSearchGroups([]);
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setHomeSearchLoading(true);

      const [nfseResponse, adminsResponse, balanceRequestsResponse] = await Promise.all([
        listNfseAdmin(
          {
            busca: query,
            pagina: 1,
            include_pending_orders: false,
            visao: "emitidas",
          },
          { cache: "no-store" }
        ).catch(() => null),
        canSearchPrivilegedData ? listDirectoriaAdmins({ cache: "no-store" }).catch(() => null) : Promise.resolve(null),
        canSearchPrivilegedData
          ? listDirectoriaBalanceRequests({ page: 1, limit: 100 }, { cache: "no-store" }).catch(() => null)
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      const groups: GlobalSearchGroup[] = [];

      const nfseRows = Array.isArray(nfseResponse?.notas) ? nfseResponse.notas : [];
      const nfseResults = nfseRows
        .filter((nota) =>
          matchesSearch(query, nota.numero, nota.pedido_id, nota.tomador_nome, nota.tomador_email, nota.status)
        )
        .slice(0, 4)
        .map<GlobalSearchResult>((nota) => ({
          id: `home-nfse-${nota.id}`,
          title: nota.numero ? `NFS-e ${nota.numero}` : `Pedido #${String(nota.pedido_id || "").slice(0, 8)}`,
          subtitle: nota.tomador_nome || nota.tomador_email || "Nota fiscal",
          meta: formatNfseStatusLabel(nota.status),
          target: {
            page: "nfse",
            kind: "nfse",
            id: String(nota.id || ""),
            query: String(nota.numero || nota.pedido_id || ""),
          },
        }));
      if (nfseResults.length > 0) groups.push({ label: "NOTAS FISCAIS", items: nfseResults });

      if (canSearchPrivilegedData) {
        const adminRows = Array.isArray(adminsResponse?.rows) ? adminsResponse.rows : [];
        const adminResults = adminRows
          .filter((admin) => matchesSearch(query, admin.id, admin.name, admin.nickname, admin.email, admin.role))
          .slice(0, 4)
          .map<GlobalSearchResult>((admin) => ({
            id: `home-admin-${admin.id}`,
            title: admin.name || admin.email,
            subtitle: admin.email,
            meta: formatAdminRoleLabel(admin.role),
            target: { page: "diretoria", kind: "admin", id: String(admin.id || "") },
          }));
        if (adminResults.length > 0) groups.push({ label: "ADMINS", items: adminResults });

        const requestRows = Array.isArray(balanceRequestsResponse?.rows) ? balanceRequestsResponse.rows : [];
        const requestResults = requestRows
          .filter((request) =>
            matchesSearch(
              query,
              request.id,
              request.customerName,
              request.customerEmail,
              request.requesterName,
              request.requesterEmail,
              request.relatedOrderId,
              request.reason,
              request.reasonDetail,
              request.status
            )
          )
          .slice(0, 4)
          .map<GlobalSearchResult>((request) => ({
            id: `home-balance-request-${request.id}`,
            title: request.customerName || request.customerEmail || `Solicitação ${request.id.slice(0, 8)}`,
            subtitle: request.requesterName || request.requesterEmail || "Solicitação de saldo",
            meta: formatBalanceRequestStatusLabel(request.status),
            target: { page: "diretoria", kind: "balance_request", id: String(request.id || "") },
          }));
        if (requestResults.length > 0) groups.push({ label: "SOLICITAÇÕES DE SALDO", items: requestResults });
      }

      setHomeRemoteSearchGroups(groups);
      setHomeSearchLoading(false);
    }, 260);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canSearchPrivilegedData, homeSearchQuery]);

  const homeSearchGroups = useMemo<GlobalSearchGroup[]>(
    () => [...homeLocalSearchGroups, ...homeRemoteSearchGroups],
    [homeLocalSearchGroups, homeRemoteSearchGroups]
  );

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
    if (activePage === "saldo_clientes" || activePage === "diretoria" || activePage === "status") {
      setRefreshIndex((current) => current + 1);
      return;
    }
    openDrawer(activePage);
  };

  function handleGlobalSearchSelect(target: GlobalSearchTarget) {
    setIsGlobalSearchOpen(false);
    setGlobalSearchQuery("");
    setHomeSearchQuery("");
    setHomeRemoteSearchGroups([]);

    if (target.kind === "nfse") {
      const query = String(target.query || target.id || "").trim();
      router.push(query ? `/admin/nfse?busca=${encodeURIComponent(query)}` : "/admin/nfse");
      return;
    }

    if (target.kind === "admin" || target.kind === "balance_request") {
      setDiretoriaSearchTarget({
        kind: target.kind === "admin" ? "admin" : "balance_request",
        id: target.id,
      });
      setActivePage("diretoria");
      return;
    }

    setActivePage(target.page as AdminPageKey);
    setGlobalSearchTarget(target);
  }

  function handleNavigateToOrder(orderId: string) {
    const normalizedOrderId = String(orderId || "").trim();
    if (!normalizedOrderId) return;
    setActivePage("pedidos");
    setGlobalSearchTarget({
      page: "pedidos",
      kind: "order",
      id: normalizedOrderId,
    });
  }

  const handleGlobalSearchTargetHandled = useCallback(() => {
    setGlobalSearchTarget(null);
  }, []);

  const handleDiretoriaSearchTargetHandled = useCallback(() => {
    setDiretoriaSearchTarget(null);
  }, []);

  function handleSaved(shouldReload: boolean) {
    if (shouldReload) {
      setRefreshIndex((current) => current + 1);
    }
    showToast("Salvo com sucesso");
  }

  const connectedPageProps = {
    data: connectedData,
    loading: isLoading,
    errorMessage,
    csrfToken,
    onRequestRefresh: () => setRefreshIndex((current) => current + 1),
    onOpenCreateAppointment: activePage === "atendimentos" ? () => openDrawer("atendimentos") : undefined,
    globalSearchTarget,
    onGlobalSearchTargetHandled: handleGlobalSearchTargetHandled,
    notifLogsRefreshKey: notifLogsKey,
    onNavigateToOrder: handleNavigateToOrder,
  } as const;

  const content =
    activePage === "inicio" ? (
      <InicioPage
        kpis={kpis}
        recentOrders={recentOrders}
        activities={activity}
        loading={isLoading}
        errorMessage={errorMessage}
        searchQuery={homeSearchQuery}
        searchLoading={homeSearchLoading}
        searchGroups={homeSearchGroups}
        onSearchQueryChange={setHomeSearchQuery}
        onSearchSelect={handleGlobalSearchSelect}
        onViewAllOrders={() => setActivePage("pedidos")}
      />
    ) : activePage === "saldo_clientes" ? (
      <RequirePermission module="balance">
        <BalancePage
          csrfToken={csrfToken}
          refreshKey={refreshIndex}
          focusCustomerId={balanceCustomerTargetId}
          onFocusCustomerHandled={() => setBalanceCustomerTargetId(null)}
        />
      </RequirePermission>
    ) : activePage === "diretoria" ? (
      <RequireRole roles={["director", "superadmin"]}>
        <DiretoriaPage
          csrfToken={csrfToken}
          refreshKey={refreshIndex}
          onNavigatePage={setActivePage}
          onOpenBalanceCustomer={(customerId) => {
            setBalanceCustomerTargetId(customerId);
            setActivePage("saldo_clientes");
          }}
          focusTarget={diretoriaSearchTarget}
          onFocusTargetHandled={handleDiretoriaSearchTargetHandled}
        />
      </RequireRole>
    ) : activePage === "status" ? (
      <StatusPage refreshKey={refreshIndex} />
    ) : activePage === "auditoria" ? (
      <RequireRole roles={["director", "superadmin"]}>
        <ConnectedPage page="auditoria" {...connectedPageProps} />
      </RequireRole>
    ) : activePage === "pedidos" ? (
      <RequirePermission module="orders">
        <ConnectedPage page="pedidos" {...connectedPageProps} />
      </RequirePermission>
    ) : activePage === "produtos" ? (
      <RequirePermission module="products">
        <ConnectedPage page="produtos" {...connectedPageProps} />
      </RequirePermission>
    ) : activePage === "usuarios" ? (
      <RequirePermission module="users">
        <ConnectedPage page="usuarios" {...connectedPageProps} />
      </RequirePermission>
    ) : (
      <ConnectedPage page={activePage as Exclude<AdminPageKey, "inicio" | "saldo_clientes" | "diretoria" | "auditoria">} {...connectedPageProps} />
    );

  return (
    <AdminAccessProvider value={adminAccess}>
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
            pendingSlot={<AdminPendingBell onNavigate={setActivePage} />}
            notificationsSlot={<AdminNotificationBell csrfToken={csrfToken} onNavigate={setActivePage} />}
          />

          <section
            className={styles.content}
            style={{
              padding: "36px 40px",
              width: "100%",
              minWidth: 0,
            }}
          >
            {content}
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
      {activeDrawer === "gift_cards" ? (
        <DrawerGiftCard
          isOpen={true}
          giftCard={null}
          csrfToken={csrfToken}
          onClose={closeDrawer}
          onSaved={(card) => {
            setConnectedData((prev) => ({ ...prev, giftCards: [card, ...prev.giftCards] }));
            closeDrawer();
            showToast("Gift card criado com sucesso!");
          }}
        />
      ) : null}
      {activeDrawer === "auditoria" ? (
        <DrawerAuditoria isOpen={true} onClose={closeDrawer} rows={connectedData.audit} onSaved={() => handleSaved(false)} />
      ) : null}
      {activeDrawer === "notificacoes" ? (
        <DrawerNovaNotificacao
          isOpen={true}
          onClose={closeDrawer}
          onSaved={() => { setNotifLogsKey((k) => k + 1); handleSaved(false); }}
        />
      ) : null}
        <Toast message={toastMessage} visible={toastVisible} />
        <AdminStepUpModal />
      </div>
    </AdminAccessProvider>
  );
}
