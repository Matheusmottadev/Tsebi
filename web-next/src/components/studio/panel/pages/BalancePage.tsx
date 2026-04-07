"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createBalanceRequestAdmin,
  getBalanceCustomerAdmin,
  listBalanceCustomerOrdersAdmin,
  listMyBalanceRequestsAdmin,
  searchBalanceCustomersAdmin,
  type AdminUserOrderRow,
  type BalanceCustomer,
  type BalanceRequestRow,
} from "@/services/admin";

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents || 0) || 0) / 100);
}

function formatDate(value: string | null, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(date);
}

function getInitials(name: string, email: string) {
  const source = String(name || "").trim() || String(email || "").trim();
  if (!source) return "CL";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "CL";
}

function parseAmountToCents(value: string) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatReason(reason: BalanceRequestRow["reason"]) {
  const labels: Record<BalanceRequestRow["reason"], string> = {
    product_return: "Devolução de produto",
    billing_error: "Erro de cobrança",
    courtesy: "Cortesia",
    manual_adjustment: "Ajuste manual",
    other: "Outro motivo",
  };
  return labels[reason] || reason;
}

function formatOrderStatus(status: string) {
  const normalized = String(status || "").trim().toLowerCase();
  if (["paid", "pago", "processing", "em_transito", "shipped"].includes(normalized)) return "Em trânsito";
  if (["delivered", "entregue"].includes(normalized)) return "Entregue";
  if (["pending_payment", "pending", "pendente"].includes(normalized)) return "Pendente";
  if (["canceled", "cancelado", "failed"].includes(normalized)) return "Cancelado";
  return normalized || "-";
}

function orderStatusTone(status: string) {
  const label = formatOrderStatus(status);
  if (label === "Entregue") return { background: "rgba(101, 163, 13, 0.18)", color: "#bef264" };
  if (label === "Em trânsito") return { background: "rgba(59, 130, 246, 0.18)", color: "#93c5fd" };
  if (label === "Pendente") return { background: "rgba(245, 158, 11, 0.18)", color: "#fcd34d" };
  return { background: "rgba(248, 113, 113, 0.18)", color: "#fca5a5" };
}

function requestStatusTone(status: BalanceRequestRow["status"]) {
  if (status === "approved") return { background: "rgba(101, 163, 13, 0.16)", color: "#bef264", label: "Aprovada" };
  if (status === "rejected") return { background: "rgba(239, 68, 68, 0.16)", color: "#fca5a5", label: "Rejeitada" };
  return { background: "rgba(59, 130, 246, 0.16)", color: "#93c5fd", label: "Pendente" };
}

