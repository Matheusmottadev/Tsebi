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

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
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
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sort, setSort] = useState("mais_recente");
  const [selectedRepair, setSelectedRepair] = useState<RepairRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [flowStatus, setFlowStatus] = useState<FlowStatus>("awaiting_shipment");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState("");

  const isPendingDecision = selectedRepair?.status === "pending";
  const isClosedDecision = selectedRepair?.status === "rejected" || selectedRepair?.status === "returned";

  const filteredRows = useMemo(() => {
    const query = normalizeText(search);
    const next = [...rows].filter((row) => {
      if (statusFilter !== "todos" && row.status !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        row.userName,
        row.userEmail,
        row.orderRef,
        row.pieceName,
        row.repairType,
        row.description,
        row.returnAddress,
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
  }, [rows, search, statusFilter, sort]);

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
    setStatusFilter("todos");
    setSort("mais_recente");
  }

  function openDetails(repair: RepairRequest) {
    setSelectedRepair(repair);
    setRejectReason(repair.rejectionReason || "");
    setAdminNote(repair.adminNote || "");
    setFlowStatus(repair.status === "pending" || repair.status === "rejected" ? "awaiting_shipment" : repair.status);
    setInlineError("");
  }

  function closeDetails() {
    if (isSubmitting) return;
    setSelectedRepair(null);
    setRejectReason("");
    setAdminNote("");
    setFlowStatus("awaiting_shipment");
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
              {filteredRows.map((repair) => (
                <tr key={repair.id}>
                  <td>{repair.orderRef || "-"}</td>
                  <td>{repair.userName || repair.userEmail || "-"}</td>
                  <td>{repair.pieceName || "-"}</td>
                  <td>{repair.repairType || "-"}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[`status_${repair.status}`]}`}>{formatStatus(repair.status)}</span>
                  </td>
                  <td>{formatDateTime(repair.createdAt)}</td>
                  <td className={styles.actionCell}>
                    <button type="button" className={styles.btnDetails} onClick={() => openDetails(repair)}>
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
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
