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

function formatPhoneDisplay(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);
  if (!digits) return "-";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `(${ddd}`;
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function parseAmountToCents(value: string) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatAmountInput(value: string) {
  const cleaned = String(value || "").replace(/[^\d,]/g, "");
  if (!cleaned) return "";

  const hasComma = cleaned.includes(",");
  const [rawIntegerPart = "", ...decimalParts] = cleaned.split(",");
  const integerDigits = rawIntegerPart.replace(/^0+(?=\d)/, "");
  const safeInteger = integerDigits || "0";
  const formattedInteger = safeInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimalDigits = decimalParts.join("").slice(0, 2);

  if (hasComma) {
    return `${formattedInteger},${decimalDigits}`;
  }

  return formattedInteger;
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
  if (["delivered", "entregue"].includes(normalized)) return "Entregue";
  if (["canceled", "cancelado", "failed", "refunded"].includes(normalized)) return "Cancelado";
  if (["pending_payment", "pending", "pendente"].includes(normalized)) return "Pendente";
  return "Em análise";
}

function orderStatusTone(status: string) {
  const label = formatOrderStatus(status);
  if (label === "Entregue") return { background: "#effaf2", color: "#166534", border: "#c7ebd1" };
  if (label === "Cancelado") return { background: "#fef2f2", color: "#b42318", border: "#f5c7c7" };
  return { background: "#f5f5f5", color: "#262626", border: "#dfdfdf" };
}

function requestStatusTone(status: BalanceRequestRow["status"]) {
  if (status === "approved") return { background: "#effaf2", color: "#166534", border: "#c7ebd1", label: "Aprovada" };
  if (status === "rejected") return { background: "#fef2f2", color: "#b42318", border: "#f5c7c7", label: "Rejeitada" };
  return { background: "#f5f5f5", color: "#262626", border: "#dfdfdf", label: "Pendente" };
}