export function BalancePage({ csrfToken, refreshKey = 0 }: { csrfToken?: string; refreshKey?: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BalanceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<BalanceCustomer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<AdminUserOrderRow[]>([]);
  const [requests, setRequests] = useState<BalanceRequestRow[]>([]);
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<BalanceRequestRow["reason"]>("manual_adjustment");
  const [reasonDetail, setReasonDetail] = useState("");
  const [relatedOrderId, setRelatedOrderId] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function loadMyRequests() {
    try {
      const response = await listMyBalanceRequestsAdmin({ cache: "no-store" });
      setRequests(Array.isArray(response.rows) ? response.rows : []);
    } catch {
      setRequests([]);
    }
  }

  useEffect(() => {
    loadMyRequests();
  }, [refreshKey]);

  useEffect(() => {
    if (query.trim().length < 2 || selectedCustomer) {
      if (!selectedCustomer) setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchBalanceCustomersAdmin(query, { cache: "no-store" });
        setResults(Array.isArray(response.rows) ? response.rows : []);
      } catch {
        setResults([]);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query, selectedCustomer]);

  async function handleSelectCustomer(customerId: string) {
    try {
      const [customerResponse, ordersResponse] = await Promise.all([
        getBalanceCustomerAdmin(customerId, { cache: "no-store" }),
        listBalanceCustomerOrdersAdmin(customerId, { cache: "no-store" }),
      ]);
      setSelectedCustomer(customerResponse.customer || null);
      setCustomerOrders(Array.isArray(ordersResponse) ? ordersResponse : []);
      setMessage("");
      setReason("manual_adjustment");
      setReasonDetail("");
      setRelatedOrderId("");
      setInternalNote("");
      setAmount("");
      setType("credit");
    } catch {
      setSelectedCustomer(null);
      setCustomerOrders([]);
    }
  }

  async function handleSubmit() {
    if (!selectedCustomer?.id) return;
    const amountCents = parseAmountToCents(amount);
    const canSubmit = amountCents > 0 && (reason !== "other" || reasonDetail.trim().length > 0);
    if (!canSubmit) return;

    setSubmitting(true);
    setMessage("");
    try {
      await createBalanceRequestAdmin(
        {
          customerId: selectedCustomer.id,
          type,
          amount: amountCents / 100,
          reason,
          reasonDetail: reason === "other" ? reasonDetail : "",
          relatedOrderId,
          internalNote,
        },
        csrfToken,
        { cache: "no-store" }
      );
      setAmount("");
      setReason("manual_adjustment");
      setReasonDetail("");
      setRelatedOrderId("");
      setInternalNote("");
      setMessage("Solicitação enviada para aprovação da Diretoria.");
      await loadMyRequests();
      const refreshedCustomer = await getBalanceCustomerAdmin(selectedCustomer.id, { cache: "no-store" }).catch(() => null);
      const refreshedOrders = await listBalanceCustomerOrdersAdmin(selectedCustomer.id, { cache: "no-store" }).catch(() => []);
      if (refreshedCustomer?.customer) setSelectedCustomer(refreshedCustomer.customer);
      setCustomerOrders(Array.isArray(refreshedOrders) ? refreshedOrders : []);
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível enviar a solicitação."));
    } finally {
      setSubmitting(false);
    }
  }

  const amountCents = useMemo(() => parseAmountToCents(amount), [amount]);
  const resultingBalanceCents = useMemo(() => {
    const wallet = Number(selectedCustomer?.walletCents || 0);
    if (!amountCents) return wallet;
    return type === "debit" ? wallet - amountCents : wallet + amountCents;
  }, [selectedCustomer?.walletCents, amountCents, type]);
  const canSubmit = Boolean(selectedCustomer?.id) && amountCents > 0 && (reason !== "other" || reasonDetail.trim().length > 0);
  const latestRequests = useMemo(() => requests.slice(0, 4), [requests]);

  const shellStyle: React.CSSProperties = {
    borderRadius: 30,
    background: "radial-gradient(circle at top left, rgba(196, 167, 117, 0.12), transparent 32%), linear-gradient(180deg, #191816 0%, #111111 100%)",
    color: "#f7f1e8",
    padding: "28px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    minHeight: 720,
    border: "1px solid rgba(196, 167, 117, 0.18)",
    boxShadow: "0 32px 90px rgba(10, 10, 10, 0.16)",
  };

  if (!selectedCustomer) {
    return (
      <div style={shellStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h2 style={{ margin: 0, fontSize: 40, lineHeight: 1, fontWeight: 600, color: "#fffaf3" }}>Saldo de Clientes</h2>
          <p style={{ margin: 0, color: "#bdb2a5", fontSize: 17 }}>
            Busque um cliente para visualizar ou modificar o saldo.
          </p>
        </div>

        <div
          style={{
            margin: "40px auto 0",
            width: "min(760px, 100%)",
            borderRadius: 28,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "40px 32px",
            display: "grid",
            gap: 18,
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ textAlign: "center", display: "grid", gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 36, fontWeight: 600, color: "#fff8ef" }}>Encontre o cliente</h3>
            <p style={{ margin: 0, color: "#beb3a7", fontSize: 15 }}>
              Pesquise por nome, e-mail ou ID para começar. Busque por “Marina”, “Rafael” ou “Juliana” para testar.
            </p>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, e-mail ou ID do cliente..."
              style={{
                width: "100%",
                borderRadius: 16,
                border: "1px solid rgba(196, 167, 117, 0.55)",
                background: "#1c1b19",
                color: "#fff7eb",
                padding: "18px 20px",
                fontSize: 26,
                outline: "none",
                boxShadow: "0 0 0 3px rgba(196, 167, 117, 0.14)",
              }}
            />

            {results.length > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                {results.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => handleSelectCustomer(customer.id)}
                    style={{
                      border: "1px solid rgba(255,255,255,0.10)",
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff8ef",
                      padding: "16px 18px",
                      textAlign: "left",
                      display: "grid",
                      gridTemplateColumns: "auto 1fr auto",
                      gap: 14,
                      alignItems: "center",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 14,
                        display: "grid",
                        placeItems: "center",
                        background: "rgba(196, 167, 117, 0.18)",
                        color: "#f6dfba",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {getInitials(customer.name, customer.email)}
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong style={{ fontSize: 16 }}>{customer.name || "Cliente"}</strong>
                      <span style={{ fontSize: 13, color: "#cfc3b7" }}>{customer.email}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#f4e2c8", whiteSpace: "nowrap" }}>Selecionar</div>
                  </button>
                ))}
              </div>
            ) : query.trim().length >= 2 ? (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px dashed rgba(255,255,255,0.12)",
                  padding: "18px 20px",
                  color: "#beb3a7",
                  textAlign: "center",
                }}
              >
                Nenhum cliente encontrado para essa busca.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setSelectedCustomer(null);
            setCustomerOrders([]);
            setRelatedOrderId("");
            setMessage("");
          }}
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 14,
            background: "transparent",
            color: "#fff8ef",
            padding: "12px 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ← Voltar à busca
        </button>

        <div style={{ color: "#bdb2a5", fontSize: 14 }}>
          Cliente selecionado: <strong style={{ color: "#fff7eb" }}>{selectedCustomer.name || selectedCustomer.email}</strong>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "360px minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 18 }}>
          <section
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
              padding: 22,
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 16,
                  display: "grid",
                  placeItems: "center",
                  background: "rgba(196, 167, 117, 0.18)",
                  color: "#f7dfb8",
                  fontWeight: 700,
                  fontSize: 20,
                }}
              >
                {getInitials(selectedCustomer.name, selectedCustomer.email)}
              </div>
              <div style={{ display: "grid", gap: 3 }}>
                <strong style={{ fontSize: 22, color: "#fffaf3" }}>{selectedCustomer.name || "Cliente"}</strong>
                <span style={{ color: "#beb3a7", fontSize: 14 }}>{selectedCustomer.email}</span>
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#a99985" }}>Informações</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: "#bdb2a5" }}>ID</span><strong>{selectedCustomer.id.slice(0, 8).toUpperCase()}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: "#bdb2a5" }}>Telefone</span><strong>{selectedCustomer.phone || "-"}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: "#bdb2a5" }}>Cliente desde</span><strong>{formatDate(selectedCustomer.createdAt)}</strong></div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}><span style={{ color: "#bdb2a5" }}>Pedidos</span><strong>{customerOrders.length} pedidos</strong></div>
              </div>
            </div>
          </section>

          <section
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
              padding: 22,
              display: "grid",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#a99985" }}>Modificar saldo</div>

            <div
              style={{
                borderRadius: 18,
                background: "rgba(255,255,255,0.04)",
                padding: 18,
                display: "grid",
                gap: 10,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#a99985" }}>Saldo atual</div>
              <div style={{ fontSize: 42, lineHeight: 1, fontWeight: 700, color: "#fffaf3" }}>{formatMoney(selectedCustomer.walletCents)}</div>
              <div style={{ fontSize: 13, color: resultingBalanceCents < 0 ? "#fca5a5" : "#cdbfae" }}>
                Saldo resultante: <strong style={{ color: resultingBalanceCents < 0 ? "#fca5a5" : "#fff0d8" }}>{formatMoney(resultingBalanceCents)}</strong>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <button
                type="button"
                onClick={() => setType("credit")}
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: type === "credit" ? "1px solid #d4b98f" : "1px solid rgba(255,255,255,0.10)",
                  background: type === "credit" ? "#f1dec0" : "transparent",
                  color: type === "credit" ? "#1a1713" : "#fff6ea",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                + Adicionar
              </button>
              <button
                type="button"
                onClick={() => setType("debit")}
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: type === "debit" ? "1px solid rgba(248, 113, 113, 0.45)" : "1px solid rgba(255,255,255,0.10)",
                  background: type === "debit" ? "rgba(248, 113, 113, 0.14)" : "transparent",
                  color: "#fff6ea",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                − Remover
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#c5b8a8" }}>Valor</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Ex: 150,00"
                  style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#1a1917", color: "#fff8ef", padding: "14px 16px", fontSize: 24 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#c5b8a8" }}>Motivo</span>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as BalanceRequestRow["reason"])}
                  style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#1a1917", color: "#fff8ef", padding: "14px 16px" }}
                >
                  <option value="product_return">Devolução de produto</option>
                  <option value="billing_error">Erro de cobrança</option>
                  <option value="courtesy">Cortesia</option>
                  <option value="manual_adjustment">Ajuste manual</option>
                  <option value="other">Outro motivo</option>
                </select>
              </label>

              {reason === "other" ? (
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "#c5b8a8" }}>Detalhe do motivo</span>
                  <textarea
                    value={reasonDetail}
                    onChange={(event) => setReasonDetail(event.target.value)}
                    placeholder="Explique o contexto da alteração"
                    rows={3}
                    style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#1a1917", color: "#fff8ef", padding: "14px 16px", resize: "vertical" }}
                  />
                </label>
              ) : null}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#c5b8a8" }}>Pedido relacionado (opcional)</span>
                <input
                  value={relatedOrderId}
                  onChange={(event) => setRelatedOrderId(event.target.value)}
                  placeholder="Clique em Vincular na tabela"
                  style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#1a1917", color: "#fff8ef", padding: "14px 16px" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#c5b8a8" }}>Observação interna (opcional)</span>
                <textarea
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  placeholder="Contexto adicional para a equipe..."
                  rows={3}
                  style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)", background: "#1a1917", color: "#fff8ef", padding: "14px 16px", resize: "vertical" }}
                />
              </label>
            </div>

            {message ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: message.includes("aprovação") ? "1px solid rgba(101, 163, 13, 0.28)" : "1px solid rgba(248, 113, 113, 0.24)",
                  background: message.includes("aprovação") ? "rgba(101, 163, 13, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: message.includes("aprovação") ? "#d9f99d" : "#fecaca",
                  fontSize: 13,
                }}
              >
                {message}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              style={{
                border: "1px solid rgba(212, 185, 143, 0.46)",
                borderRadius: 16,
                background: canSubmit && !submitting ? "#f1dec0" : "rgba(255,255,255,0.08)",
                color: canSubmit && !submitting ? "#171411" : "#b7ab9d",
                padding: "15px 18px",
                fontWeight: 800,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              }}
            >
              {submitting ? "Enviando..." : "Enviar edição para aprovação"}
            </button>
          </section>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          <section
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
              padding: 22,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#a99985" }}>Pedidos do cliente</div>
                <div style={{ marginTop: 6, fontSize: 14, color: "#c5b8a8" }}>Clique em <strong style={{ color: "#fff4e0" }}>Vincular</strong> para usar um pedido no ajuste.</div>
              </div>
              {relatedOrderId ? (
                <button
                  type="button"
                  onClick={() => setRelatedOrderId("")}
                  style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, background: "transparent", color: "#fff6ea", padding: "10px 12px", cursor: "pointer" }}
                >
                  Limpar vínculo
                </button>
              ) : null}
            </div>

            {customerOrders.length ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
                  <thead>
                    <tr>
                      {["Pedido", "Data", "Total", "Status", ""].map((label) => (
                        <th key={label} style={{ padding: "0 0 14px", textAlign: "left", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9f917f", fontWeight: 500 }}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customerOrders.map((order) => {
                      const statusTone = orderStatusTone(order.status);
                      const isLinked = relatedOrderId === order.id;
                      return (
                        <tr key={order.id}>
                          <td style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fffaf3", fontWeight: 700 }}>PED-{String(order.orderNumber || order.id).slice(-4)}</td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#d2c7bb" }}>{formatDate(order.createdAt)}</td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.08)", color: "#fffaf3", fontWeight: 700 }}>{formatMoney(order.amount)}</td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                            <span style={{ display: "inline-flex", borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 700, ...statusTone }}>
                              {formatOrderStatus(order.status)}
                            </span>
                          </td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => setRelatedOrderId(isLinked ? "" : order.id)}
                              style={{
                                border: "1px solid rgba(255,255,255,0.12)",
                                borderRadius: 12,
                                background: isLinked ? "#f1dec0" : "transparent",
                                color: isLinked ? "#15120f" : "#f5eadc",
                                padding: "10px 12px",
                                cursor: "pointer",
                                fontWeight: 700,
                              }}
                            >
                              {isLinked ? "Vinculado" : "Vincular"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ borderRadius: 16, border: "1px dashed rgba(255,255,255,0.10)", padding: "22px", color: "#beb3a7", textAlign: "center" }}>
                Este cliente ainda não possui pedidos para vincular.
              </div>
            )}
          </section>

          <section
            style={{
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.05)",
              padding: 22,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#a99985" }}>Minhas solicitações</div>
                <div style={{ marginTop: 6, fontSize: 14, color: "#c5b8a8" }}>Acompanhamento rápido das últimas alterações solicitadas.</div>
              </div>
            </div>

            {latestRequests.length ? (
              <div style={{ display: "grid", gap: 10 }}>
                {latestRequests.map((request) => {
                  const tone = requestStatusTone(request.status);
                  return (
                    <div
                      key={request.id}
                      style={{
                        borderRadius: 16,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.04)",
                        padding: "14px 16px",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 15, color: "#fffaf3" }}>{request.customerName || request.customerEmail || "Cliente"}</strong>
                        <span style={{ display: "inline-flex", borderRadius: 999, padding: "5px 10px", fontSize: 11, fontWeight: 700, ...tone }}>{tone.label}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#d3c7bb" }}>
                        {request.type === "debit" ? "Remover saldo" : "Adicionar saldo"} de <strong style={{ color: "#fff4e0" }}>{formatMoney(Math.round(request.amount * 100))}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#aa9a88" }}>
                        {formatReason(request.reason)} • {formatDate(request.createdAt, true)}
                      </div>
                      {request.rejectionReason ? <div style={{ fontSize: 12, color: "#fca5a5" }}>Motivo da rejeição: {request.rejectionReason}</div> : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ borderRadius: 16, border: "1px dashed rgba(255,255,255,0.10)", padding: "22px", color: "#beb3a7", textAlign: "center" }}>
                Você ainda não criou solicitações de saldo.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
