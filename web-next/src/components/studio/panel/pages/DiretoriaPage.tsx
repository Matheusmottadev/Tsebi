"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/admin/Drawer";
import { useAdminAccess } from "@/components/studio/panel/access-control";
import { SearchBar, type FilterConfig } from "@/components/studio/panel/SearchBar";
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
  if (raw.includes("SELF_APPROVAL_FORBIDDEN")) {
    return "Você não pode aprovar uma solicitação criada pela sua própria conta.";
  }
  if (raw.includes("REQUEST_ALREADY_REVIEWED")) {
    return "Essa solicitação já foi analisada por outra pessoa.";
  }
  if (raw.includes("INSUFFICIENT_CUSTOMER_BALANCE")) {
    return "O cliente não tem saldo suficiente para esta remoção.";
  }
  return raw;
}

export function DiretoriaPage({ csrfToken, refreshKey = 0 }: { csrfToken?: string; refreshKey?: number }) {
  const adminAccess = useAdminAccess();
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
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditDateFrom, setAuditDateFrom] = useState("");
  const [auditDateTo, setAuditDateTo] = useState("");

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
          action: auditActionFilter,
          dateFrom: auditDateFrom,
          dateTo: auditDateTo,
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
  }, [tab, requestStatusFilter, requestDateFrom, requestDateTo, requesterFilter, auditActionFilter, auditDateFrom, auditDateTo, refreshKey]);

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
      await approveBalanceRequestAdmin(selectedRequest.id, csrfToken, { cache: "no-store" });
      setSelectedRequest(null);
      setRejectReason("");
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
      await rejectBalanceRequestAdmin(selectedRequest.id, rejectReason.trim(), csrfToken, { cache: "no-store" });
      setSelectedRequest(null);
      setRejectReason("");
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
  const isOwnSelectedRequest = Boolean(
    selectedRequest?.requestedBy &&
      adminAccess?.id &&
      String(selectedRequest.requestedBy) === String(adminAccess.id)
  );

  function exportAudit() {
    const query = new URLSearchParams();
    if (auditActionFilter.trim()) query.set("action", auditActionFilter.trim());
    if (auditDateFrom.trim()) query.set("date_from", auditDateFrom.trim());
    if (auditDateTo.trim()) query.set("date_to", auditDateTo.trim());
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
                    <tr key={row.id}>
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} placeholder="Filtrar por ação" style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "10px 12px", minWidth: 220 }} />
            <input type="date" value={auditDateFrom} onChange={(event) => setAuditDateFrom(event.target.value)} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "10px 12px" }} />
            <input type="date" value={auditDateTo} onChange={(event) => setAuditDateTo(event.target.value)} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "10px 12px" }} />
            <button type="button" onClick={exportAudit} className={styles.btnEdit}>Exportar CSV</button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Admin</th>
                  <th>Ação</th>
                  <th>Alvo</th>
                  <th>Antes</th>
                  <th>Depois</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.performerName || row.performerEmail || "-"}</td>
                    <td>{row.action}</td>
                    <td>{row.targetType || "-"} {row.targetId ? `#${row.targetId.slice(0, 8)}` : ""}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(row.beforeState || {}, null, 2)}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(row.afterState || {}, null, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
              disabled={!selectedRequest || selectedRequest.status !== "pending" || requestActionLoading !== null || isOwnSelectedRequest}
            >
              {isOwnSelectedRequest ? "Autoaprovação bloqueada" : requestActionLoading === "approve" ? "Aprovando..." : "Aprovar"}
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

            {isOwnSelectedRequest ? (
              <div
                style={{
                  border: "1px solid #dbe4f0",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "#f8fbff",
                  color: "#315ea8",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Esta solicitação foi criada pela sua própria conta. Por segurança, ela precisa ser aprovada por outro gerente ou pela diretoria.
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
