import { PencilLine, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { DrawerDetalhesUsuario } from "@/components/admin/DrawerDetalhesUsuario";
import { DrawerEditarCupom } from "@/components/admin/DrawerEditarCupom";
import { DrawerEditarPedido } from "@/components/admin/DrawerEditarPedido";
import { DrawerEditarProduto } from "@/components/admin/DrawerEditarProduto";
import { DrawerNovoAtendimento } from "@/components/admin/DrawerNovoAtendimento";
import { RepairRequestsManager } from "@/components/admin/RepairRequestsManager";
import { Toast } from "@/components/admin/Toast";
import { SearchBar, type FilterConfig, type SortOption } from "@/components/studio/panel/SearchBar";
import { PrivateCareManager } from "@/components/studio/PrivateCareManager";
import {
  deleteAppointmentSlotAdmin,
  deleteCouponAdmin,
  deleteNewsletterAdmin,
  updateAppointmentSlotAdmin,
  type AdminAppointmentSlot,
  deleteVipAdmin,
  type AdminAuditLog,
  type AdminNewsletterRow,
  type AdminOrderSummary,
  type AdminUserRow,
  type AdminVipRow,
} from "@/services/admin";
import type { Coupon, Order, Product, RepairRequest } from "@/types";
import type { AdminPageKey, GlobalSearchTarget } from "../types";
import styles from "./ConnectedPage.module.css";

export interface ConnectedPanelData {
  orders: AdminOrderSummary[];
  products: Product[];
  users: AdminUserRow[];
  appointmentSlots: AdminAppointmentSlot[];
  repairs: RepairRequest[];
  vip: AdminVipRow[];
  newsletter: AdminNewsletterRow[];
  coupons: Coupon[];
  audit: AdminAuditLog[];
}

type ConnectedPageProps = {
  page: Exclude<AdminPageKey, "inicio">;
  data: ConnectedPanelData;
  loading: boolean;
  errorMessage: string;
  csrfToken?: string;
  onRequestRefresh?: () => void;
  onOpenCreateAppointment?: () => void;
  globalSearchTarget?: GlobalSearchTarget | null;
  onGlobalSearchTargetHandled?: () => void;
};

type ConfirmDeleteTarget =
  | { kind: "coupon"; id: string; label: string }
  | { kind: "appointment_slot"; id: string; label: string }
  | { kind: "vip"; id: string; label: string }
  | { kind: "newsletter"; id: string; label: string };

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatMoneyCents(amountCents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: String(currency || "BRL").toUpperCase(),
    maximumFractionDigits: 0,
  }).format((Number(amountCents || 0) || 0) / 100);
}

function formatCouponRule(coupon: Coupon): string {
  if (coupon.type === "percent") return `${Number(coupon.percentOff || 0)}%`;
  return formatMoneyCents(Number(coupon.amountOffCents || 0), "BRL");
}

