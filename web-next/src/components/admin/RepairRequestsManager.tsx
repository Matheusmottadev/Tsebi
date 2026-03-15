"use client";

import { useMemo, useState } from "react";
import { SearchBar, type FilterConfig, type SortOption } from "@/components/studio/panel/SearchBar";
import { updateRepairAdmin } from "@/services/admin";
import type { RepairRequest } from "@/types";
import styles from "./RepairRequestsManager.module.css";

type Props = {
  rows: RepairRequest[];
  loading: boolean;
  errorMessage: string;
  csrfToken?: string;
  onRowsChange: (rows: RepairRequest[]) => void;
  onRequestRefresh?: () => void;
};

type FlowStatus = Exclude<RepairRequest["status"], "pending" | "rejected">;

const REPAIR_FLOW_OPTIONS: Array<{ value: FlowStatus; label: string }> = [
  { value: "awaiting_shipment", label: "Aguardando envio da peça" },
  { value: "item_received", label: "Peça recebida" },
  { value: "in_repair", label: "Em reparo" },
  { value: "completed", label: "Finalizado" },
  { value: "returned", label: "Devolvido" },
];

const SLA_BUSINESS_DAYS_LIMIT = 7;

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatStatus(value: RepairRequest["status"]): string {
  if (value === "awaiting_shipment") return "Aguardando envio";
  if (value === "item_received") return "Peça recebida";
  if (value === "in_repair") return "Em reparo";
  if (value === "completed") return "Finalizado";
  if (value === "returned") return "Devolvido";
  if (value === "rejected") return "Recusado";
  return "Pendente";
}

function formatDecisionOutcome(value: RepairRequest["decisionOutcome"]): string {
  if (value === "accepted") return "Aceita";
  if (value === "rejected") return "Recusada";
  return "Pendente";
}

function isRepairActiveForSla(status: RepairRequest["status"]): boolean {
  return status !== "rejected" && status !== "returned";
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getBusinessDaysSince(value: string | null, now = new Date()): number {
  if (!value) return 0;
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 0;

  const current = startOfDay(now);
  const cursor = startOfDay(start);
  let count = 0;

  while (cursor < current) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }

  return count;
}

function getRepairSlaBusinessDays(repair: RepairRequest): number {
  return getBusinessDaysSince(repair.updatedAt || repair.reviewedAt || repair.createdAt);
}

function isRepairSlaLate(repair: RepairRequest): boolean {
  return isRepairActiveForSla(repair.status) && getRepairSlaBusinessDays(repair) > SLA_BUSINESS_DAYS_LIMIT;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Falha ao atualizar solicitação.";
}

