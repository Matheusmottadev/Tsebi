"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/admin/Drawer";
import { SearchBar, type FilterConfig, type SortOption } from "@/components/studio/panel/SearchBar";
import type { AdminModulePermission } from "@/types";
import {
  approveBalanceRequestAdmin,
  createDirectoriaAdmin,
  getDirectoriaBalanceRequest,
  listDirectoriaAdmins,
  listDirectoriaAuditLogs,
  listDirectoriaBalanceRequests,
  updateDirectoriaAdminPermissions,
  updateDirectoriaAdminRole,
  updateDirectoriaAdminStatus,
  rejectBalanceRequestAdmin,
  type AdminAccessRow,
  type BalanceRequestRow,
  type OpsAuditLogRow,
} from "@/services/admin";
import type { AdminPageKey } from "../types";
import styles from "./ConnectedPage.module.css";

const MODULES: Array<{ key: "balance" | "orders" | "users" | "products"; label: string }> = [
  { key: "balance", label: "Saldo" },
  { key: "orders", label: "Pedidos" },
  { key: "users", label: "Usuários" },
  { key: "products", label: "Produtos" },
];

const drawerLabelColor = "#64748b";
const drawerMutedTextColor = "#6b7280";
const drawerFieldBorder = "#d8e1ec";
const drawerFieldBackground = "#ffffff";
const drawerFieldDisabledBackground = "#f3f6fb";
const drawerOptionBorder = "#dbe4f0";
const drawerOptionBackground = "#f8fbff";

function formatRoleLabel(role: "admin" | "director" | "superadmin" | string): string {
  if (role === "superadmin") return "Diretoria";
  if (role === "director") return "Gerente";
  return "Admin";
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents || 0) || 0) / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatDateTime(value: string | null): string {
  return formatDate(value);
}