function pickOrderId(order: AdminOrderSummary): string {
  const raw = String(order.id || "").trim();
  if (!raw) return "-";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function normalizeUserStatus(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "-";
  if (normalized === "disabled") return "suspended";
  return normalized;
}

function normalizeTextForCompare(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeDigits(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function isToday(date: Date): boolean {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return date.getTime() >= weekStart.getTime();
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isInLastMonths(date: Date, months: number): boolean {
  const limit = new Date();
  limit.setMonth(limit.getMonth() - months);
  return date.getTime() >= limit.getTime();
}

function matchesPeriod(dateValue: string | null | undefined, period: string): boolean {
  if (period === "todos") return true;
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (period === "hoje") return isToday(date);
  if (period === "esta_semana") return isThisWeek(date);
  if (period === "este_mes") return isThisMonth(date);
  if (period === "ultimos_3_meses") return isInLastMonths(date, 3);
  return true;
}

function readUserEmailVerified(row: AdminUserRow): boolean {
  const extra = row as unknown as Record<string, unknown>;
  return Boolean(extra.emailVerified);
}

function readTotalSpentCents(row: Record<string, unknown>): number {
  const candidates = [
    row.totalSpentCents,
    row.totalSpent,
    row.totalSpentAmount,
    row.amountSpentCents,
    row.amountSpent,
    row.ltvCents,
    row.ltv,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate || 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function normalizeAppointmentSlotStatus(value: string): "disponivel" | "com_agendamento" | "indisponivel" | "bloqueado" | "lotado" {
  const status = normalizeTextForCompare(value);
  if (status.includes("bloqueado") || status.includes("blocked")) return "bloqueado";
  if (status.includes("lotado") || status.includes("filled")) return "lotado";
  if (status.includes("indisponivel") || status.includes("unavailable")) return "indisponivel";
  if (status.includes("booked") || status.includes("agend")) return "com_agendamento";
  return "disponivel";
}

function formatAppointmentSlotStatus(value: string): string {
  const normalized = normalizeAppointmentSlotStatus(value);
  if (normalized === "bloqueado") return "Bloqueado";
  if (normalized === "lotado") return "Lotado";
  if (normalized === "indisponivel") return "Indisponivel";
  if (normalized === "com_agendamento") return "Com agendamento";
  return "Disponivel";
}

function getAppointmentClients(row: AdminAppointmentSlot): string {
  if (!Array.isArray(row.appointments) || row.appointments.length === 0) return "-";
  return row.appointments
    .map((appointment) => String(appointment.userName || appointment.userEmail || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");
}

function normalizeAuditEventType(action: string): "login" | "logout" | "criacao" | "edicao" | "exclusao" | "erro" | "outro" {
  const normalized = normalizeTextForCompare(action);
  if (normalized.includes("login") || normalized === "auth_login") return "login";
  if (normalized.includes("logout") || normalized === "auth_logout") return "logout";
  if (normalized.includes("create") || normalized.includes("cri")) return "criacao";
  if (normalized.includes("update") || normalized.includes("edit") || normalized.includes("patch")) return "edicao";
  if (normalized.includes("delete") || normalized.includes("remove") || normalized.includes("excl")) return "exclusao";
  if (normalized.includes("error") || normalized.includes("erro") || normalized.includes("fail")) return "erro";
  return "outro";
}

function formatOrderStatus(order: AdminOrderSummary): string {
  const status = normalizeTextForCompare(order.status);
  const tracking = [order.trackingStatus, order.shipment?.status]
    .map((value) => normalizeTextForCompare(value))
    .join(" ");

  if (status === "refunded" || status === "reembolsado") return "reembolsado";
  if (["canceled", "cancelled", "cancelado", "failed", "falhou"].includes(status)) return "cancelado";
  if (tracking.includes("delivered") || tracking.includes("entreg")) return "entregue";
  if (
    tracking.includes("transit") ||
    tracking.includes("enviado") ||
    tracking.includes("shipped") ||
    status === "processing" ||
    status === "processando"
  ) {
    return "enviado";
  }
  if (status === "paid" || status === "pago") return "pago";
  if (status === "pending_payment" || status === "pending" || status === "pendente") return "pendente";
  return status || "-";
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Falha na operação.";
}

function getProductKey(product: Product): string {
  return String(product.dbId || product.id || product.sku || "").trim();
}

function buildProductFieldOptions(rows: Product[], field: "category" | "collection"): string[] {
  const uniqueByKey = new Map<string, string>();
  rows.forEach((product) => {
    const rawValue = String(product[field] || "").trim();
    if (!rawValue) return;
    const normalized = normalizeTextForCompare(rawValue);
    if (!normalized || uniqueByKey.has(normalized)) return;
    uniqueByKey.set(normalized, rawValue);
  });
  return Array.from(uniqueByKey.values()).sort((left, right) =>
    left.localeCompare(right, "pt-BR", { sensitivity: "base" })
  );
}

function toSummaryFromOrder(base: AdminOrderSummary, next: Order): AdminOrderSummary {
  const nextTracking = String(next.trackingStatus || next.currentStatus || base.trackingStatus || "");
  return {
    ...base,
    status: String(next.status || base.status || ""),
    currency: String(next.currency || base.currency || "BRL"),
    amount: Number(next.amount || base.amount || 0),
    itemsAmount: Number(next.itemsAmount || base.itemsAmount || 0),
    shippingAmount: Number(next.shippingAmount || base.shippingAmount || 0),
    shippingPriceCents: Number(next.shippingPriceCents || base.shippingPriceCents || 0),
    shippingSelectedProvider: String(next.shippingSelectedProvider || base.shippingSelectedProvider || ""),
    shippingSelectedService: String(next.shippingSelectedService || base.shippingSelectedService || ""),
    shippingSelectedServiceCode: String(next.shippingSelectedServiceCode || base.shippingSelectedServiceCode || ""),
    shippingSelectedCarrierName: String(next.shippingSelectedCarrierName || base.shippingSelectedCarrierName || ""),
    shippingDeadlineDays:
      next.shippingDeadlineDays == null ? base.shippingDeadlineDays : Number(next.shippingDeadlineDays),
    shippingDestinationZip: String(next.shippingDestinationZip || base.shippingDestinationZip || ""),
    trackingId: String(next.trackingId || base.trackingId || ""),
    trackingStatus: nextTracking,
    carrier: String(next.carrier || base.carrier || ""),
    shippingDeadline: next.shippingDeadline ?? base.shippingDeadline ?? null,
    shipment: base.shipment
      ? {
          ...base.shipment,
          status: String(nextTracking || base.shipment.status || ""),
          trackingCode: String(next.trackingCode || base.shipment.trackingCode || ""),
          provider: String(next.shippingSelectedProvider || base.shipment.provider || ""),
          updatedAt: next.updatedAt || base.shipment.updatedAt || null,
        }
      : base.shipment,
    updatedAt: next.updatedAt || base.updatedAt || null,
    createdAt: next.createdAt || base.createdAt || null,
  };
}

function getDeleteContent(target: ConfirmDeleteTarget): {
  title: string;
  text: string;
  confirmLabel: string;
} {
  if (target.kind === "coupon") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja excluir o cupom ${target.label}? Esta ação é irreversível.`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  if (target.kind === "appointment_slot") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja excluir o horário ${target.label}?`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  if (target.kind === "vip") {
    return {
      title: "Confirmar exclusao",
      text: `Tem certeza que deseja remover ${target.label} da Lista VIP?`,
      confirmLabel: "Excluir permanentemente",
    };
  }

  return {
    title: "Confirmar exclusao",
    text: `Tem certeza que deseja remover ${target.label} da Newsletter?`,
    confirmLabel: "Excluir permanentemente",
  };
}

export function ConnectedPage({
  page,
  data,
  loading,
  errorMessage,
  csrfToken = "",
  onRequestRefresh,
  onOpenCreateAppointment,
  globalSearchTarget,
  onGlobalSearchTargetHandled,
}: ConnectedPageProps) {
  const [ordersRows, setOrdersRows] = useState<AdminOrderSummary[]>(data.orders || []);
  const [productsRows, setProductsRows] = useState<Product[]>(data.products || []);
  const [usersRows, setUsersRows] = useState<AdminUserRow[]>(data.users || []);
  const [appointmentSlotRows, setAppointmentSlotRows] = useState<AdminAppointmentSlot[]>(data.appointmentSlots || []);
  const [repairRows, setRepairRows] = useState<RepairRequest[]>(data.repairs || []);
  const [vipRows, setVipRows] = useState<AdminVipRow[]>(data.vip || []);
  const [newsletterRows, setNewsletterRows] = useState<AdminNewsletterRow[]>(data.newsletter || []);
  const [couponsRows, setCouponsRows] = useState<Coupon[]>(data.coupons || []);
  const [auditRows, setAuditRows] = useState<AdminAuditLog[]>(data.audit || []);

  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersStatusFilter, setOrdersStatusFilter] = useState("todos");
  const [ordersShippingFilter, setOrdersShippingFilter] = useState("todos");
  const [ordersPeriodFilter, setOrdersPeriodFilter] = useState("todos");
  const [ordersSort, setOrdersSort] = useState("mais_recente");

  const [productsSearch, setProductsSearch] = useState("");
  const [productsStatusFilter, setProductsStatusFilter] = useState("todos");
  const [productsCategoryFilter, setProductsCategoryFilter] = useState("todos");
  const [productsGenderFilter, setProductsGenderFilter] = useState("todos");
  const [productsSizeFilter, setProductsSizeFilter] = useState("todos");
  const [productsStockFilter, setProductsStockFilter] = useState("todos");
  const [productsSort, setProductsSort] = useState("nome_az");

  const [usersSearch, setUsersSearch] = useState("");
  const [usersStatusFilter, setUsersStatusFilter] = useState("todos");
  const [usersEmailFilter, setUsersEmailFilter] = useState("todos");
  const [usersPeriodFilter, setUsersPeriodFilter] = useState("todos");
  const [usersSort, setUsersSort] = useState("mais_recente");

  const [couponsSearch, setCouponsSearch] = useState("");
  const [couponsStatusFilter, setCouponsStatusFilter] = useState("todos");
  const [couponsTypeFilter, setCouponsTypeFilter] = useState("todos");
  const [couponsValidityFilter, setCouponsValidityFilter] = useState("todos");
  const [couponsSort, setCouponsSort] = useState("mais_recente");

  const [careSearch, setCareSearch] = useState("");
  const [careStatusFilter, setCareStatusFilter] = useState("todos");
  const [carePeriodFilter, setCarePeriodFilter] = useState("todos");
  const [careSort, setCareSort] = useState("mais_recente");

  const [vipSearch, setVipSearch] = useState("");
  const [vipPeriodFilter, setVipPeriodFilter] = useState("todos");
  const [vipSort, setVipSort] = useState("mais_recente");

  const [newsletterSearch, setNewsletterSearch] = useState("");
  const [newsletterPeriodFilter, setNewsletterPeriodFilter] = useState("todos");
  const [newsletterSort, setNewsletterSort] = useState("mais_recente");

  const [auditSearch, setAuditSearch] = useState("");
  const [auditEventFilter, setAuditEventFilter] = useState("todos");
  const [auditPeriodFilter, setAuditPeriodFilter] = useState("todos");
  const [auditSort, setAuditSort] = useState("mais_recente");

  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<AdminOrderSummary | null>(null);
  const [isOrderDrawerOpen, setIsOrderDrawerOpen] = useState(false);

  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [isCouponDrawerOpen, setIsCouponDrawerOpen] = useState(false);
  const [selectedAppointmentSlot, setSelectedAppointmentSlot] = useState<AdminAppointmentSlot | null>(null);
  const [isAppointmentDrawerOpen, setIsAppointmentDrawerOpen] = useState(false);

  const [confirmTarget, setConfirmTarget] = useState<ConfirmDeleteTarget | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setOrdersRows(data.orders || []);
  }, [data.orders]);

  useEffect(() => {
    setProductsRows(data.products || []);
  }, [data.products]);

  useEffect(() => {
    setUsersRows(data.users || []);
  }, [data.users]);

  useEffect(() => {
    setAppointmentSlotRows(data.appointmentSlots || []);
  }, [data.appointmentSlots]);

  useEffect(() => {
    setRepairRows(data.repairs || []);
  }, [data.repairs]);

  useEffect(() => {
    setVipRows(data.vip || []);
  }, [data.vip]);

  useEffect(() => {
    setNewsletterRows(data.newsletter || []);
  }, [data.newsletter]);

  useEffect(() => {
    setCouponsRows(data.coupons || []);
  }, [data.coupons]);

  useEffect(() => {
    setAuditRows(data.audit || []);
  }, [data.audit]);

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    []
  );

  useEffect(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastVisible(false);
    setToastMessage("");
  }, [page]);

  const openUserDrawer = (user: AdminUserRow) => {
    setSelectedUser(user);
    setIsUserDrawerOpen(true);
    setIsEditingUser(false);
  };

  const closeUserDrawer = () => {
    setIsUserDrawerOpen(false);
    setIsEditingUser(false);
    setSelectedUser(null);
  };

  const openProductDrawer = (product: Product) => {
    setSelectedProduct(product);
    setIsProductDrawerOpen(true);
  };

  const closeProductDrawer = () => {
    setIsProductDrawerOpen(false);
    setSelectedProduct(null);
  };

  const openOrderDrawer = (order: AdminOrderSummary) => {
    setSelectedOrder(order);
    setIsOrderDrawerOpen(true);
  };

  const closeOrderDrawer = () => {
    setIsOrderDrawerOpen(false);
    setSelectedOrder(null);
  };

  const openCouponDrawer = (coupon: Coupon) => {
    setSelectedCoupon(coupon);
    setIsCouponDrawerOpen(true);
  };

  const closeCouponDrawer = () => {
    setIsCouponDrawerOpen(false);
    setSelectedCoupon(null);
  };

  const openAppointmentDrawer = (slot: AdminAppointmentSlot) => {
    setSelectedAppointmentSlot(slot);
    setIsAppointmentDrawerOpen(true);
  };

  const closeAppointmentDrawer = () => {
    setIsAppointmentDrawerOpen(false);
    setSelectedAppointmentSlot(null);
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastVisible(false);
      setToastMessage("");
      toastTimerRef.current = null;
    }, 3000);
  };

  const filteredOrders = useMemo(() => {
    const queryText = normalizeTextForCompare(ordersSearch);
    const queryDigits = normalizeDigits(ordersSearch);
    const nextRows = [...ordersRows].filter((order) => {
      const anyOrder = order as unknown as Record<string, unknown>;
      const shippingRecord =
        anyOrder.shipping && typeof anyOrder.shipping === "object"
          ? (anyOrder.shipping as Record<string, unknown>)
          : {};
      const searchableText = normalizeTextForCompare(
        [
          order.id,
          order.userName,
          order.userEmail,
          anyOrder.userPhone,
          anyOrder.userCpf,
          shippingRecord.phone,
          shippingRecord.cpf,
          anyOrder.productName,
          anyOrder.product,
          order.shippingSelectedService,
          order.shippingSelectedCarrierName,
          order.carrier,
        ].join(" ")
      );
      const searchableDigits = normalizeDigits(
        [anyOrder.userPhone, anyOrder.userCpf, shippingRecord.phone, shippingRecord.cpf].join(" ")
      );
      const matchesQuery =
        !queryText || searchableText.includes(queryText) || (queryDigits ? searchableDigits.includes(queryDigits) : false);
      if (!matchesQuery) return false;

      if (ordersStatusFilter !== "todos" && formatOrderStatus(order) !== ordersStatusFilter) return false;

      if (ordersShippingFilter !== "todos") {
        const shippingText = normalizeTextForCompare(
          [order.shippingSelectedService, order.shippingSelectedServiceCode, order.shippingSelectedProvider, order.shippingSelectedCarrierName, order.carrier].join(
            " "
          )
        );
        if (ordersShippingFilter === "sedex" && !shippingText.includes("sedex")) return false;
        if (ordersShippingFilter === "pac" && !shippingText.includes("pac")) return false;
        if (ordersShippingFilter === "express_loggi" && !(shippingText.includes("loggi") || shippingText.includes("express"))) return false;
        if (ordersShippingFilter === "transportadora" && !shippingText.includes("transport")) return false;
      }

      return matchesPeriod(order.createdAt, ordersPeriodFilter);
    });

    nextRows.sort((a, b) => {
      if (ordersSort === "mais_antigo") return toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
      if (ordersSort === "maior_valor") return Number(b.amount || 0) - Number(a.amount || 0);
      if (ordersSort === "menor_valor") return Number(a.amount || 0) - Number(b.amount || 0);
      return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    });
    return nextRows;
  }, [ordersPeriodFilter, ordersRows, ordersSearch, ordersShippingFilter, ordersSort, ordersStatusFilter]);

  const filteredProducts = useMemo(() => {
    const query = normalizeTextForCompare(productsSearch);
    const nextRows = [...productsRows].filter((product) => {
      const matchesQuery =
        !query ||
        normalizeTextForCompare(
          [product.sku, product.name, product.category, product.collection, product.gender, ...(Array.isArray(product.colors) ? product.colors : [])].join(" ")
        ).includes(query);
      if (!matchesQuery) return false;
      if (productsStatusFilter === "ativo" && !product.active) return false;
      if (productsStatusFilter === "inativo" && product.active) return false;
      if (productsCategoryFilter !== "todos" && normalizeTextForCompare(product.category) !== normalizeTextForCompare(productsCategoryFilter)) {
        return false;
      }
      if (productsGenderFilter !== "todos" && normalizeTextForCompare(product.gender) !== normalizeTextForCompare(productsGenderFilter)) {
        return false;
      }
      if (
        productsSizeFilter !== "todos" &&
        !(Array.isArray(product.sizes) ? product.sizes.map((size) => normalizeTextForCompare(size)).includes(normalizeTextForCompare(productsSizeFilter)) : false)
      ) {
        return false;
      }
      if (productsStockFilter === "em_estoque" && Number(product.stock || 0) <= 0) return false;
      if (productsStockFilter === "esgotado" && Number(product.stock || 0) > 0) return false;
      return true;
    });

    nextRows.sort((a, b) => {
      if (productsSort === "nome_za") return String(b.name || "").localeCompare(String(a.name || ""));
      if (productsSort === "maior_preco") return Number(b.unitAmount || 0) - Number(a.unitAmount || 0);
      if (productsSort === "menor_preco") return Number(a.unitAmount || 0) - Number(b.unitAmount || 0);
      if (productsSort === "mais_recente") return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
    return nextRows;
  }, [
    productsCategoryFilter,
    productsGenderFilter,
    productsRows,
    productsSearch,
    productsSizeFilter,
    productsSort,
    productsStatusFilter,
    productsStockFilter,
  ]);

  const productCategoryOptions = useMemo(() => buildProductFieldOptions(productsRows, "category"), [productsRows]);
  const productCollectionOptions = useMemo(() => buildProductFieldOptions(productsRows, "collection"), [productsRows]);

  const filteredUsers = useMemo(() => {
    const queryText = normalizeTextForCompare(usersSearch);
    const queryDigits = normalizeDigits(usersSearch);
    const nextRows = [...usersRows].filter((user) => {
      const matchesText =
        !queryText || normalizeTextForCompare([user.name, user.email, user.cpf, user.phone, user.cep].join(" ")).includes(queryText);
      const matchesDigits =
        !queryDigits || normalizeDigits([user.cpf, user.phone, user.cep].join(" ")).includes(queryDigits);
      if (!matchesText && !matchesDigits) return false;
      if (usersStatusFilter !== "todos" && normalizeUserStatus(user.status) !== usersStatusFilter) return false;
      if (usersEmailFilter === "verificado" && !readUserEmailVerified(user)) return false;
      if (usersEmailFilter === "nao_verificado" && readUserEmailVerified(user)) return false;
      return matchesPeriod(user.createdAt, usersPeriodFilter);
    });

    nextRows.sort((a, b) => {
      if (usersSort === "mais_antigo") return toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
      if (usersSort === "nome_az") return String(a.name || "").localeCompare(String(b.name || ""));
      if (usersSort === "maior_total_gasto") {
        const left = readTotalSpentCents(a as unknown as Record<string, unknown>);
        const right = readTotalSpentCents(b as unknown as Record<string, unknown>);
        return right - left;
      }
      return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    });
    return nextRows;
  }, [usersEmailFilter, usersPeriodFilter, usersRows, usersSearch, usersSort, usersStatusFilter]);

  const filteredAppointmentSlots = useMemo(() => {
    const query = normalizeTextForCompare(careSearch);
    const nextRows = [...appointmentSlotRows].filter((row) => {
      const matchesQuery =
        !query ||
        normalizeTextForCompare([
          row.label,
          row.modality,
          row.location,
          row.adminNote,
          getAppointmentClients(row),
          ...(Array.isArray(row.appointments)
            ? row.appointments.flatMap((appointment) => [appointment.userName, appointment.userEmail, appointment.serviceType])
            : []),
        ].join(" ")).includes(query);
      if (!matchesQuery) return false;
      if (careStatusFilter !== "todos" && normalizeAppointmentSlotStatus(row.status) !== careStatusFilter) return false;
      return matchesPeriod(row.startsAt || row.createdAt, carePeriodFilter);
    });

    nextRows.sort((a, b) => {
      if (careSort === "mais_antigo") return toTimestamp(a.startsAt || a.createdAt) - toTimestamp(b.startsAt || b.createdAt);
      return toTimestamp(b.startsAt || b.createdAt) - toTimestamp(a.startsAt || a.createdAt);
    });
    return nextRows;
  }, [appointmentSlotRows, carePeriodFilter, careSearch, careSort, careStatusFilter]);

  const filteredVip = useMemo(() => {
    const queryText = normalizeTextForCompare(vipSearch);
    const queryDigits = normalizeDigits(vipSearch);
    const nextRows = [...vipRows].filter((row) => {
      const matchesText = !queryText || normalizeTextForCompare([row.name, row.email, row.phone].join(" ")).includes(queryText);
      const matchesDigits = !queryDigits || normalizeDigits(row.phone).includes(queryDigits);
      if (!matchesText && !matchesDigits) return false;
      return matchesPeriod(row.subscribedAt, vipPeriodFilter);
    });

    nextRows.sort((a, b) => {
      if (vipSort === "nome_az") return String(a.name || "").localeCompare(String(b.name || ""));
      if (vipSort === "maior_total_gasto") {
        const left = readTotalSpentCents(a as unknown as Record<string, unknown>);
        const right = readTotalSpentCents(b as unknown as Record<string, unknown>);
        return right - left;
      }
      return toTimestamp(b.subscribedAt) - toTimestamp(a.subscribedAt);
    });
    return nextRows;
  }, [vipPeriodFilter, vipRows, vipSearch, vipSort]);

  const filteredNewsletter = useMemo(() => {
    const query = normalizeTextForCompare(newsletterSearch);
    const nextRows = [...newsletterRows].filter((row) => {
      const anyRow = row as unknown as Record<string, unknown>;
      const matchesQuery = !query || normalizeTextForCompare([anyRow.name, row.email].join(" ")).includes(query);
      if (!matchesQuery) return false;
      return matchesPeriod(row.subscribedAt, newsletterPeriodFilter);
    });

    nextRows.sort((a, b) => {
      if (newsletterSort === "nome_az") {
        const aName = String((a as unknown as Record<string, unknown>).name || a.email || "");
        const bName = String((b as unknown as Record<string, unknown>).name || b.email || "");
        return aName.localeCompare(bName);
      }
      return toTimestamp(b.subscribedAt) - toTimestamp(a.subscribedAt);
    });
    return nextRows;
  }, [newsletterPeriodFilter, newsletterRows, newsletterSearch, newsletterSort]);

  const filteredCoupons = useMemo(() => {
    const query = normalizeTextForCompare(couponsSearch);
    const now = Date.now();
    const nextRows = [...couponsRows].filter((coupon) => {
      const matchesQuery = !query || normalizeTextForCompare([coupon.code, coupon.description].join(" ")).includes(query);
      if (!matchesQuery) return false;
      if (couponsStatusFilter === "ativo" && !coupon.active) return false;
      if (couponsStatusFilter === "inativo" && coupon.active) return false;
      if (couponsTypeFilter === "percentual" && coupon.type !== "percent") return false;
      if (couponsTypeFilter === "valor_fixo" && coupon.type !== "fixed") return false;

      const startsAt = toTimestamp(coupon.startsAt || null);
      const expiresAt = toTimestamp(coupon.expiresAt || null);
      if (couponsValidityFilter === "validos_agora") {
        const notStarted = startsAt > 0 && startsAt > now;
        const expired = expiresAt > 0 && expiresAt < now;
        if (notStarted || expired) return false;
      }
      if (couponsValidityFilter === "expirados" && !(expiresAt > 0 && expiresAt < now)) return false;
      if (couponsValidityFilter === "sem_data_definida" && expiresAt > 0) return false;
      return true;
    });

    nextRows.sort((a, b) => {
      if (couponsSort === "expiracao_mais_proxima") {
        const aExp = toTimestamp(a.expiresAt || null) || Number.MAX_SAFE_INTEGER;
        const bExp = toTimestamp(b.expiresAt || null) || Number.MAX_SAFE_INTEGER;
        return aExp - bExp;
      }
      if (couponsSort === "maior_desconto") {
        const aScore = a.type === "percent" ? Number(a.percentOff || 0) * 100 : Number(a.amountOffCents || 0);
        const bScore = b.type === "percent" ? Number(b.percentOff || 0) * 100 : Number(b.amountOffCents || 0);
        return bScore - aScore;
      }
      return toTimestamp(b.createdAt || null) - toTimestamp(a.createdAt || null);
    });
    return nextRows;
  }, [couponsRows, couponsSearch, couponsSort, couponsStatusFilter, couponsTypeFilter, couponsValidityFilter]);

  const filteredAudit = useMemo(() => {
    const query = normalizeTextForCompare(auditSearch);
    const nextRows = [...auditRows].filter((log) => {
      const matchesQuery = !query || normalizeTextForCompare([log.summary, log.actorEmail, log.action, log.entityType].join(" ")).includes(query);
      if (!matchesQuery) return false;
      if (auditEventFilter !== "todos" && normalizeAuditEventType(log.action) !== auditEventFilter) return false;
      return matchesPeriod(log.createdAt, auditPeriodFilter);
    });
    nextRows.sort((a, b) => {
      if (auditSort === "mais_antigo") return toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
      return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    });
    return nextRows;
  }, [auditEventFilter, auditPeriodFilter, auditRows, auditSearch, auditSort]);

  const orderFilterConfigs: FilterConfig[] = [
    {
      key: "status_pedidos",
      value: ordersStatusFilter,
      onChange: setOrdersStatusFilter,
      ariaLabel: "Filtrar pedidos por status",
      options: [
        { value: "todos", label: "Status: Todos" },
        { value: "pendente", label: "Pendente" },
        { value: "pago", label: "Pago" },
        { value: "enviado", label: "Enviado" },
        { value: "entregue", label: "Entregue" },
        { value: "cancelado", label: "Cancelado" },
        { value: "reembolsado", label: "Reembolsado" },
      ],
    },
    {
      key: "frete_pedidos",
      value: ordersShippingFilter,
      onChange: setOrdersShippingFilter,
      ariaLabel: "Filtrar pedidos por frete",
      options: [
        { value: "todos", label: "Frete: Todos" },
        { value: "sedex", label: "SEDEX" },
        { value: "pac", label: "PAC" },
        { value: "express_loggi", label: "Express — Loggi" },
        { value: "transportadora", label: "Transportadora" },
      ],
    },
    {
      key: "periodo_pedidos",
      value: ordersPeriodFilter,
      onChange: setOrdersPeriodFilter,
      ariaLabel: "Filtrar pedidos por periodo",
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "hoje", label: "Hoje" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
        { value: "ultimos_3_meses", label: "Últimos 3 meses" },
      ],
    },
  ];

  const orderSortOptions: SortOption[] = [
    {
      key: "ordenacao_pedidos",
      value: ordersSort,
      onChange: setOrdersSort,
      ariaLabel: "Ordenar pedidos",
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "mais_antigo", label: "Mais antigo" },
        { value: "maior_valor", label: "Maior valor" },
        { value: "menor_valor", label: "Menor valor" },
      ],
    },
  ];

  const productFilterConfigs: FilterConfig[] = [
    {
      key: "status_produtos",
      value: productsStatusFilter,
      onChange: setProductsStatusFilter,
      options: [
        { value: "todos", label: "Status: Todos" },
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" },
      ],
    },
    {
      key: "categoria_produtos",
      value: productsCategoryFilter,
      onChange: setProductsCategoryFilter,
      options: [
        { value: "todos", label: "Categoria: Todos" },
        { value: "calcas", label: "Calças" },
        { value: "blusas", label: "Blusas" },
        { value: "bolsas", label: "Bolsas" },
        { value: "cintos", label: "Cintos" },
        { value: "carteiras", label: "Carteiras" },
        { value: "jaquetas", label: "Jaquetas" },
      ],
    },
    {
      key: "genero_produtos",
      value: productsGenderFilter,
      onChange: setProductsGenderFilter,
      options: [
        { value: "todos", label: "Gênero: Todos" },
        { value: "masculino", label: "Masculino" },
        { value: "feminino", label: "Feminino" },
        { value: "unissex", label: "Unissex" },
      ],
    },
    {
      key: "tamanho_produtos",
      value: productsSizeFilter,
      onChange: setProductsSizeFilter,
      options: [
        { value: "todos", label: "Tamanho: Todos" },
        { value: "pp", label: "PP" },
        { value: "p", label: "P" },
        { value: "m", label: "M" },
        { value: "g", label: "G" },
        { value: "gg", label: "GG" },
        { value: "xg", label: "XG" },
        { value: "unico", label: "Único" },
      ],
    },
    {
      key: "estoque_produtos",
      value: productsStockFilter,
      onChange: setProductsStockFilter,
      options: [
        { value: "todos", label: "Estoque: Todos" },
        { value: "em_estoque", label: "Em estoque" },
        { value: "esgotado", label: "Esgotado" },
      ],
    },
  ];

  const productSortOptions: SortOption[] = [
    {
      key: "ordenacao_produtos",
      value: productsSort,
      onChange: setProductsSort,
      options: [
        { value: "nome_az", label: "Nome A–Z" },
        { value: "nome_za", label: "Nome Z–A" },
        { value: "maior_preco", label: "Maior preço" },
        { value: "menor_preco", label: "Menor preço" },
        { value: "mais_recente", label: "Mais recente" },
      ],
    },
  ];

  const userFilterConfigs: FilterConfig[] = [
    {
      key: "status_usuarios",
      value: usersStatusFilter,
      onChange: setUsersStatusFilter,
      options: [
        { value: "todos", label: "Status: Todos" },
        { value: "active", label: "Ativo" },
        { value: "suspended", label: "Suspenso" },
      ],
    },
    {
      key: "email_verificado_usuarios",
      value: usersEmailFilter,
      onChange: setUsersEmailFilter,
      options: [
        { value: "todos", label: "E-mail verificado: Todos" },
        { value: "verificado", label: "Verificado" },
        { value: "nao_verificado", label: "Não verificado" },
      ],
    },
    {
      key: "periodo_usuarios",
      value: usersPeriodFilter,
      onChange: setUsersPeriodFilter,
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
        { value: "ultimos_3_meses", label: "Últimos 3 meses" },
      ],
    },
  ];

  const userSortOptions: SortOption[] = [
    {
      key: "ordenacao_usuarios",
      value: usersSort,
      onChange: setUsersSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "mais_antigo", label: "Mais antigo" },
        { value: "nome_az", label: "Nome A–Z" },
        { value: "maior_total_gasto", label: "Maior total gasto" },
      ],
    },
  ];

  const couponFilterConfigs: FilterConfig[] = [
    {
      key: "status_cupons",
      value: couponsStatusFilter,
      onChange: setCouponsStatusFilter,
      options: [
        { value: "todos", label: "Status: Todos" },
        { value: "ativo", label: "Ativo" },
        { value: "inativo", label: "Inativo" },
      ],
    },
    {
      key: "tipo_cupons",
      value: couponsTypeFilter,
      onChange: setCouponsTypeFilter,
      options: [
        { value: "todos", label: "Tipo: Todos" },
        { value: "percentual", label: "Percentual" },
        { value: "valor_fixo", label: "Valor fixo" },
      ],
    },
    {
      key: "validade_cupons",
      value: couponsValidityFilter,
      onChange: setCouponsValidityFilter,
      options: [
        { value: "todos", label: "Validade: Todos" },
        { value: "validos_agora", label: "Válidos agora" },
        { value: "expirados", label: "Expirados" },
        { value: "sem_data_definida", label: "Sem data definida" },
      ],
    },
  ];

  const couponSortOptions: SortOption[] = [
    {
      key: "ordenacao_cupons",
      value: couponsSort,
      onChange: setCouponsSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "expiracao_mais_proxima", label: "Expiração mais próxima" },
        { value: "maior_desconto", label: "Maior desconto" },
      ],
    },
  ];

  const careFilterConfigs: FilterConfig[] = [
    {
      key: "status_atendimentos",
      value: careStatusFilter,
      onChange: setCareStatusFilter,
      options: [
        { value: "todos", label: "Status: Todos" },
        { value: "disponivel", label: "Disponivel" },
        { value: "com_agendamento", label: "Com agendamento" },
        { value: "lotado", label: "Lotado" },
        { value: "bloqueado", label: "Bloqueado" },
        { value: "indisponivel", label: "Indisponivel" },
      ],
    },
    {
      key: "periodo_atendimentos",
      value: carePeriodFilter,
      onChange: setCarePeriodFilter,
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "hoje", label: "Hoje" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
      ],
    },
  ];

  const careSortOptions: SortOption[] = [
    {
      key: "ordenacao_atendimentos",
      value: careSort,
      onChange: setCareSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "mais_antigo", label: "Mais antigo" },
      ],
    },
  ];

  const vipFilterConfigs: FilterConfig[] = [
    {
      key: "periodo_vip",
      value: vipPeriodFilter,
      onChange: setVipPeriodFilter,
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
        { value: "ultimos_3_meses", label: "Últimos 3 meses" },
      ],
    },
  ];

  const vipSortOptions: SortOption[] = [
    {
      key: "ordenacao_vip",
      value: vipSort,
      onChange: setVipSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "nome_az", label: "Nome A–Z" },
        { value: "maior_total_gasto", label: "Maior total gasto" },
      ],
    },
  ];

  const newsletterFilterConfigs: FilterConfig[] = [
    {
      key: "periodo_newsletter",
      value: newsletterPeriodFilter,
      onChange: setNewsletterPeriodFilter,
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
        { value: "ultimos_3_meses", label: "Últimos 3 meses" },
      ],
    },
  ];

  const newsletterSortOptions: SortOption[] = [
    {
      key: "ordenacao_newsletter",
      value: newsletterSort,
      onChange: setNewsletterSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "nome_az", label: "Nome A–Z" },
      ],
    },
  ];

  const auditFilterConfigs: FilterConfig[] = [
    {
      key: "tipo_evento_auditoria",
      value: auditEventFilter,
      onChange: setAuditEventFilter,
      options: [
        { value: "todos", label: "Tipo de evento: Todos" },
        { value: "login", label: "Login" },
        { value: "logout", label: "Logout" },
        { value: "criacao", label: "Criação" },
        { value: "edicao", label: "Edição" },
        { value: "exclusao", label: "Exclusão" },
        { value: "erro", label: "Erro" },
      ],
    },
    {
      key: "periodo_auditoria",
      value: auditPeriodFilter,
      onChange: setAuditPeriodFilter,
      options: [
        { value: "todos", label: "Período: Todos" },
        { value: "hoje", label: "Hoje" },
        { value: "esta_semana", label: "Esta semana" },
        { value: "este_mes", label: "Este mês" },
      ],
    },
  ];

  const auditSortOptions: SortOption[] = [
    {
      key: "ordenacao_auditoria",
      value: auditSort,
      onChange: setAuditSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "mais_antigo", label: "Mais antigo" },
      ],
    },
  ];

  function resetOrdersSearch() {
    setOrdersSearch("");
    setOrdersStatusFilter("todos");
    setOrdersShippingFilter("todos");
    setOrdersPeriodFilter("todos");
    setOrdersSort("mais_recente");
  }

  function resetProductsSearch() {
    setProductsSearch("");
    setProductsStatusFilter("todos");
    setProductsCategoryFilter("todos");
    setProductsGenderFilter("todos");
    setProductsSizeFilter("todos");
    setProductsStockFilter("todos");
    setProductsSort("nome_az");
  }

  function resetUsersSearch() {
    setUsersSearch("");
    setUsersStatusFilter("todos");
    setUsersEmailFilter("todos");
    setUsersPeriodFilter("todos");
    setUsersSort("mais_recente");
  }

  function resetCouponsSearch() {
    setCouponsSearch("");
    setCouponsStatusFilter("todos");
    setCouponsTypeFilter("todos");
    setCouponsValidityFilter("todos");
    setCouponsSort("mais_recente");
  }

  function resetCareSearch() {
    setCareSearch("");
    setCareStatusFilter("todos");
    setCarePeriodFilter("todos");
    setCareSort("mais_recente");
  }

  function resetVipSearch() {
    setVipSearch("");
    setVipPeriodFilter("todos");
    setVipSort("mais_recente");
  }

  function resetNewsletterSearch() {
    setNewsletterSearch("");
    setNewsletterPeriodFilter("todos");
    setNewsletterSort("mais_recente");
  }

  function resetAuditSearch() {
    setAuditSearch("");
    setAuditEventFilter("todos");
    setAuditPeriodFilter("todos");
    setAuditSort("mais_recente");
  }

  function buildNoResultsText(searchTerm: string): string {
    const normalized = String(searchTerm || "").trim();
    if (!normalized) return "Nenhum resultado encontrado.";
    return `Nenhum resultado encontrado para '${normalized}'.`;
  }

  useEffect(() => {
    if (!globalSearchTarget) return;
    if (globalSearchTarget.page !== page) return;

    if (globalSearchTarget.kind === "order") {
      const order = ordersRows.find((row) => String(row.id || "") === globalSearchTarget.id);
      if (order) {
        openOrderDrawer(order);
        onGlobalSearchTargetHandled?.();
      }
      return;
    }

    if (globalSearchTarget.kind === "product") {
      const product = productsRows.find((row) => {
        const key = getProductKey(row);
        return key === globalSearchTarget.id || String(row.sku || "") === globalSearchTarget.id;
      });
      if (product) {
        openProductDrawer(product);
        onGlobalSearchTargetHandled?.();
      }
      return;
    }

    if (globalSearchTarget.kind === "user") {
      const user = usersRows.find((row) => String(row.id || "") === globalSearchTarget.id);
      if (user) {
        openUserDrawer(user);
        onGlobalSearchTargetHandled?.();
      }
      return;
    }

    if (globalSearchTarget.kind === "coupon") {
      const coupon = couponsRows.find((row) => String(row.code || "") === globalSearchTarget.id);
      if (coupon) {
        openCouponDrawer(coupon);
        onGlobalSearchTargetHandled?.();
      }
    }
  }, [
    couponsRows,
    globalSearchTarget,
    onGlobalSearchTargetHandled,
    ordersRows,
    page,
    productsRows,
    usersRows,
  ]);

  const handleUserRowUpdated = (nextUser: AdminUserRow) => {
    setUsersRows((current) => current.map((row) => (row.id === nextUser.id ? { ...row, ...nextUser } : row)));
    setSelectedUser((current) => (current && current.id === nextUser.id ? { ...current, ...nextUser } : current));
  };

  const handleUserDeleted = (userId: string) => {
    setUsersRows((current) => current.filter((row) => row.id !== userId));
    setSelectedUser((current) => (current?.id === userId ? null : current));
    onRequestRefresh?.();
  };

  const handleProductSaved = (nextProduct: Product) => {
    const nextKey = getProductKey(nextProduct);
    setProductsRows((current) =>
      current.map((row) => {
        const rowKey = getProductKey(row);
        return rowKey && rowKey === nextKey ? { ...row, ...nextProduct } : row;
      })
    );
    setSelectedProduct((current) => {
      if (!current) return current;
      const currentKey = getProductKey(current);
      return currentKey && currentKey === nextKey ? { ...current, ...nextProduct } : current;
    });
    showToast("Produto atualizado.");
    onRequestRefresh?.();
  };

  const handleOrderSaved = (nextOrder: Order) => {
    const targetId = String(nextOrder.id || "").trim();
    setOrdersRows((current) =>
      current.map((row) => {
        if (String(row.id || "").trim() !== targetId) return row;
        return toSummaryFromOrder(row, nextOrder);
      })
    );
    setSelectedOrder((current) => {
      if (!current) return current;
      if (String(current.id || "").trim() !== targetId) return current;
      return toSummaryFromOrder(current, nextOrder);
    });
    showToast("Pedido atualizado.");
    onRequestRefresh?.();
  };

  const handleCouponSaved = (nextCoupon: Coupon) => {
    setCouponsRows((current) => {
      const selectedCode = String(selectedCoupon?.code || "").trim().toLowerCase();
      let replaced = false;
      const nextRows = current.map((row) => {
        const rowCode = String(row.code || "").trim().toLowerCase();
        if (rowCode === selectedCode) {
          replaced = true;
          return nextCoupon;
        }
        return row;
      });
      return replaced ? nextRows : [nextCoupon, ...nextRows];
    });
    setSelectedCoupon(nextCoupon);
    showToast("Cupom atualizado.");
    onRequestRefresh?.();
  };

  const handleAppointmentSlotSaved = () => {
    closeAppointmentDrawer();
    showToast("Horario salvo.");
    onRequestRefresh?.();
  };

  const handleAppointmentStatusToggle = async (slot: AdminAppointmentSlot, patch: { isAvailable?: boolean; isBlocked?: boolean }) => {
    try {
      const response = await updateAppointmentSlotAdmin(slot.id, patch);
      setAppointmentSlotRows((current) => current.map((row) => (String(row.id || "") === String(slot.id || "") ? response.slot : row)));
      showToast("Horario atualizado.");
      onRequestRefresh?.();
    } catch (error) {
      showToast(pickErrorMessage(error));
    }
  };

  const openDeleteConfirm = (target: ConfirmDeleteTarget) => {
    setConfirmTarget(target);
  };

  const closeDeleteConfirm = () => {
    if (confirmLoading) return;
    setConfirmTarget(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;

    setConfirmLoading(true);
    try {
      if (confirmTarget.kind === "coupon") {
        await deleteCouponAdmin(confirmTarget.id);
        setCouponsRows((current) => current.filter((row) => String(row.code || "") !== confirmTarget.id));
        showToast("Cupom excluido.");
      }

      if (confirmTarget.kind === "appointment_slot") {
        await deleteAppointmentSlotAdmin(confirmTarget.id);
        setAppointmentSlotRows((current) => current.filter((row) => String(row.id || "") !== confirmTarget.id));
        showToast("Horario excluido.");
      }

      if (confirmTarget.kind === "vip") {
        await deleteVipAdmin(confirmTarget.id);
        setVipRows((current) => current.filter((row) => String(row.id) !== confirmTarget.id));
        showToast("Cadastro removido da Lista VIP.");
      }

      if (confirmTarget.kind === "newsletter") {
        await deleteNewsletterAdmin(confirmTarget.id);
        setNewsletterRows((current) => current.filter((row) => String(row.id || "") !== confirmTarget.id));
        showToast("Inscrito removido da Newsletter.");
      }

      setConfirmTarget(null);
      onRequestRefresh?.();
    } catch (error) {
      showToast(pickErrorMessage(error));
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <section className={styles.panel}>
      {errorMessage ? <p className={styles.warning}>{errorMessage}</p> : null}
      {loading ? <p className={styles.loading}>Carregando dados reais...</p> : null}

      {page === "pedidos" ? (
        <>
          <SearchBar
            placeholder="Buscar por pedido, cliente, e-mail, telefone, CPF ou produto"
            value={ordersSearch}
            onChange={setOrdersSearch}
            filters={orderFilterConfigs}
            sortOptions={orderSortOptions}
            resultsCount={filteredOrders.length}
            onClear={resetOrdersSearch}
          />
          {filteredOrders.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Status</th>
                    <th>Total</th>
                    <th>Criado em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.slice(0, 200).map((order) => (
                    <tr key={order.id}>
                      <td>{pickOrderId(order)}</td>
                      <td>{order.userName || order.userEmail || "-"}</td>
                      <td>{formatOrderStatus(order)}</td>
                      <td>{formatMoneyCents(order.amount, order.currency)}</td>
                      <td>{formatDateTime(order.createdAt)}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.btnEdit} onClick={() => openOrderDrawer(order)}>
                          <PencilLine size={12} /> Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(ordersSearch)}</p>
          )}
        </>
      ) : null}

      {page === "produtos" ? (
        <>
          <SearchBar
            placeholder="Buscar por SKU, nome, categoria, coleção ou cor"
            value={productsSearch}
            onChange={setProductsSearch}
            filters={productFilterConfigs}
            sortOptions={productSortOptions}
            resultsCount={filteredProducts.length}
            onClear={resetProductsSearch}
          />
          {filteredProducts.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Produto</th>
                    <th>Preco</th>
                    <th>Estoque</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.slice(0, 200).map((product) => (
                    <tr key={product.dbId || product.id || product.sku}>
                      <td>{product.sku || "-"}</td>
                      <td>{product.name || "-"}</td>
                      <td>{formatMoneyCents(product.unitAmount, product.currency)}</td>
                      <td>{Number(product.stock || 0)}</td>
                      <td>{product.active ? "active" : "inactive"}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.btnEdit} onClick={() => openProductDrawer(product)}>
                          <PencilLine size={12} /> Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(productsSearch)}</p>
          )}
        </>
      ) : null}

      {page === "usuarios" ? (
        <>
          <SearchBar
            placeholder="Buscar por nome, e-mail, CPF, telefone ou CEP"
            value={usersSearch}
            onChange={setUsersSearch}
            filters={userFilterConfigs}
            sortOptions={userSortOptions}
            resultsCount={filteredUsers.length}
            onClear={resetUsersSearch}
          />
          {filteredUsers.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Ultimo login</th>
                    <th>Criado em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.slice(0, 200).map((user) => (
                    <tr key={user.id}>
                      <td>{user.name || "-"}</td>
                      <td>{user.email || "-"}</td>
                      <td>{normalizeUserStatus(user.status)}</td>
                      <td>{formatDateTime(user.lastLoginAt)}</td>
                      <td>{formatDateTime(user.createdAt)}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.btnDetalhes} onClick={() => openUserDrawer(user)}>
                          Detalhes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(usersSearch)}</p>
          )}
        </>
      ) : null}

      {page === "atendimentos" ? (
        <PrivateCareManager rows={data.appointmentSlots} csrfToken={csrfToken} />
      ) : null}

      {page === "reparos" ? (
        <RepairRequestsManager
          rows={repairRows}
          loading={loading}
          errorMessage={errorMessage}
          csrfToken={csrfToken}
          onRowsChange={setRepairRows}
          onRequestRefresh={onRequestRefresh}
        />
      ) : null}

      {page === "lista_vip" ? (
        <>
          <SearchBar
            placeholder="Buscar por nome, e-mail ou telefone"
            value={vipSearch}
            onChange={setVipSearch}
            filters={vipFilterConfigs}
            sortOptions={vipSortOptions}
            resultsCount={filteredVip.length}
            onClear={resetVipSearch}
          />
          {filteredVip.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Telefone</th>
                    <th>Origem</th>
                    <th>Inscrito em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVip.slice(0, 200).map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name || "-"}</td>
                      <td>{entry.email || "-"}</td>
                      <td>{entry.phone || "-"}</td>
                      <td>{entry.source || "-"}</td>
                      <td>{formatDateTime(entry.subscribedAt)}</td>
                      <td className={styles.actionCell}>
                        <button
                          className={styles.btnDelete}
                          onClick={() =>
                            openDeleteConfirm({
                              kind: "vip",
                              id: String(entry.id),
                              label: String(entry.name || entry.email || "inscrito"),
                            })
                          }
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(vipSearch)}</p>
          )}
        </>
      ) : null}

      {page === "newsletter" ? (
        <>
          <SearchBar
            placeholder="Buscar por nome ou e-mail"
            value={newsletterSearch}
            onChange={setNewsletterSearch}
            filters={newsletterFilterConfigs}
            sortOptions={newsletterSortOptions}
            resultsCount={filteredNewsletter.length}
            onClear={resetNewsletterSearch}
          />
          {filteredNewsletter.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Telefone</th>
                    <th>Status</th>
                    <th>Origem</th>
                    <th>Inscrito em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNewsletter.slice(0, 200).map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.email || "-"}</td>
                      <td>{entry.phone || "-"}</td>
                      <td>{entry.status || "-"}</td>
                      <td>{entry.source || "-"}</td>
                      <td>{formatDateTime(entry.subscribedAt)}</td>
                      <td className={styles.actionCell}>
                        <button
                          className={styles.btnDelete}
                          onClick={() =>
                            openDeleteConfirm({
                              kind: "newsletter",
                              id: String(entry.id || ""),
                              label: String(entry.email || "inscrito"),
                            })
                          }
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(newsletterSearch)}</p>
          )}
        </>
      ) : null}

      {page === "cupons" ? (
        <>
          <SearchBar
            placeholder="Buscar por código ou descrição"
            value={couponsSearch}
            onChange={setCouponsSearch}
            filters={couponFilterConfigs}
            sortOptions={couponSortOptions}
            resultsCount={filteredCoupons.length}
            onClear={resetCouponsSearch}
          />
          {filteredCoupons.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Codigo</th>
                    <th>Tipo</th>
                    <th>Regra</th>
                    <th>Ativo</th>
                    <th>Expira em</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCoupons.slice(0, 200).map((coupon) => (
                    <tr key={coupon.code}>
                      <td>{coupon.code || "-"}</td>
                      <td>{coupon.type || "-"}</td>
                      <td>{formatCouponRule(coupon)}</td>
                      <td>{coupon.active ? "sim" : "não"}</td>
                      <td>{formatDateTime(coupon.expiresAt || null)}</td>
                      <td className={styles.actionCell}>
                        <button className={styles.btnEdit} onClick={() => openCouponDrawer(coupon)}>
                          <PencilLine size={12} /> Editar
                        </button>
                        <button
                          className={styles.btnDelete}
                          onClick={() =>
                            openDeleteConfirm({
                              kind: "coupon",
                              id: String(coupon.code || ""),
                              label: String(coupon.code || "cupom"),
                            })
                          }
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(couponsSearch)}</p>
          )}
        </>
      ) : null}

      {page === "auditoria" ? (
        <>
          <SearchBar
            placeholder="Buscar por descrição, usuário ou tipo de evento"
            value={auditSearch}
            onChange={setAuditSearch}
            filters={auditFilterConfigs}
            sortOptions={auditSortOptions}
            resultsCount={filteredAudit.length}
            onClear={resetAuditSearch}
          />
          {filteredAudit.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Acao</th>
                    <th>Entidade</th>
                    <th>Resumo</th>
                    <th>Ator</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAudit.slice(0, 200).map((log) => (
                    <tr key={log.id}>
                      <td>{log.action || "-"}</td>
                      <td>{log.entityType || "-"}</td>
                      <td>{log.summary || "-"}</td>
                      <td>{log.actorEmail || "-"}</td>
                      <td>{formatDateTime(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className={styles.noResults}>{buildNoResultsText(auditSearch)}</p>
          )}
        </>
      ) : null}

      {page === "notificacoes" ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Título</th>
                <th>Mensagem</th>
                <th>Destinatários</th>
                <th>Enviados</th>
                <th>Enviado em</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className={styles.noResults}>
                  Nenhuma notificação enviada ainda. Use o botão acima para enviar.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {page === "usuarios" ? (
        <DrawerDetalhesUsuario
          isOpen={isUserDrawerOpen}
          user={selectedUser}
          isEditing={isEditingUser}
          onSetEditing={setIsEditingUser}
          onClose={closeUserDrawer}
          onToast={showToast}
          onUserRowUpdated={handleUserRowUpdated}
          onUserDeleted={handleUserDeleted}
          onRequestRefresh={onRequestRefresh}
        />
      ) : null}

      {page === "produtos" ? (
        <DrawerEditarProduto
          isOpen={isProductDrawerOpen}
          product={selectedProduct}
          categoryOptions={productCategoryOptions}
          collectionOptions={productCollectionOptions}
          onClose={closeProductDrawer}
          onSaved={handleProductSaved}
        />
      ) : null}

      {page === "pedidos" ? (
        <DrawerEditarPedido
          isOpen={isOrderDrawerOpen}
          order={selectedOrder}
          onClose={closeOrderDrawer}
          onSaved={handleOrderSaved}
        />
      ) : null}

      {page === "cupons" ? (
        <DrawerEditarCupom
          isOpen={isCouponDrawerOpen}
          coupon={selectedCoupon}
          onClose={closeCouponDrawer}
          onSaved={handleCouponSaved}
        />
      ) : null}

      {page === "atendimentos" ? (
        <DrawerNovoAtendimento
          isOpen={isAppointmentDrawerOpen}
          slot={selectedAppointmentSlot}
          onClose={closeAppointmentDrawer}
          onSaved={handleAppointmentSlotSaved}
        />
      ) : null}

      <ConfirmModal
        isOpen={Boolean(confirmTarget)}
        title={confirmTarget ? getDeleteContent(confirmTarget).title : ""}
        text={confirmTarget ? getDeleteContent(confirmTarget).text : ""}
        confirmLabel={confirmTarget ? getDeleteContent(confirmTarget).confirmLabel : "Confirmar"}
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={closeDeleteConfirm}
        loading={confirmLoading}
        danger={true}
      />

      <Toast message={toastMessage} visible={toastVisible} />
    </section>
  );
}