export function RepairRequestsManager({
  rows,
  loading,
  errorMessage,
  csrfToken = "",
  onRowsChange,
  onRequestRefresh,
}: Props) {
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [pieceFilter, setPieceFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sort, setSort] = useState("mais_recente");
  const [selectedRepair, setSelectedRepair] = useState<RepairRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("awaiting_shipment");
  const [trackingCode, setTrackingCode] = useState("");
  const [pieceReceivedAt, setPieceReceivedAt] = useState("");
  const [returnPostedAt, setReturnPostedAt] = useState("");
  const [returnedDeliveredAt, setReturnedDeliveredAt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState("");

  const isPendingDecision = selectedRepair?.status === "pending";
  const isClosedDecision = selectedRepair?.status === "rejected" || selectedRepair?.status === "returned";
  const selectedRepairSlaBusinessDays = selectedRepair ? getRepairSlaBusinessDays(selectedRepair) : 0;
  const selectedRepairSlaLate = selectedRepair ? isRepairSlaLate(selectedRepair) : false;

  const filteredRows = useMemo(() => {
    const query = normalizeText(search);
    const clientQuery = normalizeText(clientFilter);
    const pieceQuery = normalizeText(pieceFilter);
    const now = new Date();
    const next = [...rows].filter((row) => {
      if (statusFilter !== "todos" && row.status !== statusFilter) return false;
      if (dateFilter !== "todos") {
        const createdAt = row.createdAt ? new Date(row.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        const ageMs = now.getTime() - createdAt.getTime();
        if (dateFilter === "hoje" && startOfDay(createdAt).getTime() !== startOfDay(now).getTime()) return false;
        if (dateFilter === "7_dias" && ageMs > 7 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "30_dias" && ageMs > 30 * 24 * 60 * 60 * 1000) return false;
        if (dateFilter === "mes_atual") {
          if (createdAt.getMonth() !== now.getMonth() || createdAt.getFullYear() !== now.getFullYear()) return false;
        }
      }
      if (clientQuery) {
        const clientHaystack = [row.userName, row.userEmail].map((item) => normalizeText(item)).join(" ");
        if (!clientHaystack.includes(clientQuery)) return false;
      }
      if (pieceQuery) {
        const pieceHaystack = [row.pieceName, row.repairType].map((item) => normalizeText(item)).join(" ");
        if (!pieceHaystack.includes(pieceQuery)) return false;
      }
      if (!query) return true;
      const haystack = [
        row.userName,
        row.userEmail,
        row.orderRef,
        row.pieceName,
        row.repairType,
        row.description,
        row.returnAddress,
        row.trackingCode,
      ]
        .map((item) => normalizeText(item))
        .join(" ");
      return haystack.includes(query);
    });

    next.sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      if (sort === "mais_antigo") return leftTime - rightTime;
      return rightTime - leftTime;
    });
    return next;
  }, [rows, search, clientFilter, pieceFilter, dateFilter, statusFilter, sort]);

  const slaLateCount = useMemo(() => filteredRows.filter((row) => isRepairSlaLate(row)).length, [filteredRows]);

  const filterConfigs: FilterConfig[] = [
    {
      key: "status",
      value: statusFilter,
      onChange: setStatusFilter,
      options: [
        { label: "Status: Todos", value: "todos" },
        { label: "Pendentes", value: "pending" },
        { label: "Aguardando envio", value: "awaiting_shipment" },
        { label: "Peça recebida", value: "item_received" },
        { label: "Em reparo", value: "in_repair" },
        { label: "Finalizados", value: "completed" },
        { label: "Devolvidos", value: "returned" },
        { label: "Recusados", value: "rejected" },
      ],
    },
    {
      key: "data",
      value: dateFilter,
      onChange: setDateFilter,
      options: [
        { label: "Data: Todas", value: "todos" },
        { label: "Hoje", value: "hoje" },
        { label: "Últimos 7 dias", value: "7_dias" },
        { label: "Últimos 30 dias", value: "30_dias" },
        { label: "Mês atual", value: "mes_atual" },
      ],
    },
  ];

  const sortOptions: SortOption[] = [
    {
      key: "ordem",
      value: sort,
      onChange: setSort,
      options: [
        { label: "Mais recente", value: "mais_recente" },
        { label: "Mais antigo", value: "mais_antigo" },
      ],
    },
  ];

  function resetSearch() {
    setSearch("");
    setClientFilter("");
    setPieceFilter("");
    setDateFilter("todos");
    setStatusFilter("todos");
    setSort("mais_recente");
  }

  function openDetails(repair: RepairRequest) {
    setSelectedRepair(repair);
    setRejectReason(repair.rejectionReason || "");
    setAdminNote(repair.adminNote || "");
    setFlowStatus(repair.status === "pending" || repair.status === "rejected" ? "awaiting_shipment" : repair.status);
    setTrackingCode(repair.trackingCode || "");
    setPieceReceivedAt(toDateTimeLocalValue(repair.pieceReceivedAt));
    setReturnPostedAt(toDateTimeLocalValue(repair.returnPostedAt));
    setReturnedDeliveredAt(toDateTimeLocalValue(repair.returnedDeliveredAt));
    setInlineError("");
  }

  function closeDetails() {
    if (isSubmitting) return;
    setSelectedRepair(null);
    setRejectReason("");
    setAdminNote("");
    setFlowStatus("awaiting_shipment");
    setTrackingCode("");
    setPieceReceivedAt("");
    setReturnPostedAt("");
    setReturnedDeliveredAt("");
    setInlineError("");
  }

  async function submitDecision(decision: "accept" | "reject") {
    if (!selectedRepair) return;
    if (decision === "reject" && !String(rejectReason || "").trim()) {
      setInlineError("Informe o motivo da recusa.");
      return;
    }

    setIsSubmitting(true);
    setInlineError("");
    try {
      const response = await updateRepairAdmin(
        selectedRepair.id,
        {
          decision,
          rejectionReason: rejectReason,
          adminNote,
          trackingCode,
          pieceReceivedAt: pieceReceivedAt || null,
          returnPostedAt: returnPostedAt || null,
          returnedDeliveredAt: returnedDeliveredAt || null,
        },
        csrfToken
      );

      onRowsChange(rows.map((row) => (row.id === response.repair.id ? response.repair : row)));
      setSelectedRepair(response.repair);
      if (response.repair.status !== "pending" && response.repair.status !== "rejected") {
        setFlowStatus(response.repair.status);
      }
      onRequestRefresh?.();
    } catch (error) {
      setInlineError(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitFlowStatus() {
    if (!selectedRepair || selectedRepair.status === "pending" || selectedRepair.status === "rejected" || selectedRepair.status === "returned") {
      return;
    }

    setIsSubmitting(true);
    setInlineError("");
    try {
      const response = await updateRepairAdmin(
        selectedRepair.id,
        {
          status: flowStatus,
          adminNote,
          trackingCode,
          pieceReceivedAt: pieceReceivedAt || null,
          returnPostedAt: returnPostedAt || null,
          returnedDeliveredAt: returnedDeliveredAt || null,
        },
        csrfToken
      );

      onRowsChange(rows.map((row) => (row.id === response.repair.id ? response.repair : row)));
      setSelectedRepair(response.repair);
      if (response.repair.status !== "pending" && response.repair.status !== "rejected") {
        setFlowStatus(response.repair.status);
      }
      onRequestRefresh?.();
    } catch (error) {
      setInlineError(pickErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <SearchBar
        placeholder="Buscar por cliente, e-mail, pedido, peça ou tipo de reparo"
        value={search}
        onChange={setSearch}
        filters={filterConfigs}
        sortOptions={sortOptions}
        resultsCount={filteredRows.length}
        onClear={resetSearch}
      />

      <div className={styles.filterRow}>
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>Cliente</label>
          <input
            className={styles.filterInput}
            type="text"
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            placeholder="Nome ou e-mail"
          />
        </div>
        <div className={styles.filterField}>
          <label className={styles.filterLabel}>Peça</label>
          <input
            className={styles.filterInput}
            type="text"
            value={pieceFilter}
            onChange={(event) => setPieceFilter(event.target.value)}
            placeholder="Nome da peça ou reparo"
          />
        </div>
      </div>

      {slaLateCount > 0 ? (
        <p className={styles.slaBanner}>
          {slaLateCount} {slaLateCount === 1 ? "reparo está parado" : "reparos estão parados"} há mais de{" "}
          {SLA_BUSINESS_DAYS_LIMIT} dias úteis e precisam de atenção.
        </p>
      ) : null}
      {errorMessage ? <p className={styles.warning}>{errorMessage}</p> : null}
      {loading ? <p className={styles.loading}>Carregando reparos...</p> : null}

      {filteredRows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cliente</th>
                <th>Peça</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Criado em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((repair) => {
                const slaLate = isRepairSlaLate(repair);
                const slaBusinessDays = getRepairSlaBusinessDays(repair);

                return (
                <tr key={repair.id} className={slaLate ? styles.rowSlaLate : undefined}>
                  <td>{repair.orderRef || "-"}</td>
                  <td>{repair.userName || repair.userEmail || "-"}</td>
                  <td>{repair.pieceName || "-"}</td>
                  <td>{repair.repairType || "-"}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${repair.status}`]}`}>{formatStatus(repair.status)}</span>
                    {slaLate ? (
                      <p className={styles.slaInline}>Parado há {slaBusinessDays} dias úteis</p>
                    ) : null}
                  </td>
                  <td>{formatDateTime(repair.createdAt)}</td>
                  <td className={styles.actionCell}>
                    <button type="button" className={styles.btnDetails} onClick={() => openDetails(repair)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.noResults}>Nenhuma solicitação de reparo encontrada.</p>
      )}

      {selectedRepair ? (
        <>
          <button type="button" className={styles.backdrop} aria-label="Fechar detalhes do reparo" onClick={closeDetails} />
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Solicitação de reparo</p>
                <h2 className={styles.title}>{selectedRepair.pieceName}</h2>
                <p className={styles.subTitle}>
                  {selectedRepair.orderRef} · {selectedRepair.userName || selectedRepair.userEmail}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={closeDetails}>
                Fechar
              </button>
            </div>

            <div className={styles.detailsGrid}>
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>Cliente</p>
                <p className={styles.infoValue}>{selectedRepair.userName || "-"}</p>
              </div>
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>E-mail</p>
                <p className={styles.infoValue}>{selectedRepair.userEmail || "-"}</p>
              </div>
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>Tipo de reparo</p>
                <p className={styles.infoValue}>{selectedRepair.repairType || "-"}</p>
              </div>
              <div className={styles.infoBlock}>
                <p className={styles.infoLabel}>Status</p>
                <p className={styles.infoValue}>{formatStatus(selectedRepair.status)}</p>
              </div>
              <div className={`${styles.infoBlock} ${styles.infoBlockFull}`}>
                <p className={styles.infoLabel}>Descrição</p>
                <p className={styles.infoText}>{selectedRepair.description || "-"}</p>
              </div>
              <div className={`${styles.infoBlock} ${styles.infoBlockFull}`}>
                <p className={styles.infoLabel}>Endereço para devolução</p>
                <p className={styles.infoText}>{selectedRepair.returnAddress || "-"}</p>
              </div>
            </div>

            {selectedRepairSlaLate ? (
              <div className={styles.slaWarningBox}>
                <p className={styles.infoLabel}>SLA</p>
                <p className={styles.infoText}>
                  Esta solicitação está sem atualização há {selectedRepairSlaBusinessDays} dias úteis.
                </p>
              </div>
            ) : null}

            <div className={styles.photosSection}>
              <p className={styles.infoLabel}>Fotos enviadas</p>
              {selectedRepair.photos.length > 0 ? (
                <div className={styles.photosGrid}>
                  {selectedRepair.photos.map((photo) => (
                    <a
                      key={`${photo.url}-${photo.fileName}`}
                      href={photo.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.photoCard}
                    >
                      <img src={photo.url} alt={selectedRepair.pieceName} className={styles.photoImage} />
                    </a>
                  ))}
                </div>
              ) : (
                <p className={styles.infoText}>Nenhuma foto enviada.</p>
              )}
            </div>

            <div className={styles.logisticsSection}>
              <p className={styles.infoLabel}>Logistica</p>
              <div className={styles.auditGrid}>
                <div>
                  <p className={styles.infoLabel}>Codigo de rastreio</p>
                  <p className={styles.infoText}>{selectedRepair.trackingCode || "-"}</p>
                </div>
                <div>
                  <p className={styles.infoLabel}>Peca recebida no atelie</p>
                  <p className={styles.infoText}>{formatDateTime(selectedRepair.pieceReceivedAt)}</p>
                </div>
                <div>
                  <p className={styles.infoLabel}>Postagem de devolucao</p>
                  <p className={styles.infoText}>{formatDateTime(selectedRepair.returnPostedAt)}</p>
                </div>
                <div>
                  <p className={styles.infoLabel}>Entrega ao cliente</p>
                  <p className={styles.infoText}>{formatDateTime(selectedRepair.returnedDeliveredAt)}</p>
                </div>
              </div>
            </div>

            <div className={styles.decisionSection}>
              <div className={styles.field}>
                <label className={styles.infoLabel}>Nota interna</label>
                <textarea
                  className={styles.textarea}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  placeholder="Observações internas sobre a análise."
                  rows={3}
                  disabled={isClosedDecision || isSubmitting}
                />
              </div>

              <div className={styles.field}>
                {isPendingDecision ? (
                  <>
                    <label className={styles.infoLabel}>Motivo da recusa</label>
                    <textarea
                      className={styles.textarea}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Preencha apenas se a solicitação for recusada."
                      rows={4}
                      disabled={isClosedDecision || isSubmitting}
                    />
                  </>
                ) : (
                  <>
                    <label className={styles.infoLabel}>Etapa do processo</label>
                    <select
                      className={styles.select}
                      value={flowStatus}
                      onChange={(event) => setFlowStatus(event.target.value as FlowStatus)}
                      disabled={isClosedDecision || isSubmitting}
                    >
                      {REPAIR_FLOW_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            </div>

            <div className={styles.decisionSection}>
              <div className={styles.field}>
                <label className={styles.infoLabel}>Codigo de rastreio</label>
                <input
                  className={styles.input}
                  value={trackingCode}
                  onChange={(event) => setTrackingCode(event.target.value)}
                  placeholder="Ex.: BR123456789"
                  disabled={isClosedDecision || isSubmitting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.infoLabel}>Peca recebida no atelie</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={pieceReceivedAt}
                  onChange={(event) => setPieceReceivedAt(event.target.value)}
                  disabled={isClosedDecision || isSubmitting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.infoLabel}>Postagem de devolucao</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={returnPostedAt}
                  onChange={(event) => setReturnPostedAt(event.target.value)}
                  disabled={isClosedDecision || isSubmitting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.infoLabel}>Entrega ao cliente</label>
                <input
                  className={styles.input}
                  type="datetime-local"
                  value={returnedDeliveredAt}
                  onChange={(event) => setReturnedDeliveredAt(event.target.value)}
                  disabled={isClosedDecision || isSubmitting}
                />
              </div>
            </div>

            {selectedRepair.rejectionReason ? (
              <div className={styles.reasonBox}>
                <p className={styles.infoLabel}>Motivo enviado ao cliente</p>
                <p className={styles.infoText}>{selectedRepair.rejectionReason}</p>
              </div>
            ) : null}

            {selectedRepair.decisionOutcome ? (
              <div className={styles.auditBox}>
                <p className={styles.infoLabel}>Auditoria da decisao</p>
                <div className={styles.auditGrid}>
                  <div>
                    <p className={styles.infoLabel}>Resultado</p>
                    <p className={styles.infoText}>{formatDecisionOutcome(selectedRepair.decisionOutcome)}</p>
                  </div>
                  <div>
                    <p className={styles.infoLabel}>Quando</p>
                    <p className={styles.infoText}>{formatDateTime(selectedRepair.decisionAt)}</p>
                  </div>
                  <div>
                    <p className={styles.infoLabel}>Quem decidiu</p>
                    <p className={styles.infoText}>
                      {selectedRepair.decisionByAdminName || selectedRepair.decisionByAdminEmail || selectedRepair.decisionByAdminId || "-"}
                    </p>
                  </div>
                  <div>
                    <p className={styles.infoLabel}>Motivo na decisao</p>
                    <p className={styles.infoText}>{selectedRepair.decisionReason || "-"}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {inlineError ? <p className={styles.errorText}>{inlineError}</p> : null}
            {isClosedDecision ? (
              <p className={styles.warning}>
                Esta solicitação já foi {selectedRepair.status === "returned" ? "finalizada e devolvida" : "recusada"} e não pode ser alterada novamente.
              </p>
            ) : null}

            <div className={styles.actions}>
              {isPendingDecision ? (
                <>
                  <button
                    type="button"
                    className={styles.acceptBtn}
                    onClick={() => submitDecision("accept")}
                    disabled={isSubmitting || isClosedDecision}
                  >
                    {isSubmitting ? "Salvando..." : "Aceitar solicitação"}
                  </button>
                  <button
                    type="button"
                    className={styles.rejectBtn}
                    onClick={() => submitDecision("reject")}
                    disabled={isSubmitting || isClosedDecision}
                  >
                    {isSubmitting ? "Salvando..." : "Recusar solicitação"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={styles.acceptBtn}
                  onClick={submitFlowStatus}
                  disabled={isSubmitting || isClosedDecision || flowStatus === selectedRepair.status}
                >
                  {isSubmitting ? "Salvando..." : "Atualizar etapa"}
                </button>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
