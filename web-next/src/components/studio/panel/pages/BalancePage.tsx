"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchBar } from "@/components/studio/panel/SearchBar";
import {
  createBalanceRequestAdmin,
  getBalanceCustomerAdmin,
  listMyBalanceRequestsAdmin,
  searchBalanceCustomersAdmin,
  type BalanceCustomer,
  type BalanceRequestRow,
} from "@/services/admin";
import styles from "./ConnectedPage.module.css";

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents || 0) || 0) / 100);
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function formatReason(reason: BalanceRequestRow["reason"]): string {
  const labels: Record<BalanceRequestRow["reason"], string> = {
    product_return: "Devolução",
    billing_error: "Erro de cobrança",
    courtesy: "Cortesia",
    manual_adjustment: "Ajuste manual",
    other: "Outro",
  };
  return labels[reason] || reason;
}

function StatusBadge({ status }: { status: BalanceRequestRow["status"] }) {
  const palette =
    status === "approved"
      ? { background: "#ebf6ef", color: "#245b33" }
      : status === "rejected"
        ? { background: "#fbecec", color: "#8d2727" }
        : { background: "#f7f0e5", color: "#7a5d28" };
  return (
    <span
      style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: "4px 9px",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        fontWeight: 600,
        ...palette,
      }}
    >
      {status === "approved" ? "Aprovada" : status === "rejected" ? "Rejeitada" : "Pendente"}
    </span>
  );
}