function normalizeTextForCompare(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isToday(date: Date): boolean {
  const now = new Date();
  return date.getDate() === now.getDate() && date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(now.getDate() - diff);
  return date.getTime() >= weekStart.getTime();
}

function isThisMonth(date: Date): boolean {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function matchesPeriod(dateValue: string | null | undefined, period: string): boolean {
  if (period === "todos") return true;
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  if (period === "hoje") return isToday(date);
  if (period === "esta_semana") return isThisWeek(date);
  if (period === "este_mes") return isThisMonth(date);
  return true;
}

function formatAdminMutationError(error: any, fallback: string): string {
  const raw = String(error?.message || "").trim();
  if (!raw) return fallback;
  if (raw.includes("INVALID_INPUT")) return "Preencha um e-mail válido para continuar.";
  if (raw.includes("SUPERADMIN_CREATE_FORBIDDEN")) return "Apenas a Diretoria pode criar outro perfil de Diretoria.";
  if (raw.includes("ADMIN_CREATE_FAILED")) return "Não foi possível cadastrar este admin agora. Tente novamente em alguns segundos.";
  if (raw.includes("ADMIN_ROLE_UPDATE_FAILED")) return "Não foi possível atualizar o cargo deste admin agora.";
  if (raw.includes("ADMIN_STATUS_UPDATE_FAILED")) return "Não foi possível alterar o status deste admin agora.";
  if (raw.includes("ADMIN_PERMISSIONS_UPDATE_FAILED")) return "Não foi possível salvar as permissões agora.";
  if (raw.includes("SELF_ROLE_CHANGE_FORBIDDEN")) return "Por segurança, você não pode alterar o seu próprio cargo por esta tela.";
  return raw;
}

function arraysEqual(a: string[], b: string[]) {
  const left = [...a].sort();
  const right = [...b].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function statusBadge(status: BalanceRequestRow["status"]) {
  if (status === "approved") return { background: "#ebf6ef", color: "#245b33", label: "Aprovada" };
  if (status === "rejected") return { background: "#fbecec", color: "#8d2727", label: "Rejeitada" };
  return { background: "#eef4ff", color: "#315ea8", label: "Pendente" };
}

function formatApprovalReason(reason: BalanceRequestRow["reason"]) {
  if (reason === "product_return") return "Devolução de produto";
  if (reason === "billing_error") return "Erro de cobrança";
  if (reason === "courtesy") return "Cortesia";
  if (reason === "manual_adjustment") return "Ajuste manual";
  return "Outro motivo";
}

function formatApprovalActionError(error: any, fallback: string) {
  const raw = String(error?.message || "").trim();
  if (!raw) return fallback;
  if (raw.includes("REQUEST_ALREADY_REVIEWED")) {
    return "Essa solicitação já foi analisada por outra pessoa.";
  }
  if (raw.includes("INSUFFICIENT_CUSTOMER_BALANCE")) {
    return "O cliente não tem saldo suficiente para esta remoção.";
  }
  return raw;
}

function formatOpsAuditActionLabel(action: string): string {
  const normalized = String(action || "").trim().toUpperCase();
  if (normalized === "ADMIN_CREATED") return "Admin criado";
  if (normalized === "ADMIN_ROLE_UPDATED") return "Cargo alterado";
  if (normalized === "ADMIN_PERMISSIONS_UPDATED") return "Permissões alteradas";
  if (normalized === "ADMIN_STATUS_UPDATED") return "Status alterado";
  if (normalized === "BALANCE_REQUESTED") return "Solicitação criada";
  if (normalized === "BALANCE_APPROVED") return "Saldo aprovado";
  if (normalized === "BALANCE_REJECTED") return "Saldo rejeitado";
  if (normalized === "ADMIN_SUSPICIOUS_LOGIN") return "Login suspeito";
  if (normalized === "ADMIN_SUSPICIOUS_ACCESS") return "Acesso suspeito";
  return String(action || "Evento").replace(/_/g, " ").toLowerCase();
}

function formatOpsAuditEntityLabel(targetType: string | null): string {
  const normalized = String(targetType || "").trim().toLowerCase();
  if (normalized === "balance_request") return "Solicitação de saldo";
  if (normalized === "admin") return "Admin";
  if (normalized === "admin_security") return "Segurança";
  if (!normalized) return "-";
  return normalized.replace(/_/g, " ");
}

function readOpsAuditMetaString(row: OpsAuditLogRow, key: string): string {
  const value = row.metadata?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function formatOpsAuditOrigin(row: OpsAuditLogRow): string {
  const route = readOpsAuditMetaString(row, "route");
  const ip = readOpsAuditMetaString(row, "ip") || readOpsAuditMetaString(row, "sourceIp");
  if (route && ip) return `${route} • ${ip}`;
  return route || ip || "-";
}

function buildOpsAuditSummary(row: OpsAuditLogRow): string {
  const before = row.beforeState && typeof row.beforeState === "object" ? (row.beforeState as Record<string, any>) : null;
  const after = row.afterState && typeof row.afterState === "object" ? (row.afterState as Record<string, any>) : null;
  const request = (after?.request || after || before?.request || before) as Record<string, any> | null;

  if (row.action === "BALANCE_REQUESTED" || row.action === "BALANCE_APPROVED" || row.action === "BALANCE_REJECTED") {
    const customer = String(request?.customerName || request?.customerEmail || "").trim() || "cliente";
    const amount = Number(request?.amount || 0);
    const type = request?.type === "debit" ? "remoção" : "adição";
    const amountLabel = amount > 0 ? formatMoney(Math.round(amount * 100)) : "";
    return `${type} de saldo${amountLabel ? ` de ${amountLabel}` : ""} para ${customer}`;
  }

  if (row.action === "ADMIN_CREATED") {
    const email = String(after?.email || "").trim();
    const role = String(after?.role || "").trim();
    return email ? `${email} criado como ${formatRoleLabel(role)}` : "Novo admin cadastrado";
  }

  if (row.action === "ADMIN_ROLE_UPDATED") {
    const role = String(after?.role || "").trim();
    return role ? `Cargo ajustado para ${formatRoleLabel(role)}` : "Cargo do admin atualizado";
  }

  if (row.action === "ADMIN_PERMISSIONS_UPDATED") {
    const permissions = Array.isArray(after?.permissions) ? after.permissions : [];
    return permissions.length ? `Módulos liberados: ${permissions.join(", ")}` : "Permissões do admin atualizadas";
  }

  if (row.action === "ADMIN_STATUS_UPDATED") {
    if (typeof after?.isActive === "boolean") {
      return after.isActive ? "Admin reativado" : "Admin desativado";
    }
    return "Status do admin atualizado";
  }

  if (row.action === "ADMIN_SUSPICIOUS_LOGIN" || row.action === "ADMIN_SUSPICIOUS_ACCESS") {
    return String(after?.message || after?.title || "").trim() || "Atividade suspeita registrada";
  }

  const targetLabel = formatOpsAuditEntityLabel(row.targetType);
  const targetId = row.targetId ? ` #${row.targetId.slice(0, 8)}` : "";
  return `${targetLabel}${targetId}`;
}

const SECURITY_AUDIT_ACTIONS = new Set([
  "ADMIN_SUSPICIOUS_LOGIN",
  "ADMIN_SUSPICIOUS_ACCESS",
  "ADMIN_CREATED",
  "ADMIN_ROLE_UPDATED",
  "ADMIN_PERMISSIONS_UPDATED",
  "ADMIN_STATUS_UPDATED",
  "BALANCE_APPROVED",
  "BALANCE_REJECTED",
]);

function getAuditSeverity(action: string): { label: string; color: string; background: string; border: string } {
  const normalized = String(action || "").trim().toUpperCase();
  if (normalized.startsWith("ADMIN_SUSPICIOUS_")) {
    return { label: "Crítico", color: "#991b1b", background: "#fef2f2", border: "#fecaca" };
  }
  if (["ADMIN_CREATED", "ADMIN_ROLE_UPDATED", "ADMIN_PERMISSIONS_UPDATED", "ADMIN_STATUS_UPDATED"].includes(normalized)) {
    return { label: "Alto", color: "#9a3412", background: "#fff7ed", border: "#fed7aa" };
  }
  if (["BALANCE_APPROVED", "BALANCE_REJECTED", "BALANCE_REQUESTED"].includes(normalized)) {
    return { label: "Médio", color: "#1d4ed8", background: "#eff6ff", border: "#bfdbfe" };
  }
  return { label: "Normal", color: "#475569", background: "#f8fafc", border: "#cbd5e1" };
}

function isSensitiveAuditAction(action: string): boolean {
  return SECURITY_AUDIT_ACTIONS.has(String(action || "").trim().toUpperCase());
}

type ApprovalToastState = {
  message: string;
  customerId: string | null;
};

export function DiretoriaPage({
  csrfToken,
  refreshKey = 0,
  onNavigatePage,
  onOpenBalanceCustomer,
  focusTarget,
  onFocusTargetHandled,
}: {
  csrfToken?: string;
  refreshKey?: number;
  onNavigatePage?: (page: AdminPageKey) => void;
  onOpenBalanceCustomer?: (customerId: string) => void;
  focusTarget?: { kind: "admin" | "balance_request"; id: string } | null;
  onFocusTargetHandled?: () => void;
}) {
  const [tab, setTab] = useState<"admins" | "approvals" | "audit">("admins");
  const [admins, setAdmins] = useState<AdminAccessRow[]>([]);
  const [requests, setRequests] = useState<BalanceRequestRow[]>([]);
  const [auditRows, setAuditRows] = useState<OpsAuditLogRow[]>([]);
  const [adminSearch, setAdminSearch] = useState("");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [accessDrawerMode, setAccessDrawerMode] = useState<"create" | "edit" | null>(null);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccessRow | null>(null);
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<"admin" | "director" | "superadmin">("admin");
  const [formModules, setFormModules] = useState<AdminModulePermission[]>([]);
  const [formIsActive, setFormIsActive] = useState(true);
  const [message, setMessage] = useState("");
  const [requestStatusFilter, setRequestStatusFilter] = useState("todos");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestDateFrom, setRequestDateFrom] = useState("");
  const [requestDateTo, setRequestDateTo] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<BalanceRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [requestActionLoading, setRequestActionLoading] = useState<"approve" | "reject" | null>(null);
  const [highlightedRequestId, setHighlightedRequestId] = useState("");
  const [approvalToast, setApprovalToast] = useState<ApprovalToastState | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditSecurityFilter, setAuditSecurityFilter] = useState("all");
  const [auditPeriodFilter, setAuditPeriodFilter] = useState("todos");
  const [auditSort, setAuditSort] = useState("mais_recente");
  const highlightTimerRef = useRef<number | null>(null);
  const approvalToastTimerRef = useRef<number | null>(null);

  async function loadAdmins() {
    try {
      const response = await listDirectoriaAdmins({ cache: "no-store" });
      setAdmins(Array.isArray(response.rows) ? response.rows : []);
    } catch {
      setAdmins([]);
    }
  }

  async function loadRequests() {
    try {
      const response = await listDirectoriaBalanceRequests(
        {
          status: requestStatusFilter === "todos" ? "" : requestStatusFilter,
          requestedBy: requesterFilter,
          dateFrom: requestDateFrom,
          dateTo: requestDateTo,
          page: 1,
          limit: 100,
        },
        { cache: "no-store" }
      );
      setRequests(Array.isArray(response.rows) ? response.rows : []);
    } catch {
      setRequests([]);
    }
  }

  async function loadAudit() {
    try {
      const response = await listDirectoriaAuditLogs(
        {
          securityOnly: auditSecurityFilter === "security_only",
          page: 1,
          limit: 100,
        },
        { cache: "no-store" }
      );
      setAuditRows(Array.isArray(response.rows) ? response.rows : []);
    } catch {
      setAuditRows([]);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, [refreshKey]);

  useEffect(() => {
    if (tab === "approvals") {
      loadRequests();
    }
    if (tab === "audit") {
      loadAudit();
    }
  }, [tab, requestStatusFilter, requestDateFrom, requestDateTo, requesterFilter, auditSecurityFilter, refreshKey]);

  useEffect(() => {
    if (!focusTarget?.id) return;

    if (focusTarget.kind === "admin") {
      setTab("admins");
      const admin = admins.find((row) => String(row.id || "") === focusTarget.id);
      if (admin) {
        openEditDrawer(admin);
        onFocusTargetHandled?.();
      }
      return;
    }

    if (focusTarget.kind === "balance_request") {
      setTab("approvals");
      const request = requests.find((row) => String(row.id || "") === focusTarget.id);
      if (request) {
        setSelectedRequest(request);
        setRejectReason(request.rejectionReason || "");
        onFocusTargetHandled?.();
      } else {
        getDirectoriaBalanceRequest(focusTarget.id, { cache: "no-store" })
          .then((response) => {
            setSelectedRequest(response.request || null);
            setRejectReason(response.request?.rejectionReason || "");
            onFocusTargetHandled?.();
          })
          .catch(() => {
            setMessage("Não foi possível abrir essa solicitação de saldo.");
            onFocusTargetHandled?.();
          });
      }
    }
  }, [admins, focusTarget, onFocusTargetHandled, requests]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      if (approvalToastTimerRef.current) clearTimeout(approvalToastTimerRef.current);
    },
    []
  );

  function pulseRequestRow(requestId: string) {
    setHighlightedRequestId(requestId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedRequestId("");
      highlightTimerRef.current = null;
    }, 2400);
  }

  function showApprovalToast(message: string, customerId: string | null) {
    setApprovalToast({ message, customerId });
    if (approvalToastTimerRef.current) clearTimeout(approvalToastTimerRef.current);
    approvalToastTimerRef.current = window.setTimeout(() => {
      setApprovalToast(null);
      approvalToastTimerRef.current = null;
    }, 5000);
  }

  async function handleCreateAdmin() {
    if (!formEmail.trim()) {
      setMessage("Digite o e-mail do admin antes de criar.");
      return;
    }
    setSavingAdmin(true);
    setMessage("");
    try {
      if (accessDrawerMode === "create") {
        await createDirectoriaAdmin(
          { email: formEmail.trim(), role: formRole, modules: formModules },
          csrfToken,
          { cache: "no-store" }
        );
        setMessage("Admin cadastrado com sucesso.");
      } else if (editingAdmin) {
        const tasks: Promise<unknown>[] = [];
        if (formRole !== editingAdmin.role) {
          tasks.push(updateDirectoriaAdminRole(editingAdmin.id, { role: formRole }, csrfToken, { cache: "no-store" }));
        }
        if (!arraysEqual(formModules, Array.isArray(editingAdmin.permissions) ? editingAdmin.permissions : [])) {
          tasks.push(updateDirectoriaAdminPermissions(editingAdmin.id, { modules: formModules }, csrfToken, { cache: "no-store" }));
        }
        if (formIsActive !== Boolean(editingAdmin.isActive)) {
          tasks.push(updateDirectoriaAdminStatus(editingAdmin.id, { isActive: formIsActive }, csrfToken, { cache: "no-store" }));
        }
        await Promise.all(tasks);
        setMessage("Acesso do admin atualizado com sucesso.");
      }
      setAccessDrawerMode(null);
      setEditingAdmin(null);
      setFormEmail("");
      setFormRole("admin");
      setFormModules([]);
      setFormIsActive(true);
      await loadAdmins();
    } catch (error: any) {
      setMessage(formatAdminMutationError(error, accessDrawerMode === "create" ? "Não foi possível criar o admin." : "Não foi possível atualizar o admin."));
    } finally {
      setSavingAdmin(false);
    }
  }

  function openCreateDrawer() {
    setEditingAdmin(null);
    setAccessDrawerMode("create");
    setFormEmail("");
    setFormRole("admin");
    setFormModules([]);
    setFormIsActive(true);
    setMessage("");
  }

  function openEditDrawer(row: AdminAccessRow) {
    setEditingAdmin(row);
    setAccessDrawerMode("edit");
    setFormEmail(row.email || "");
    setFormRole((row.role || "admin") as "admin" | "director" | "superadmin");
    setFormModules(Array.isArray(row.permissions) ? row.permissions : []);
    setFormIsActive(Boolean(row.isActive));
    setMessage("");
  }

  async function handleToggleStatus(row: AdminAccessRow) {
    try {
      await updateDirectoriaAdminStatus(row.id, { isActive: !row.isActive }, csrfToken, { cache: "no-store" });
      setMessage(row.isActive ? "Admin desativado com sucesso." : "Admin reativado com sucesso.");
      await loadAdmins();
    } catch (error: any) {
      setMessage(formatAdminMutationError(error, "Não foi possível atualizar o status."));
    }
  }

  async function handleOpenRequest(id: string) {
    try {
      const response = await getDirectoriaBalanceRequest(id, { cache: "no-store" });
      setSelectedRequest(response.request || null);
      setRejectReason(response.request?.rejectionReason || "");
    } catch {
      setSelectedRequest(null);
      setRejectReason("");
      setMessage("Não foi possível abrir os detalhes desta solicitação.");
    }
  }

  async function handleApproveSelected() {
    if (!selectedRequest?.id) return;
    try {
      setRequestActionLoading("approve");
      const currentRequest = selectedRequest;
      const response = await approveBalanceRequestAdmin(selectedRequest.id, csrfToken, { cache: "no-store" });
      if (response.request) {
        setRequests((current) => current.map((row) => (row.id === response.request?.id ? response.request : row)));
        pulseRequestRow(response.request.id);
      }
      setSelectedRequest(null);
      setRejectReason("");
      showApprovalToast("Solicitação aprovada com sucesso.", currentRequest.customerId || null);
      await loadRequests();
      await loadAudit();
    } catch (error: any) {
      setMessage(formatApprovalActionError(error, "Não foi possível aprovar a solicitação."));
      setSelectedRequest(null);
      setRejectReason("");
    } finally {
      setRequestActionLoading(null);
    }
  }

  async function handleRejectSelected() {
    if (!selectedRequest?.id || !rejectReason.trim()) return;
    try {
      setRequestActionLoading("reject");
      const currentRequest = selectedRequest;
      const response = await rejectBalanceRequestAdmin(selectedRequest.id, rejectReason.trim(), csrfToken, { cache: "no-store" });
      if (response.request) {
        setRequests((current) => current.map((row) => (row.id === response.request?.id ? response.request : row)));
        pulseRequestRow(response.request.id);
      }
      setSelectedRequest(null);
      setRejectReason("");
      showApprovalToast("Solicitação rejeitada com sucesso.", currentRequest.customerId || null);
      await loadRequests();
      await loadAudit();
    } catch (error: any) {
      setMessage(formatApprovalActionError(error, "Não foi possível rejeitar a solicitação."));
      setSelectedRequest(null);
      setRejectReason("");
    } finally {
      setRequestActionLoading(null);
    }
  }

  const requesterOptions = useMemo(
    () => [
      { label: "Todos os solicitantes", value: "" },
      ...admins.map((admin) => ({
        label: admin.name || admin.email,
        value: admin.id,
      })),
    ],
    [admins]
  );

  const filteredRequests = useMemo(() => {
    const normalizedQuery = String(requestSearch || "").trim().toLowerCase();
    if (!normalizedQuery) return requests;
    return requests.filter((row) =>
      [
        row.customerName,
        row.customerEmail,
        row.requesterName,
        row.requesterEmail,
        row.reason,
        row.relatedOrderId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [requestSearch, requests]);

  const filteredAdmins = useMemo(() => {
    const normalizedQuery = String(adminSearch || "").trim().toLowerCase();
    if (!normalizedQuery) return admins;
    return admins.filter((row) =>
      [row.name, row.nickname, row.email, formatRoleLabel(row.role), row.createdByName, row.createdByEmail]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [adminSearch, admins]);

  const requestFilters: FilterConfig[] = [
    {
      key: "status_aprovacao",
      value: requestStatusFilter,
      onChange: setRequestStatusFilter,
      options: [
        { label: "Todos os status", value: "todos" },
        { label: "Pendentes", value: "pending" },
        { label: "Aprovadas", value: "approved" },
        { label: "Rejeitadas", value: "rejected" },
      ],
    },
    {
      key: "solicitante_aprovacao",
      value: requesterFilter,
      onChange: setRequesterFilter,
      options: requesterOptions,
    },
  ];

  const selectedBadge = selectedRequest ? statusBadge(selectedRequest.status) : null;
  const auditFilterConfigs: FilterConfig[] = [
    {
      key: "visao_auditoria_diretoria",
      value: auditSecurityFilter,
      onChange: setAuditSecurityFilter,
      options: [
        { value: "all", label: "Visão: Todos os eventos" },
        { value: "security_only", label: "Visão: Somente segurança" },
      ],
    },
    {
      key: "periodo_auditoria_diretoria",
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
      key: "ordenacao_auditoria_diretoria",
      value: auditSort,
      onChange: setAuditSort,
      options: [
        { value: "mais_recente", label: "Mais recente" },
        { value: "mais_antigo", label: "Mais antigo" },
      ],
    },
  ];
  const filteredAuditRows = useMemo(() => {
    const query = normalizeTextForCompare(auditSearch);
    const rows = auditRows.filter((row) => {
      const summary = buildOpsAuditSummary(row);
      const searchable = normalizeTextForCompare([
        formatOpsAuditActionLabel(row.action),
        formatOpsAuditEntityLabel(row.targetType),
        summary,
        row.performerName,
        row.performerEmail,
        formatOpsAuditOrigin(row),
      ].join(" "));
      if (query && !searchable.includes(query)) return false;
      return matchesPeriod(row.createdAt, auditPeriodFilter);
    });

    rows.sort((a, b) => {
      const left = new Date(a.createdAt || 0).getTime();
      const right = new Date(b.createdAt || 0).getTime();
      return auditSort === "mais_antigo" ? left - right : right - left;
    });
    return rows;
  }, [auditRows, auditSearch, auditPeriodFilter, auditSort]);
  const sensitiveAuditRows = useMemo(
    () => filteredAuditRows.filter((row) => isSensitiveAuditAction(row.action)).slice(0, 6),
    [filteredAuditRows]
  );
  const regularAuditRows = useMemo(() => {
    if (auditSecurityFilter === "security_only") return filteredAuditRows;
    return filteredAuditRows.filter((row) => !isSensitiveAuditAction(row.action));
  }, [filteredAuditRows, auditSecurityFilter]);

  function exportAudit() {
    const query = new URLSearchParams();
    if (auditSecurityFilter === "security_only") query.set("security_only", "true");
    query.set("export", "csv");
    window.open(`/api/admin/diretoria/audit-logs?${query.toString()}`, "_blank");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { key: "admins", label: "Admins" },
          { key: "approvals", label: "Aprovações de Saldo" },
          { key: "audit", label: "Auditoria" },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key as "admins" | "approvals" | "audit")}
            style={{
              border: "1px solid #e2d9ce",
              borderRadius: 999,
              padding: "10px 16px",
              background: tab === item.key ? "#111" : "#fff",
              color: tab === item.key ? "#fff" : "#111",
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? <div style={{ color: "#5b6472", fontSize: 13 }}>{message}</div> : null}

      {tab === "admins" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#64748b" }}>Equipe administrativa</div>
              <div style={{ color: "#5b6472", fontSize: 14, maxWidth: 640 }}>
                Use a busca só para encontrar um admin já cadastrado. Para criar ou ajustar cargo e permissões, abra o painel de acesso.
              </div>
            </div>
            <button
              type="button"
              onClick={openCreateDrawer}
              style={{ border: 0, borderRadius: 12, padding: "12px 16px", background: "#111", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Novo admin
            </button>
          </div>

          <SearchBar
            placeholder="Buscar admin ou funcionário por nome, e-mail ou cargo"
            value={adminSearch}
            onChange={setAdminSearch}
            resultsCount={filteredAdmins.length}
            onClear={() => setAdminSearch("")}
          />

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Cargo</th>
                  <th>Status</th>
                  <th>Criado por</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAdmins.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || row.nickname || "-"}</td>
                    <td>{row.email}</td>
                    <td>{formatRoleLabel(row.role)}</td>
                    <td>{row.isActive ? "ativo" : "inativo"}</td>
                    <td>{row.createdByName || row.createdByEmail || "-"}</td>
                    <td>{formatDate(row.createdAt || null)}</td>
                    <td className={styles.actionCell}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {row.role === "superadmin" ? (
                          <span
                            title="Perfis de Diretoria são protegidos e não podem ser alterados por esta tela."
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              borderRadius: 999,
                              padding: "8px 12px",
                              background: "#eef2ff",
                              color: "#4338ca",
                              fontSize: 11,
                              fontWeight: 600,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                            }}
                          >
                            Protegido
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              title="Editar cargo e permissões"
                              onClick={() => openEditDrawer(row)}
                              className={styles.btnEdit}
                            >
                              Editar acesso
                            </button>
                            <button
                              type="button"
                              title={row.isActive ? "Desativar" : "Ativar"}
                              onClick={() => handleToggleStatus(row)}
                              className={row.isActive ? styles.btnDelete : styles.btnDetalhes}
                            >
                              {row.isActive ? "Desativar" : "Ativar"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredAdmins.length ? <p className={styles.noResults}>Nenhum admin encontrado para essa busca.</p> : null}
        </div>
      ) : null}

      {tab === "approvals" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SearchBar
            placeholder="Buscar por cliente, solicitante ou motivo"
            value={requestSearch}
            onChange={setRequestSearch}
            filters={requestFilters}
            resultsCount={filteredRequests.length}
            onClear={() => {
              setRequestSearch("");
              setRequestStatusFilter("todos");
              setRequesterFilter("");
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <input type="date" value={requestDateFrom} onChange={(event) => setRequestDateFrom(event.target.value)} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "10px 12px" }} />
            <input type="date" value={requestDateTo} onChange={(event) => setRequestDateTo(event.target.value)} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "10px 12px" }} />
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Solicitada em</th>
                  <th>Solicitada por</th>
                  <th>Cliente</th>
                  <th>Saldo atual</th>
                  <th>Operação</th>
                  <th>Valor</th>
                  <th>Saldo resultante</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <tr
                      key={row.id}
                      style={
                        highlightedRequestId === row.id
                          ? {
                              background: "#f5fbf7",
                              boxShadow: "inset 0 0 0 1px #d7eadb",
                              transition: "background 220ms ease, box-shadow 220ms ease",
                            }
                          : { transition: "background 220ms ease, box-shadow 220ms ease" }
                      }
                    >
                      <td>{formatDate(row.createdAt)}</td>
                      <td>{row.requesterName || row.requesterEmail || "-"}</td>
                      <td>{row.customerName || row.customerEmail || "-"}</td>
                      <td>{formatMoney(row.customerWalletCents)}</td>
                      <td>{row.type === "debit" ? "Débito" : "Crédito"}</td>
                      <td>{formatMoney(Math.round(Number(row.amount || 0) * 100))}</td>
                      <td>{formatMoney(row.resultingBalanceCents)}</td>
                      <td>{row.reason}</td>
                      <td>
                        <span style={{ display: "inline-flex", borderRadius: 999, padding: "4px 9px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, ...badge }}>
                          {badge.label}
                        </span>
                      </td>
                      <td className={styles.actionCell}>
                        <button
                          type="button"
                          onClick={() => handleOpenRequest(row.id)}
                          className={styles.btnEdit}
                        >
                          Revisar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "audit" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SearchBar
            placeholder="Buscar por ação, admin ou resumo"
            value={auditSearch}
            onChange={setAuditSearch}
            filters={auditFilterConfigs}
            sortOptions={auditSortOptions}
            resultsCount={regularAuditRows.length}
            onClear={() => {
              setAuditSearch("");
              setAuditSecurityFilter("all");
              setAuditPeriodFilter("todos");
              setAuditSort("mais_recente");
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={exportAudit} className={styles.btnEdit}>Exportar CSV</button>
          </div>

          {auditSecurityFilter !== "security_only" && sensitiveAuditRows.length ? (
            <section
              style={{
                border: "1px solid #eeeeee",
                borderRadius: 0,
                background: "#ffffff",
                padding: "14px 16px 8px",
                display: "grid",
                gap: 14,
              }}
            >
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: "#999", fontFamily: "var(--font-jost), sans-serif", fontWeight: 300 }}>
                  Eventos sensíveis
                </div>
                <div style={{ fontSize: 12, color: "#777", fontFamily: "var(--font-jost), sans-serif", fontWeight: 300 }}>
                  Alterações de acesso, eventos suspeitos e decisões críticas de saldo aparecem aqui com prioridade.
                </div>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Ação</th>
                      <th>Entidade</th>
                      <th>Resumo</th>
                      <th>Conta</th>
                      <th>Origem</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sensitiveAuditRows.map((row) => {
                      const severity = getAuditSeverity(row.action);
                      return (
                        <tr key={`sensitive-${row.id}`}>
                          <td>
                            <div style={{ display: "grid", gap: 4 }}>
                              <span>{formatOpsAuditActionLabel(row.action)}</span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignSelf: "flex-start",
                                  borderRadius: 999,
                                  padding: "2px 7px",
                                  fontSize: 9,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  fontWeight: 400,
                                  color: severity.color,
                                  background: severity.background,
                                  border: `1px solid ${severity.border}`,
                                }}
                              >
                                {severity.label}
                              </span>
                            </div>
                          </td>
                          <td>{formatOpsAuditEntityLabel(row.targetType)}</td>
                          <td>{buildOpsAuditSummary(row)}</td>
                          <td>{row.performerEmail || row.performerName || "-"}</td>
                          <td>{formatOpsAuditOrigin(row)}</td>
                          <td>{formatDateTime(row.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ação</th>
                  <th>Entidade</th>
                  <th>Resumo</th>
                  <th>Conta</th>
                  <th>Origem</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {regularAuditRows.map((row) => {
                  const severity = getAuditSeverity(row.action);
                  return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ display: "grid", gap: 4 }}>
                        <span>{formatOpsAuditActionLabel(row.action)}</span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignSelf: "flex-start",
                            borderRadius: 999,
                            padding: "2px 7px",
                            fontSize: 9,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            fontWeight: 400,
                            color: severity.color,
                            background: severity.background,
                            border: `1px solid ${severity.border}`,
                          }}
                        >
                          {severity.label}
                        </span>
                      </div>
                    </td>
                    <td>{formatOpsAuditEntityLabel(row.targetType)}</td>
                    <td>{buildOpsAuditSummary(row)}</td>
                    <td>{row.performerEmail || row.performerName || "-"}</td>
                    <td>{formatOpsAuditOrigin(row)}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {!regularAuditRows.length ? (
            <div style={{ color: "#6b7280", fontSize: 13 }}>
              {auditSecurityFilter === "security_only"
                ? "Nenhum evento de segurança encontrado para este filtro."
                : "Nenhum evento restante encontrado para este filtro."}
            </div>
          ) : null}
        </div>
      ) : null}

      <Drawer
        isOpen={Boolean(accessDrawerMode)}
        onClose={() => {
          setAccessDrawerMode(null);
          setEditingAdmin(null);
        }}
        title={accessDrawerMode === "create" ? "Novo admin" : "Acesso do admin"}
        subtitle={accessDrawerMode === "create" ? "Cadastre o acesso administrativo com cargo e permissões." : editingAdmin?.email || ""}
        saveLabel={savingAdmin ? "Salvando..." : accessDrawerMode === "create" ? "Criar admin" : "Salvar alterações"}
        disableSave={
          savingAdmin ||
          !formEmail.trim() ||
          (accessDrawerMode === "edit" && editingAdmin?.role === "superadmin")
        }
        onSave={handleCreateAdmin}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: drawerLabelColor }}>E-mail</div>
            <input
              value={formEmail}
              onChange={(event) => setFormEmail(event.target.value)}
              disabled={accessDrawerMode === "edit"}
              placeholder="funcionario@tsebi.com.br"
              style={{
                border: `1px solid ${drawerFieldBorder}`,
                borderRadius: 12,
                padding: "12px 14px",
                background: accessDrawerMode === "edit" ? drawerFieldDisabledBackground : drawerFieldBackground,
              }}
            />
            <div style={{ fontSize: 12, color: drawerMutedTextColor }}>
              {accessDrawerMode === "create"
                ? "Cadastre aqui o e-mail do funcionário para liberar o acesso administrativo."
                : "O vínculo do admin continua sendo pelo e-mail já cadastrado."}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: drawerLabelColor }}>Cargo</div>
            <select
              value={formRole}
              onChange={(event) => setFormRole(event.target.value as "admin" | "director" | "superadmin")}
              disabled={editingAdmin?.role === "superadmin"}
              style={{
                border: `1px solid ${drawerFieldBorder}`,
                borderRadius: 12,
                padding: "12px 14px",
                background: editingAdmin?.role === "superadmin" ? drawerFieldDisabledBackground : drawerFieldBackground,
              }}
            >
              <option value="admin">Admin</option>
              <option value="director">Gerente</option>
              <option value="superadmin">Diretoria</option>
            </select>
            <div style={{ fontSize: 12, color: drawerMutedTextColor, lineHeight: 1.6 }}>
              {formRole === "superadmin"
                ? "Diretoria tem acesso total e protegido."
                : formRole === "director"
                  ? "Gerente pode acessar Diretoria e aprovações."
                  : "Admin opera apenas nos módulos liberados abaixo."}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: drawerLabelColor }}>Permissões</div>
            <div style={{ display: "grid", gap: 10 }}>
              {MODULES.map((moduleItem) => (
                <label
                  key={moduleItem.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    border: `1px solid ${drawerOptionBorder}`,
                    borderRadius: 14,
                    padding: "12px 14px",
                    background: drawerOptionBackground,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <strong style={{ fontSize: 14, fontWeight: 500 }}>{moduleItem.label}</strong>
                    <span style={{ fontSize: 12, color: drawerMutedTextColor }}>Libera o módulo {moduleItem.label.toLowerCase()} para este admin.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formModules.includes(moduleItem.key)}
                    disabled={formRole !== "admin" || editingAdmin?.role === "superadmin"}
                    onChange={(event) =>
                      setFormModules((current) =>
                        event.target.checked
                          ? Array.from(new Set([...current, moduleItem.key]))
                          : current.filter((entry) => entry !== moduleItem.key)
                      )
                    }
                  />
                </label>
              ))}
            </div>
            {formRole !== "admin" ? (
              <div style={{ fontSize: 12, color: drawerMutedTextColor }}>
                Para Gerente e Diretoria, as permissões por módulo deixam de limitar o acesso principal.
              </div>
            ) : null}
          </div>

          {accessDrawerMode === "edit" ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: drawerLabelColor }}>Status</div>
              <select
                value={formIsActive ? "active" : "inactive"}
                onChange={(event) => setFormIsActive(event.target.value === "active")}
                disabled={editingAdmin?.role === "superadmin"}
                style={{
                  border: `1px solid ${drawerFieldBorder}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: editingAdmin?.role === "superadmin" ? drawerFieldDisabledBackground : drawerFieldBackground,
                }}
              >
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        isOpen={Boolean(selectedRequest)}
        onClose={() => {
          setSelectedRequest(null);
          setRejectReason("");
        }}
        title="Solicitação de saldo"
        subtitle={selectedRequest?.customerName || selectedRequest?.customerEmail || ""}
        wide
        stickyFooter
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 10 }}>
            <button
              type="button"
              className={styles.btnDelete}
              onClick={handleRejectSelected}
              disabled={!selectedRequest || selectedRequest.status !== "pending" || !rejectReason.trim() || requestActionLoading !== null}
            >
              {requestActionLoading === "reject" ? "Rejeitando..." : "Rejeitar"}
            </button>
            <button
              type="button"
              className={styles.btnEdit}
              onClick={handleApproveSelected}
              disabled={!selectedRequest || selectedRequest.status !== "pending" || requestActionLoading !== null}
            >
              {requestActionLoading === "approve" ? "Aprovando..." : "Aprovar"}
            </button>
          </div>
        }
      >
        {selectedRequest ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {selectedBadge ? (
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, ...selectedBadge }}>
                {selectedBadge.label}
              </span>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                { label: "Solicitante", value: selectedRequest.requesterName || "-" },
                { label: "E-mail do solicitante", value: selectedRequest.requesterEmail || "-" },
                { label: "Cliente", value: selectedRequest.customerName || "-" },
                { label: "E-mail do cliente", value: selectedRequest.customerEmail || "-" },
                { label: "Operação", value: selectedRequest.type === "debit" ? "Débito" : "Crédito" },
                { label: "Motivo", value: formatApprovalReason(selectedRequest.reason) },
                { label: "Valor solicitado", value: formatMoney(Math.round(Number(selectedRequest.amount || 0) * 100)) },
                { label: "Saldo atual", value: formatMoney(selectedRequest.customerWalletCents) },
                { label: "Saldo resultante", value: formatMoney(selectedRequest.resultingBalanceCents) },
                { label: "Enviada em", value: formatDate(selectedRequest.createdAt) },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    border: "1px solid #dbe4f0",
                    borderRadius: 14,
                    padding: "14px 16px",
                    background: "#f8fbff",
                    display: "grid",
                    gap: 6,
                  }}
                >
                  <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, color: "#0f172a", wordBreak: "break-word" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {selectedRequest.relatedOrderId ? (
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
                  Pedido relacionado
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#0f172a", wordBreak: "break-word" }}>
                  {selectedRequest.relatedOrderId}
                </div>
              </div>
            ) : null}

            {selectedRequest.reasonDetail ? (
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
                  Detalhe do motivo
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#0f172a", whiteSpace: "pre-wrap" }}>
                  {selectedRequest.reasonDetail}
                </div>
              </div>
            ) : null}

            {selectedRequest.internalNote ? (
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 14,
                  padding: "14px 16px",
                  background: "#f8fbff",
                  display: "grid",
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
                  Observação interna
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "#0f172a", whiteSpace: "pre-wrap" }}>
                  {selectedRequest.internalNote}
                </div>
              </div>
            ) : null}

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#64748b" }}>
                Motivo da rejeição
              </div>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Explique por que esta solicitação não deve ser aprovada"
                rows={5}
                style={{
                  border: "1px solid #d8e1ec",
                  borderRadius: 12,
                  padding: "12px 14px",
                  resize: "vertical",
                  lineHeight: 1.6,
                  background: "#ffffff",
                  color: "#0f172a",
                }}
              />
            </div>
          </div>
        ) : null}
      </Drawer>

      {approvalToast ? (
        <div
          style={{
            position: "fixed",
            right: 28,
            bottom: 28,
            zIndex: 220,
            width: "min(420px, calc(100vw - 32px))",
            borderRadius: 18,
            border: "1px solid #d9e4f1",
            background: "#ffffff",
            boxShadow: "0 24px 50px rgba(15, 23, 42, 0.16)",
            padding: 18,
            display: "grid",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignSelf: "flex-start",
              borderRadius: 999,
              padding: "6px 10px",
              background: "#111111",
              color: "#ffffff",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Atualização concluída
          </div>
          <div style={{ fontSize: 16, color: "#111111", fontWeight: 600 }}>
            {approvalToast.message}
          </div>
          <div style={{ color: "#5b6472", fontSize: 13 }}>
            A linha foi atualizada e você pode seguir para o cliente ou revisar o registro na auditoria.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {approvalToast.customerId ? (
              <button
                type="button"
                className={styles.btnEdit}
                onClick={() => {
                  setApprovalToast(null);
                  onOpenBalanceCustomer?.(approvalToast.customerId as string);
                }}
              >
                Ver cliente
              </button>
            ) : null}
            <button
              type="button"
              className={styles.btnDetalhes}
              onClick={() => {
                setApprovalToast(null);
                setTab("audit");
                onNavigatePage?.("auditoria");
              }}
            >
              Ver auditoria
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
