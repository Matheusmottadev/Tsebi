"use client";

import { useEffect, useMemo, useState } from "react";
import { Drawer } from "@/components/admin/Drawer";
import { SearchBar, type FilterConfig } from "@/components/studio/panel/SearchBar";
import {
  approveBalanceRequestAdmin,
  createDirectoriaAdmin,
  getDirectoriaBalanceRequest,
  listDirectoriaAdmins,
  listDirectoriaAuditLogs,
  listDirectoriaBalanceRequests,
  updateDirectoriaAdminPermissions,
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

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents || 0) || 0) / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function statusBadge(status: BalanceRequestRow["status"]) {
  if (status === "approved") return { background: "#ebf6ef", color: "#245b33", label: "Aprovada" };
  if (status === "rejected") return { background: "#fbecec", color: "#8d2727", label: "Rejeitada" };
  return { background: "#f7f0e5", color: "#7a5d28", label: "Pendente" };
}

export function DiretoriaPage({ csrfToken, refreshKey = 0 }: { csrfToken?: string; refreshKey?: number }) {
  const [tab, setTab] = useState<"admins" | "approvals" | "audit">("admins");
  const [admins, setAdmins] = useState<AdminAccessRow[]>([]);
  const [requests, setRequests] = useState<BalanceRequestRow[]>([]);
  const [auditRows, setAuditRows] = useState<OpsAuditLogRow[]>([]);
  const [createEmail, setCreateEmail] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "director" | "superadmin">("admin");
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [message, setMessage] = useState("");
  const [permissionDraftId, setPermissionDraftId] = useState<string>("");
  const [permissionDraft, setPermissionDraft] = useState<string[]>([]);
  const [requestStatusFilter, setRequestStatusFilter] = useState("todos");
  const [requestSearch, setRequestSearch] = useState("");
  const [requestDateFrom, setRequestDateFrom] = useState("");
  const [requestDateTo, setRequestDateTo] = useState("");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<BalanceRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
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
    if (!createEmail.trim()) return;
    setSavingAdmin(true);
    setMessage("");
    try {
      await createDirectoriaAdmin({ email: createEmail.trim(), role: createRole }, csrfToken, { cache: "no-store" });
      setCreateEmail("");
      setCreateRole("admin");
      setMessage("Admin criado com sucesso.");
      await loadAdmins();
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível criar o admin."));
    } finally {
      setSavingAdmin(false);
    }
  }

  async function handleToggleStatus(row: AdminAccessRow) {
    try {
      await updateDirectoriaAdminStatus(row.id, { isActive: !row.isActive }, csrfToken, { cache: "no-store" });
      await loadAdmins();
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível atualizar o status."));
    }
  }

  async function handleSavePermissions(adminId: string) {
    try {
      await updateDirectoriaAdminPermissions(
        adminId,
        { modules: permissionDraft as Array<"balance" | "orders" | "users" | "products"> },
        csrfToken,
        { cache: "no-store" }
      );
      setPermissionDraftId("");
      setPermissionDraft([]);
      await loadAdmins();
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível salvar as permissões."));
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
    }
  }

  async function handleApproveSelected() {
    if (!selectedRequest?.id) return;
    try {
      await approveBalanceRequestAdmin(selectedRequest.id, csrfToken, { cache: "no-store" });
      setSelectedRequest(null);
      setRejectReason("");
      await loadRequests();
      await loadAudit();
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível aprovar a solicitação."));
    }
  }

  async function handleRejectSelected() {
    if (!selectedRequest?.id || !rejectReason.trim()) return;
    try {
      await rejectBalanceRequestAdmin(selectedRequest.id, rejectReason.trim(), csrfToken, { cache: "no-store" });
      setSelectedRequest(null);
      setRejectReason("");
      await loadRequests();
      await loadAudit();
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível rejeitar a solicitação."));
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

      {message ? <div style={{ color: "#6a5d50", fontSize: 13 }}>{message}</div> : null}

      {tab === "admins" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.6fr auto", gap: 10, alignItems: "end" }}>
            <input value={createEmail} onChange={(event) => setCreateEmail(event.target.value)} placeholder="E-mail do admin" style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px" }} />
            <select value={createRole} onChange={(event) => setCreateRole(event.target.value as "admin" | "director" | "superadmin")} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px" }}>
              <option value="admin">Admin</option>
              <option value="director">Director</option>
              <option value="superadmin">Superadmin</option>
            </select>
            <button type="button" onClick={handleCreateAdmin} disabled={savingAdmin} style={{ border: 0, borderRadius: 12, padding: "12px 16px", background: "#111", color: "#fff", cursor: "pointer" }}>
              {savingAdmin ? "Criando..." : "Criar admin"}
            </button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Criado por</th>
                  <th>Criado em</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name || row.nickname || "-"}</td>
                    <td>{row.email}</td>
                    <td>{row.role}</td>
                    <td>{row.isActive ? "ativo" : "inativo"}</td>
                    <td>{row.createdByName || row.createdByEmail || "-"}</td>
                    <td>{formatDate(row.createdAt || null)}</td>
                    <td className={styles.actionCell}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={row.role === "superadmin"}
                          title={row.role === "superadmin" ? "protegido" : "Editar permissões"}
                          onClick={() => {
                            setPermissionDraftId(row.id === permissionDraftId ? "" : row.id);
                            setPermissionDraft(row.permissions || []);
                          }}
                          className={styles.btnEdit}
                        >
                          Permissões
                        </button>
                        <button
                          type="button"
                          disabled={row.role === "superadmin"}
                          title={row.role === "superadmin" ? "protegido" : row.isActive ? "Desativar" : "Ativar"}
                          onClick={() => handleToggleStatus(row)}
                          className={row.isActive ? styles.btnDelete : styles.btnDetalhes}
                        >
                          {row.isActive ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                      {permissionDraftId === row.id ? (
                        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            {MODULES.map((moduleItem) => (
                              <label key={moduleItem.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                                <input
                                  type="checkbox"
                                  checked={permissionDraft.includes(moduleItem.key)}
                                  onChange={(event) =>
                                    setPermissionDraft((current) =>
                                      event.target.checked
                                        ? Array.from(new Set([...current, moduleItem.key]))
                                        : current.filter((entry) => entry !== moduleItem.key)
                                    )
                                  }
                                />
                                {moduleItem.label}
                              </label>
                            ))}
                          </div>
                          <button type="button" onClick={() => handleSavePermissions(row.id)} className={styles.btnEdit}>
                            Salvar permissões
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((row) => {
                  const badge = statusBadge(row.status);
                  return (
                    <tr key={row.id} onClick={() => handleOpenRequest(row.id)} style={{ cursor: "pointer" }}>
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
        isOpen={Boolean(selectedRequest)}
        onClose={() => {
          setSelectedRequest(null);
          setRejectReason("");
        }}
        title="Solicitação de saldo"
        subtitle={selectedRequest?.customerName || selectedRequest?.customerEmail || ""}
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 10 }}>
            <button type="button" className={styles.btnDelete} onClick={handleRejectSelected} disabled={!selectedRequest || selectedRequest.status !== "pending" || !rejectReason.trim()}>
              Rejeitar
            </button>
            <button type="button" className={styles.btnEdit} onClick={handleApproveSelected} disabled={!selectedRequest || selectedRequest.status !== "pending"}>
              Aprovar
            </button>
          </div>
        }
      >
        {selectedRequest ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {selectedBadge ? (
              <span style={{ alignSelf: "flex-start", display: "inline-flex", borderRadius: 999, padding: "4px 9px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, ...selectedBadge }}>
                {selectedBadge.label}
              </span>
            ) : null}
            <div style={{ display: "grid", gap: 10 }}>
              <div><strong>Solicitante:</strong> {selectedRequest.requesterName || selectedRequest.requesterEmail || "-"}</div>
              <div><strong>Cliente:</strong> {selectedRequest.customerName || selectedRequest.customerEmail || "-"}</div>
              <div><strong>Operação:</strong> {selectedRequest.type === "debit" ? "Débito" : "Crédito"}</div>
              <div><strong>Valor:</strong> {formatMoney(Math.round(Number(selectedRequest.amount || 0) * 100))}</div>
              <div><strong>Saldo atual:</strong> {formatMoney(selectedRequest.customerWalletCents)}</div>
              <div><strong>Saldo resultante:</strong> {formatMoney(selectedRequest.resultingBalanceCents)}</div>
              <div><strong>Motivo:</strong> {selectedRequest.reason}</div>
              {selectedRequest.reasonDetail ? <div><strong>Detalhe:</strong> {selectedRequest.reasonDetail}</div> : null}
              {selectedRequest.relatedOrderId ? <div><strong>Pedido relacionado:</strong> {selectedRequest.relatedOrderId}</div> : null}
              {selectedRequest.internalNote ? <div><strong>Nota interna:</strong> {selectedRequest.internalNote}</div> : null}
            </div>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Motivo da rejeição"
              rows={4}
              style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px", resize: "vertical" }}
            />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