function formatCompactOrderLabel(order: AdminUserOrderRow) {
  const base = String(order.orderNumber || order.id || "").trim();
  if (!base) return "-";
  return base.startsWith("PED-") ? base : `PED-${base.slice(-4).toUpperCase()}`;
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
  const [showAllOrders, setShowAllOrders] = useState(false);

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
      setShowAllOrders(false);
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
    const readyToSubmit = amountCents > 0 && (reason !== "other" || reasonDetail.trim().length > 0);
    if (!readyToSubmit) return;

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
      setMessage("Solicitação enviada para aprovação.");
      await loadMyRequests();
      const refreshedCustomer = await getBalanceCustomerAdmin(selectedCustomer.id, { cache: "no-store" }).catch(() => null);
      const refreshedOrders = await listBalanceCustomerOrdersAdmin(selectedCustomer.id, { cache: "no-store" }).catch(() => []);
      if (refreshedCustomer?.customer) setSelectedCustomer(refreshedCustomer.customer);
      setCustomerOrders(Array.isArray(refreshedOrders) ? refreshedOrders : []);
      setShowAllOrders(false);
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
  const visibleOrders = useMemo(
    () => (showAllOrders ? customerOrders : customerOrders.slice(0, 5)),
    [customerOrders, showAllOrders]
  );
  const hasMoreOrders = customerOrders.length > 5;
  const linkedOrder = useMemo(
    () => customerOrders.find((order) => order.id === relatedOrderId) || null,
    [customerOrders, relatedOrderId]
  );

  const cardStyle = {
    border: "1px solid #e7e7e7",
    borderRadius: 22,
    background: "#ffffff",
    padding: 24,
    boxShadow: "0 12px 34px rgba(17, 17, 17, 0.05)",
  };

  const fieldStyle = {
    borderRadius: 14,
    border: "1px solid #dcdcdc",
    background: "#ffffff",
    color: "#111111",
    padding: "14px 16px",
    fontSize: 16,
    outline: "none",
  };

  const selectStyle = {
    ...fieldStyle,
    height: 52,
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    MozAppearance: "none" as const,
    backgroundImage:
      "linear-gradient(45deg, transparent 50%, #111111 50%), linear-gradient(135deg, #111111 50%, transparent 50%)",
    backgroundPosition: "calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px)",
    backgroundSize: "6px 6px, 6px 6px",
    backgroundRepeat: "no-repeat",
    paddingRight: 40,
    boxShadow: "0 1px 0 rgba(17,17,17,0.02)",
  };

  const fieldLabelStyle = {
    fontSize: 12,
    color: "#555555",
    fontWeight: 500,
  };

  if (!selectedCustomer) {
    return (
      <div style={{ display: "grid", gap: 24 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 34,
              lineHeight: 1.05,
              color: "#111111",
              fontFamily: 'var(--font-jost), "Helvetica Neue", Arial, sans-serif',
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            Saldo de Clientes
          </h2>
          <p style={{ margin: 0, color: "#666666", fontSize: 15 }}>
            Consulte o saldo atual do cliente e envie ajustes para aprovação.
          </p>
        </div>

        <section
          style={{
            ...cardStyle,
            maxWidth: 760,
            width: "100%",
            margin: "0 auto",
            display: "grid",
            gap: 18,
            textAlign: "center",
          }}
        >
          <div style={{ display: "grid", gap: 8 }}>
            <h3
              style={{
                margin: 0,
                fontSize: 28,
                color: "#111111",
                fontFamily: 'var(--font-jost), "Helvetica Neue", Arial, sans-serif',
                fontWeight: 500,
                letterSpacing: "-0.02em",
              }}
            >
              Buscar cliente
            </h3>
            <p style={{ margin: 0, color: "#666666", fontSize: 15 }}>
              Digite o nome, e-mail ou ID para localizar a conta e continuar o atendimento.
            </p>
          </div>

          <div style={{ display: "grid", gap: 14, textAlign: "left" }}>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome, e-mail ou ID do cliente..."
              style={{
                ...fieldStyle,
                padding: "18px 20px",
                fontSize: 20,
                borderColor: "#d6d6d6",
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
                      border: "1px solid #e2e2e2",
                      borderRadius: 16,
                      background: "#ffffff",
                      color: "#111111",
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
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        display: "grid",
                        placeItems: "center",
                        background: "#111111",
                        color: "#ffffff",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                      }}
                    >
                      {getInitials(customer.name, customer.email)}
                    </div>
                    <div style={{ display: "grid", gap: 4 }}>
                      <strong style={{ fontSize: 16 }}>{customer.name || "Cliente"}</strong>
                      <span style={{ fontSize: 13, color: "#666666" }}>{customer.email}</span>
                    </div>
                    <span style={{ fontSize: 12, color: "#111111", fontWeight: 600 }}>Selecionar</span>
                  </button>
                ))}
              </div>
            ) : query.trim().length >= 2 ? (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px dashed #d8d8d8",
                  padding: "18px 20px",
                  color: "#666666",
                  textAlign: "center",
                }}
              >
                Nenhum cliente encontrado para essa busca.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 34,
            lineHeight: 1.05,
            color: "#111111",
            fontFamily: 'var(--font-jost), "Helvetica Neue", Arial, sans-serif',
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          Saldo de Clientes
        </h2>
        <p style={{ margin: 0, color: "#666666", fontSize: 15 }}>
          Cliente selecionado: <strong style={{ color: "#111111" }}>{selectedCustomer.name || selectedCustomer.email}</strong>
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setSelectedCustomer(null);
            setCustomerOrders([]);
            setRelatedOrderId("");
            setShowAllOrders(false);
            setMessage("");
          }}
          style={{
            border: "1px solid #d7d7d7",
            borderRadius: 12,
            background: "#ffffff",
            color: "#111111",
            padding: "12px 16px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          ← Voltar à busca
        </button>

        {linkedOrder ? (
          <div style={{ fontSize: 14, color: "#555555" }}>
            Pedido vinculado: <strong style={{ color: "#111111" }}>{formatCompactOrderLabel(linkedOrder)}</strong>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", minWidth: 320, display: "grid", gap: 20 }}>
          <section style={cardStyle}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  display: "grid",
                  placeItems: "center",
                  background: "#111111",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 18,
                }}
              >
                {getInitials(selectedCustomer.name, selectedCustomer.email)}
              </div>
              <div style={{ display: "grid", gap: 3 }}>
                <strong style={{ fontSize: 24, color: "#111111" }}>{selectedCustomer.name || "Cliente"}</strong>
                <span style={{ color: "#666666", fontSize: 14, overflowWrap: "anywhere" }}>{selectedCustomer.email}</span>
              </div>
            </div>

            <div style={{ height: 1, background: "#eeeeee", margin: "16px 0" }} />

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#666666" }}>Informações</div>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#666666" }}>ID</span>
                  <strong style={{ color: "#111111" }}>{selectedCustomer.id.slice(0, 8).toUpperCase()}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#666666" }}>Telefone</span>
                  <strong style={{ color: "#111111", maxWidth: 190, textAlign: "right", overflowWrap: "anywhere" }}>
                    {formatPhoneDisplay(selectedCustomer.phone)}
                  </strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#666666" }}>Cliente desde</span>
                  <strong style={{ color: "#111111" }}>{formatDate(selectedCustomer.createdAt)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <span style={{ color: "#666666" }}>Pedidos</span>
                  <strong style={{ color: "#111111" }}>{customerOrders.length} pedidos</strong>
                </div>
              </div>
            </div>
          </section>

          <section style={cardStyle}>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#666666" }}>Modificar saldo</div>

            <div
              style={{
                borderRadius: 18,
                background: "#f7f7f7",
                padding: 18,
                display: "grid",
                gap: 8,
                marginTop: 14,
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#666666" }}>Saldo atual</div>
              <div style={{ fontSize: 42, lineHeight: 1, fontWeight: 700, color: "#111111" }}>
                {formatMoney(selectedCustomer.walletCents)}
              </div>
              <div style={{ fontSize: 13, color: resultingBalanceCents < 0 ? "#b42318" : "#444444" }}>
                Saldo resultante:{" "}
                <strong style={{ color: resultingBalanceCents < 0 ? "#b42318" : "#111111" }}>
                  {formatMoney(resultingBalanceCents)}
                </strong>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setType("credit")}
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: type === "credit" ? "1px solid #111111" : "1px solid #d8d8d8",
                  background: type === "credit" ? "#111111" : "#ffffff",
                  color: type === "credit" ? "#ffffff" : "#111111",
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
                  border: type === "debit" ? "1px solid #b42318" : "1px solid #d8d8d8",
                  background: type === "debit" ? "#b42318" : "#ffffff",
                  color: type === "debit" ? "#ffffff" : "#111111",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                − Remover
              </button>
            </div>

            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Valor</span>
                <input
                  value={amount}
                  onChange={(event) => setAmount(formatAmountInput(event.target.value))}
                  placeholder="Ex: 150,00"
                  inputMode="decimal"
                  style={fieldStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Motivo</span>
                <select
                  value={reason}
                  onChange={(event) => setReason(event.target.value as BalanceRequestRow["reason"])}
                  style={selectStyle}
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
                  <span style={fieldLabelStyle}>Detalhe do motivo</span>
                  <textarea
                    value={reasonDetail}
                    onChange={(event) => setReasonDetail(event.target.value)}
                    placeholder="Explique o contexto da alteração"
                    rows={3}
                    style={{
                      ...fieldStyle,
                      resize: "vertical",
                      minHeight: 104,
                      lineHeight: 1.5,
                      background: "#fcfcfc",
                    }}
                  />
                </label>
              ) : null}

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Pedido relacionado (opcional)</span>
                <input
                  value={linkedOrder ? formatCompactOrderLabel(linkedOrder) : ""}
                  readOnly
                  placeholder="Clique em Vincular na tabela"
                  style={{
                    ...fieldStyle,
                    background: "#f7f7f7",
                    color: linkedOrder ? "#111111" : "#666666",
                    cursor: "default",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>Observação interna (opcional)</span>
                <textarea
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  placeholder="Contexto adicional para a equipe..."
                  rows={3}
                  style={{ ...fieldStyle, resize: "vertical", minHeight: 104 }}
                />
              </label>
            </div>

            {message ? (
              <div
                style={{
                  borderRadius: 14,
                  padding: "12px 14px",
                  border: message.includes("aprovação") ? "1px solid #c7ebd1" : "1px solid #f5c7c7",
                  background: message.includes("aprovação") ? "#effaf2" : "#fef2f2",
                  color: message.includes("aprovação") ? "#166534" : "#b42318",
                  fontSize: 13,
                  marginTop: 14,
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
                border: "1px solid #111111",
                borderRadius: 16,
                background: canSubmit && !submitting ? "#111111" : "#f0f0f0",
                color: canSubmit && !submitting ? "#ffffff" : "#8b8b8b",
                padding: "15px 18px",
                fontWeight: 700,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                marginTop: 16,
              }}
            >
              {submitting ? "Enviando..." : "Enviar para aprovação"}
            </button>
          </section>
        </div>

        <div style={{ flex: "2 1 620px", minWidth: 340, display: "grid", gap: 20 }}>
          <section style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#666666" }}>Pedidos do cliente</div>
                <div style={{ fontSize: 14, color: "#666666" }}>Clique em <strong style={{ color: "#111111" }}>Vincular</strong> para usar um pedido no ajuste.</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {relatedOrderId ? (
                  <button
                    type="button"
                    onClick={() => setRelatedOrderId("")}
                    style={{
                      border: "1px solid #d7d7d7",
                      borderRadius: 12,
                      background: "#ffffff",
                      color: "#111111",
                      padding: "10px 12px",
                      cursor: "pointer",
                    }}
                  >
                    Limpar vínculo
                  </button>
                ) : null}
                {hasMoreOrders ? (
                  <button
                    type="button"
                    onClick={() => setShowAllOrders((current) => !current)}
                    style={{
                      border: "1px solid #d7d7d7",
                      borderRadius: 12,
                      background: "#ffffff",
                      color: "#111111",
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {showAllOrders ? "Ver menos" : "Ver mais"}
                  </button>
                ) : null}
              </div>
            </div>

            {customerOrders.length ? (
              <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
                  <thead>
                    <tr>
                      {["Pedido", "Data", "Total", "Status", ""].map((label) => (
                        <th
                          key={label}
                          style={{
                            padding: "0 0 14px",
                            textAlign: "left",
                            fontSize: 11,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            color: "#666666",
                            fontWeight: 600,
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => {
                      const statusTone = orderStatusTone(order.status);
                      const isLinked = relatedOrderId === order.id;
                      return (
                        <tr key={order.id}>
                          <td style={{ padding: "14px 0", borderTop: "1px solid #efefef", color: "#111111", fontWeight: 700 }}>
                            {formatCompactOrderLabel(order)}
                          </td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid #efefef", color: "#555555" }}>{formatDate(order.createdAt)}</td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid #efefef", color: "#111111", fontWeight: 700 }}>
                            {formatMoney(order.amount)}
                          </td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid #efefef" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                borderRadius: 999,
                                padding: "6px 12px",
                                fontSize: 12,
                                fontWeight: 700,
                                background: statusTone.background,
                                color: statusTone.color,
                                border: `1px solid ${statusTone.border}`,
                              }}
                            >
                              {formatOrderStatus(order.status)}
                            </span>
                          </td>
                          <td style={{ padding: "14px 0", borderTop: "1px solid #efefef", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => setRelatedOrderId(isLinked ? "" : order.id)}
                              style={{
                                border: isLinked ? "1px solid #111111" : "1px solid #d7d7d7",
                                borderRadius: 12,
                                background: isLinked ? "#111111" : "#ffffff",
                                color: isLinked ? "#ffffff" : "#111111",
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
              <div
                style={{
                  borderRadius: 16,
                  border: "1px dashed #d8d8d8",
                  padding: "22px",
                  color: "#666666",
                  textAlign: "center",
                  marginTop: 14,
                }}
              >
                Este cliente ainda não possui pedidos para vincular.
              </div>
            )}
          </section>

          <section style={cardStyle}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#666666" }}>Minhas solicitações</div>
              <div style={{ fontSize: 14, color: "#666666" }}>Acompanhamento rápido das últimas solicitações de saldo.</div>
            </div>

            {latestRequests.length ? (
              <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                {latestRequests.map((request) => {
                  const tone = requestStatusTone(request.status);
                  return (
                    <div
                      key={request.id}
                      style={{
                        borderRadius: 16,
                        border: "1px solid #ececec",
                        background: "#ffffff",
                        padding: "14px 16px",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 15, color: "#111111" }}>{request.customerName || request.customerEmail || "Cliente"}</strong>
                        <span
                          style={{
                            display: "inline-flex",
                            borderRadius: 999,
                            padding: "5px 10px",
                            fontSize: 11,
                            fontWeight: 700,
                            background: tone.background,
                            color: tone.color,
                            border: `1px solid ${tone.border}`,
                          }}
                        >
                          {tone.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#444444" }}>
                        {request.type === "debit" ? "Remover saldo" : "Adicionar saldo"} de{" "}
                        <strong style={{ color: "#111111" }}>{formatMoney(Math.round(request.amount * 100))}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: "#666666" }}>
                        {formatReason(request.reason)} • {formatDate(request.createdAt, true)}
                      </div>
                      {request.rejectionReason ? (
                        <div style={{ fontSize: 12, color: "#b42318" }}>Motivo da rejeição: {request.rejectionReason}</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  borderRadius: 16,
                  border: "1px dashed #d8d8d8",
                  padding: "22px",
                  color: "#666666",
                  textAlign: "center",
                  marginTop: 14,
                }}
              >
                Você ainda não criou solicitações de saldo.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