export function BalancePage({ csrfToken, refreshKey = 0 }: { csrfToken?: string; refreshKey?: number }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BalanceCustomer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<BalanceCustomer | null>(null);
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
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchBalanceCustomersAdmin(query, { cache: "no-store" });
        setResults(Array.isArray(response.rows) ? response.rows : []);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const totalResults = results.length;
  const canSubmit = Boolean(selectedCustomer?.id) && Number(amount.replace(",", ".")) > 0 && (! (reason === "other") || reasonDetail.trim().length > 0);

  async function handleSelectCustomer(customerId: string) {
    try {
      const response = await getBalanceCustomerAdmin(customerId, { cache: "no-store" });
      setSelectedCustomer(response.customer || null);
      setMessage("");
    } catch {
      setSelectedCustomer(null);
    }
  }

  async function handleSubmit() {
    if (!selectedCustomer?.id || !canSubmit) return;
    setSubmitting(true);
    setMessage("");
    try {
      await createBalanceRequestAdmin(
        {
          customerId: selectedCustomer.id,
          type,
          amount: Number(amount.replace(",", ".")),
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
      const refreshed = await getBalanceCustomerAdmin(selectedCustomer.id, { cache: "no-store" }).catch(() => null);
      if (refreshed?.customer) setSelectedCustomer(refreshed.customer);
    } catch (error: any) {
      setMessage(String(error?.message || "Não foi possível criar a solicitação."));
    } finally {
      setSubmitting(false);
    }
  }

  const latestRequest = useMemo(() => requests[0] || null, [requests]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1.05fr 0.95fr" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <SearchBar
            placeholder="Buscar cliente por nome, e-mail ou ID"
            value={query}
            onChange={setQuery}
            resultsCount={totalResults}
            onClear={() => {
              setQuery("");
              setResults([]);
            }}
          />

          {results.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelectCustomer(customer.id)}
                  style={{
                    border: "1px solid #ece7df",
                    borderRadius: 14,
                    background: selectedCustomer?.id === customer.id ? "#f8f1e7" : "#fff",
                    padding: "14px 16px",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong style={{ display: "block", fontSize: 14 }}>{customer.name || "Cliente"}</strong>
                      <span style={{ display: "block", marginTop: 4, color: "#786b5d", fontSize: 12 }}>{customer.email}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#111", fontWeight: 600 }}>{formatMoney(customer.walletCents)}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 2 ? (
            <p className={styles.noResults}>Nenhum cliente encontrado para essa busca.</p>
          ) : null}
        </div>

        <div
          style={{
            border: "1px solid #ece7df",
            borderRadius: 16,
            background: "#fff",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8d7f70" }}>Cliente</div>
            <h3 style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 500 }}>
              {selectedCustomer?.name || "Selecione um cliente"}
            </h3>
            <p style={{ margin: 0, color: "#6a5d50", fontSize: 13 }}>{selectedCustomer?.email || "Busque por nome, e-mail ou ID para continuar."}</p>
          </div>

          <div style={{ padding: "14px 16px", borderRadius: 12, background: "#faf6f1" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#8d7f70" }}>Saldo atual</div>
            <div style={{ marginTop: 8, fontSize: 28, fontWeight: 500 }}>{formatMoney(selectedCustomer?.walletCents || 0)}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10 }}>
            <button
              type="button"
              onClick={() => setType("credit")}
              style={{
                borderRadius: 12,
                border: "1px solid #d9d0c3",
                padding: "12px 14px",
                cursor: "pointer",
                background: type === "credit" ? "#111" : "#fff",
                color: type === "credit" ? "#fff" : "#111",
              }}
            >
              Crédito
            </button>
            <button
              type="button"
              onClick={() => setType("debit")}
              style={{
                borderRadius: 12,
                border: "1px solid #d9d0c3",
                padding: "12px 14px",
                cursor: "pointer",
                background: type === "debit" ? "#111" : "#fff",
                color: type === "debit" ? "#fff" : "#111",
              }}
            >
              Débito
            </button>
          </div>

          <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Valor (ex.: 150 ou 150,50)" style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px" }} />
          <select value={reason} onChange={(event) => setReason(event.target.value as BalanceRequestRow["reason"])} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px" }}>
            <option value="product_return">Devolução de produto</option>
            <option value="billing_error">Erro de cobrança</option>
            <option value="courtesy">Cortesia</option>
            <option value="manual_adjustment">Ajuste manual</option>
            <option value="other">Outro</option>
          </select>
          {reason === "other" ? (
            <textarea value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} placeholder="Explique o motivo" rows={3} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px", resize: "vertical" }} />
          ) : null}
          <input value={relatedOrderId} onChange={(event) => setRelatedOrderId(event.target.value)} placeholder="ID do pedido relacionado (opcional)" style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px" }} />
          <textarea value={internalNote} onChange={(event) => setInternalNote(event.target.value)} placeholder="Observação interna (opcional)" rows={3} style={{ border: "1px solid #e0d8cc", borderRadius: 12, padding: "12px 14px", resize: "vertical" }} />

          {message ? (
            <div style={{ fontSize: 13, color: message.includes("aprovação") ? "#245b33" : "#8d2727" }}>{message}</div>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "14px 18px",
              background: "#111",
              color: "#fff",
              cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
              opacity: canSubmit && !submitting ? 1 : 0.5,
            }}
          >
            {submitting ? "Enviando..." : "Enviar para aprovação"}
          </button>
        </div>
      </div>

      <div style={{ border: "1px solid #ece7df", borderRadius: 16, background: "#fff", padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8d7f70" }}>Minhas solicitações</div>
            <h3 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 500 }}>Acompanhamento</h3>
          </div>
          {latestRequest ? <StatusBadge status={latestRequest.status} /> : null}
        </div>

        {requests.length === 0 ? (
          <p className={styles.noResults}>Você ainda não criou solicitações de saldo.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Operação</th>
                  <th>Valor</th>
                  <th>Motivo</th>
                  <th>Status</th>
                  <th>Rejeição</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td>{formatDate(request.createdAt)}</td>
                    <td>{request.customerName || request.customerEmail || "-"}</td>
                    <td>{request.type === "debit" ? "Débito" : "Crédito"}</td>
                    <td>{formatMoney(Math.round(Number(request.amount || 0) * 100))}</td>
                    <td>{formatReason(request.reason)}</td>
                    <td><StatusBadge status={request.status} /></td>
                    <td>{request.rejectionReason || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
