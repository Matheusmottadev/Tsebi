"use client";

import { Lock, PencilLine, RefreshCcw, Trash2, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  deleteUserAdmin,
  getUserAdmin,
  listOrdersAdmin,
  listUserOrdersAdmin,
  resetUserPasswordAdmin,
  updateUserAdmin,
  type AdminUserDetail,
  type AdminUserOrderRow,
  type AdminUserRow,
} from "@/services/admin";
import styles from "./DrawerDetalhesUsuario.module.css";

type DrawerDetalhesUsuarioProps = {
  isOpen: boolean;
  user: AdminUserRow | null;
  isEditing: boolean;
  onSetEditing: (next: boolean) => void;
  onClose: () => void;
  onToast: (message: string) => void;
  onUserRowUpdated: (nextUser: AdminUserRow) => void;
  onUserDeleted: (userId: string) => void;
  onRequestRefresh?: () => void;
};

type UserDraft = {
  title: "sr" | "sra" | "srta" | "nao_informar" | "";
  name: string;
  phone: string;
  birthDate: string;
  cpf: string;
  cep: string;
};

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message || "Falha na operação.";
  if (error instanceof Error) return error.message || "Falha na operação.";
  return "Falha na operação.";
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(date);
}

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

function normalizeEmailValue(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function normalizePhoneDigits(value: string): string {
  let digits = normalizeDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function formatPhoneInput(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `(${ddd}`;
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function formatCpfInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 11);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  if (digits.length <= 3) return p1;
  if (digits.length <= 6) return `${p1}.${p2}`;
  if (digits.length <= 9) return `${p1}.${p2}.${p3}`;
  return `${p1}.${p2}.${p3}-${p4}`;
}

function formatBirthDateInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

function toDisplayBirthDate(value: string): string {
  const raw = String(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return formatBirthDateInput(raw);
}

function toApiBirthDate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const digits = normalizeDigits(raw);
  if (digits.length !== 8) return "";
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}

function isPaidStatus(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "paid";
}

function maskCpf(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "-";
  const tail = digits.slice(-2).padStart(2, "•");
  return `•••.•••.•••-${tail}`;
}

function getInitials(value: string): string {
  const parts = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function toTitleLabel(value: string): string {
  if (value === "sr") return "Sr.";
  if (value === "sra") return "Sra.";
  if (value === "srta") return "Srta.";
  return "-";
}

function formatDistanceToNowLabel(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const diffMs = Date.now() - date.getTime();
  const absMs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (absMs < hourMs) return rtf.format(-Math.round(diffMs / minuteMs), "minute");
  if (absMs < dayMs) return rtf.format(-Math.round(diffMs / hourMs), "hour");
  if (absMs < monthMs) return rtf.format(-Math.round(diffMs / dayMs), "day");
  if (absMs < yearMs) return rtf.format(-Math.round(diffMs / monthMs), "month");
  return rtf.format(-Math.round(diffMs / yearMs), "year");
}

function toStatusBadge(value: string): { label: "Pago" | "Pendente" | "Cancelado"; tone: "paid" | "pending" | "canceled" } {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "paid") return { label: "Pago", tone: "paid" };
  if (["canceled", "cancelled", "failed", "refunded"].includes(normalized)) return { label: "Cancelado", tone: "canceled" };
  return { label: "Pendente", tone: "pending" };
}

function mapFallbackOrderToUserOrder(row: {
  id: string;
  createdAt: string | null;
  status: string;
  currency: string;
  amount: number;
  shippingSelectedService?: string;
  shippingSelectedCarrierName?: string;
}): AdminUserOrderRow {
  const productName = String(row.shippingSelectedService || row.shippingSelectedCarrierName || "Pedido sem item").trim();
  return {
    id: String(row.id || ""),
    createdAt: row.createdAt || null,
    status: String(row.status || ""),
    currency: String(row.currency || "brl"),
    amount: Number(row.amount || 0),
    userId: "",
    productName,
  };
}

function buildDraft(user: AdminUserDetail): UserDraft {
  return {
    title: user.title || "nao_informar",
    name: user.name || "",
    phone: formatPhoneInput(user.phone || ""),
    birthDate: toDisplayBirthDate(user.birthDate || ""),
    cpf: formatCpfInput(user.cpf || ""),
    cep: user.cep || "",
  };
}

function toTableRow(base: AdminUserRow, detail: AdminUserDetail): AdminUserRow {
  return {
    ...base,
    title: detail.title || "",
    name: detail.name || "",
    email: detail.email || "",
    phone: detail.phone || "",
    status: detail.loginDisabled ? "suspended" : "active",
    lastLoginAt: detail.lastLoginAt || null,
    createdAt: detail.createdAt || null,
    cep: detail.cep || "",
  };
}

export function DrawerDetalhesUsuario({
  isOpen,
  user,
  isEditing,
  onSetEditing,
  onClose,
  onToast,
  onUserRowUpdated,
  onUserDeleted,
  onRequestRefresh,
}: DrawerDetalhesUsuarioProps) {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [orders, setOrders] = useState<AdminUserOrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmMode, setConfirmMode] = useState<"suspend" | "delete" | null>(null);

  const isSuspended = Boolean(detail?.loginDisabled || user?.status === "disabled" || user?.status === "suspended");
  const selectedId = String(user?.id || "").trim();
  const selectedEmail = normalizeEmailValue(user?.email || "");

  useEffect(() => {
    if (!isOpen) {
      onSetEditing(false);
      setConfirmMode(null);
      setErrorMessage("");
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onSetEditing]);

  useEffect(() => {
    if (!isOpen || !selectedId) return;
    let cancelled = false;
    setDetail(null);
    setDraft(null);
    setOrders([]);
    setLoading(true);
    setOrdersLoading(true);
    setErrorMessage("");
    setConfirmMode(null);
    onSetEditing(false);

    getUserAdmin(selectedId, { cache: "no-store" })
      .then((response) => {
        if (cancelled) return;
        setDetail(response);
        setDraft(buildDraft(response));
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(pickErrorMessage(error));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    async function loadOrders(): Promise<void> {
      let primaryRows: AdminUserOrderRow[] = [];
      try {
        primaryRows = await listUserOrdersAdmin(selectedId, { cache: "no-store" });
      } catch {
        primaryRows = [];
      }

      const merged = new Map<string, AdminUserOrderRow>();
      primaryRows.forEach((row) => {
        const id = String(row.id || "").trim();
        if (!id) return;
        merged.set(id, row);
      });

      // Fallback por e-mail para cobrir pedidos guest e/ou API antiga sem endpoint dedicado.
      if (selectedEmail) {
        try {
          const pageSize = 200;
          const maxPages = 20;
          for (let page = 1; page <= maxPages; page += 1) {
            const response = await listOrdersAdmin({ page, pageSize }, { cache: "no-store" });
            const rows = Array.isArray(response.orders) ? response.orders : [];
            rows
              .filter((row) => normalizeEmailValue(row.userEmail || "") === selectedEmail)
              .map(mapFallbackOrderToUserOrder)
              .forEach((row) => {
                const id = String(row.id || "").trim();
                if (!id || merged.has(id)) return;
                merged.set(id, row);
              });
            if (rows.length < pageSize) break;
          }
        } catch {
          // Mantém resultado primário se fallback falhar.
        }
      }

      const nextOrders = Array.from(merged.values()).sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });
      if (cancelled) return;
      setOrders(nextOrders);
      setOrdersLoading(false);
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, [isOpen, onSetEditing, selectedEmail, selectedId]);

  const stats = useMemo(() => {
    const totalSpent = orders.filter((row) => isPaidStatus(row.status)).reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return {
      totalSpent,
      totalOrders: orders.length,
      accountAge: formatDistanceToNowLabel(detail?.createdAt || user?.createdAt || null),
    };
  }, [detail?.createdAt, orders, user?.createdAt]);

  async function handleResetSenha() {
    if (!selectedId) return;
    setActionLoading("reset");
    setErrorMessage("");
    try {
      await resetUserPasswordAdmin(selectedId);
      onClose();
      onToast("E-mail de redefinição enviado.");
      onRequestRefresh?.();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setActionLoading("");
    }
  }

  async function handleSalvar() {
    if (!selectedId || !detail || !draft || !user) return;
    const phoneDigits = normalizePhoneDigits(draft.phone);
    const cpfDigits = normalizeDigits(draft.cpf);
    const birthDateApi = toApiBirthDate(draft.birthDate);
    if (draft.birthDate.trim() && !birthDateApi) {
      setErrorMessage("Data de nascimento invalida. Use DD/MM/AAAA.");
      return;
    }
    if (cpfDigits && cpfDigits.length !== 11) {
      setErrorMessage("CPF invalido.");
      return;
    }
    if (phoneDigits && phoneDigits.length < 10) {
      setErrorMessage("Telefone invalido.");
      return;
    }

    const payload = {
      title: draft.title,
      name: draft.name,
      phone: phoneDigits,
      birthDate: birthDateApi,
      cpf: cpfDigits,
      cep: draft.cep,
    };

    setActionLoading("save");
    setErrorMessage("");
    try {
      await updateUserAdmin(selectedId, payload);
      const updated = await getUserAdmin(selectedId, { cache: "no-store" });
      setDetail(updated);
      setDraft(buildDraft(updated));
      onSetEditing(false);
      onUserRowUpdated(toTableRow(user, updated));
      onToast("Dados atualizados.");
      onRequestRefresh?.();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setActionLoading("");
    }
  }

  async function handleToggleSuspensao() {
    if (!selectedId || !user) return;
    const nextStatus = isSuspended ? "active" : "suspended";
    setActionLoading("suspend");
    setErrorMessage("");
    try {
      await updateUserAdmin(selectedId, { status: nextStatus });
      const updated = await getUserAdmin(selectedId, { cache: "no-store" });
      setDetail(updated);
      setDraft(buildDraft(updated));
      setConfirmMode(null);
      onUserRowUpdated(toTableRow(user, updated));
      onToast(nextStatus === "suspended" ? "Conta suspensa." : "Conta reativada.");
      onRequestRefresh?.();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setActionLoading("");
    }
  }

  async function handleExcluir() {
    if (!selectedId) return;
    setActionLoading("delete");
    setErrorMessage("");
    try {
      await deleteUserAdmin(selectedId);
      onUserDeleted(selectedId);
      setConfirmMode(null);
      onClose();
      onToast("Usuário excluído.");
      onRequestRefresh?.();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setActionLoading("");
    }
  }

  if (!isOpen || !user) return null;

  return (
    <div className={styles.root}>
      <button type="button" className={styles.backdrop} aria-label="Fechar detalhes do usuário" onClick={onClose} />

      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Detalhes do usuário">
        <header className={styles.header}>
          <div className={styles.avatar}>{getInitials(detail?.name || user.name || user.email)}</div>
          <div className={styles.headerInfo}>
            <h3>{detail?.name || user.name || "-"}</h3>
            <p>{detail?.email || user.email || "-"}</p>
            <span className={`${styles.verifyBadge} ${detail?.emailVerified ? styles.verifyOk : styles.verifyNo}`}>
              {detail?.emailVerified ? "Verificado" : "Não verificado"}
            </span>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}
        {loading ? <p className={styles.loading}>Carregando usuário...</p> : null}

        <section className={styles.statsGrid}>
          <article className={styles.statCard}>
            <span>Total gasto</span>
            <strong>{formatMoneyCents(stats.totalSpent, "BRL")}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Total de pedidos</span>
            <strong>{stats.totalOrders}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Tempo de conta</span>
            <strong>{stats.accountAge}</strong>
          </article>
        </section>

        <section className={styles.section}>
          <h4>Dados Pessoais</h4>
          <div className={styles.infoGrid}>
            <div className={styles.field}>
              <label>Título</label>
              {isEditing && draft ? (
                <select
                  className={styles.inlineInput}
                  value={draft.title || "nao_informar"}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, title: event.target.value as UserDraft["title"] } : current))
                  }
                >
                  <option value="nao_informar">Não informar</option>
                  <option value="sr">Sr.</option>
                  <option value="sra">Sra.</option>
                  <option value="srta">Srta.</option>
                </select>
              ) : (
                <p>{toTitleLabel(detail?.title || user.title || "")}</p>
              )}
            </div>

            <div className={styles.field}>
              <label>Nome completo</label>
              {isEditing && draft ? (
                <input
                  className={styles.inlineInput}
                  value={draft.name}
                  onChange={(event) => setDraft((current) => (current ? { ...current, name: event.target.value } : current))}
                />
              ) : (
                <p>{detail?.name || user.name || "-"}</p>
              )}
            </div>

            <div className={styles.field}>
              <label>Telefone</label>
              {isEditing && draft ? (
                <input
                  className={styles.inlineInput}
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, phone: formatPhoneInput(event.target.value) } : current))
                  }
                  inputMode="numeric"
                  maxLength={15}
                  placeholder="(11) 99999-9999"
                />
              ) : (
                <p>{detail?.phone || user.phone || "-"}</p>
              )}
            </div>

            <div className={styles.field}>
              <label>Data de nascimento</label>
              {isEditing && draft ? (
                <input
                  className={styles.inlineInput}
                  value={draft.birthDate}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, birthDate: formatBirthDateInput(event.target.value) } : current))
                  }
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="DD/MM/AAAA"
                />
              ) : (
                <p>{formatDate(detail?.birthDate || null)}</p>
              )}
            </div>

            <div className={styles.field}>
              <label>CPF</label>
              {isEditing && draft ? (
                <input
                  className={styles.inlineInput}
                  value={draft.cpf}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, cpf: formatCpfInput(event.target.value) } : current))
                  }
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="000.000.000-00"
                />
              ) : (
                <p>{maskCpf(detail?.cpf || "")}</p>
              )}
            </div>

            <div className={styles.field}>
              <label>CEP</label>
              {isEditing && draft ? (
                <input
                  className={styles.inlineInput}
                  value={draft.cep}
                  onChange={(event) => setDraft((current) => (current ? { ...current, cep: event.target.value } : current))}
                />
              ) : (
                <p>{detail?.cep || user.cep || "-"}</p>
              )}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h4>Pedidos Anteriores</h4>
          {ordersLoading ? <p className={styles.loading}>Carregando pedidos...</p> : null}
          {!ordersLoading && orders.length === 0 ? <p className={styles.empty}>Nenhum pedido encontrado.</p> : null}
          {!ordersLoading && orders.length > 0 ? (
            <div className={styles.orderList}>
              {orders.map((order) => {
                const status = toStatusBadge(order.status);
                const fullId = String(order.id || "");
                const shortId = fullId.length > 14 ? `${fullId.slice(0, 10)}...` : fullId || "-";
                return (
                  <article key={order.id} className={styles.orderCard}>
                    <div className={styles.orderTop}>
                      <code>{shortId}</code>
                      <span className={`${styles.statusBadge} ${styles[`status${status.tone}`]}`}>{status.label}</span>
                    </div>
                    <p>
                      {order.productName || "Pedido"} · {formatDateTime(order.createdAt)}
                    </p>
                    <strong>{formatMoneyCents(order.amount, order.currency)}</strong>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <footer className={styles.footer}>
          {!isEditing ? (
            <>
              <button type="button" className={styles.btnReset} onClick={handleResetSenha} disabled={actionLoading.length > 0}>
                <RefreshCcw size={14} strokeWidth={1.8} />
                {actionLoading === "reset" ? "Enviando..." : "Resetar senha"}
              </button>
              <button type="button" className={styles.btnEdit} onClick={() => onSetEditing(true)} disabled={actionLoading.length > 0}>
                <PencilLine size={14} strokeWidth={1.8} />
                Editar dados
              </button>
              <button
                type="button"
                className={styles.btnSuspend}
                onClick={() => setConfirmMode("suspend")}
                disabled={actionLoading.length > 0}
              >
                {isSuspended ? <Unlock size={14} strokeWidth={1.8} /> : <Lock size={14} strokeWidth={1.8} />}
                {isSuspended ? "Reativar conta" : "Suspender conta"}
              </button>
              <button type="button" className={styles.btnDelete} onClick={() => setConfirmMode("delete")} disabled={actionLoading.length > 0}>
                <Trash2 size={14} strokeWidth={1.8} />
                Excluir usuário
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.btnEdit} onClick={() => onSetEditing(false)} disabled={actionLoading === "save"}>
                Cancelar
              </button>
              <button type="button" className={styles.btnSave} onClick={handleSalvar} disabled={actionLoading === "save"}>
                {actionLoading === "save" ? "Salvando..." : "Salvar alterações"}
              </button>
            </>
          )}
        </footer>
      </aside>

      {confirmMode ? (
        <div className={styles.confirmLayer} role="dialog" aria-modal="true" aria-label="Confirmar ação">
          <button type="button" className={styles.confirmBackdrop} onClick={() => setConfirmMode(null)} aria-label="Cancelar" />
          <div className={styles.confirmCard}>
            {confirmMode === "suspend" ? (
              <>
                <h5>{isSuspended ? "Reativar conta?" : "Suspender conta?"}</h5>
                <p>
                  {isSuspended
                    ? `Deseja reativar a conta de ${detail?.name || user.name || "usuário"}?`
                    : `Tem certeza que deseja suspender a conta de ${
                        detail?.name || user.name || "usuário"
                      }? O usuário não conseguirá fazer login até ser reativado.`}
                </p>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.btnEdit} onClick={() => setConfirmMode(null)}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.btnSuspend} onClick={handleToggleSuspensao} disabled={actionLoading === "suspend"}>
                    {actionLoading === "suspend" ? "Salvando..." : isSuspended ? "Reativar" : "Suspender"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h5>Excluir usuário?</h5>
                <p className={styles.confirmDangerText}>
                  Esta ação é irreversível. Todos os dados do usuário serão excluídos permanentemente.
                </p>
                <div className={styles.confirmActions}>
                  <button type="button" className={styles.btnEdit} onClick={() => setConfirmMode(null)}>
                    Cancelar
                  </button>
                  <button type="button" className={styles.btnDeleteSolid} onClick={handleExcluir} disabled={actionLoading === "delete"}>
                    {actionLoading === "delete" ? "Excluindo..." : "Excluir permanentemente"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
