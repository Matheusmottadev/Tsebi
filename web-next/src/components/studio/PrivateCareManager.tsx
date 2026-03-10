"use client";

import { useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  updatePrivateCareAdmin,
  type AdminPrivateCareRequest,
} from "@/services/admin";
import styles from "./PrivateCareManager.module.css";

type PrivateCareManagerProps = {
  rows: AdminPrivateCareRequest[];
  csrfToken: string;
};

type FlashTone = "ok" | "error";

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

function normalizeSlotsInput(value: string): string[] {
  return String(value || "")
    .split(/\r?\n|[,;]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function slotsToText(value: Array<string | { label?: string; date?: string; time?: string; startsAt?: string }> | undefined): string {
  if (!Array.isArray(value) || !value.length) return "";
  return value
    .map((slot) => {
      if (typeof slot === "string") return slot.trim();
      const label = String(slot?.label || "").trim();
      if (label) return label;
      const date = String(slot?.date || "").trim();
      const time = String(slot?.time || "").trim();
      if (date || time) return `${date} ${time}`.trim();
      const startsAt = String(slot?.startsAt || "").trim();
      return startsAt;
    })
    .filter(Boolean)
    .join("\n");
}

function toStatusLabel(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "novo";
  if (["accepted", "aprovado", "aceito", "agendado"].includes(normalized)) return "aceito";
  if (["declined", "rejected", "recusado"].includes(normalized)) return "recusado";
  if (["completed", "concluido", "concluído"].includes(normalized)) return "concluido";
  if (["canceled", "cancelado"].includes(normalized)) return "cancelado";
  return normalized;
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message || "Falha ao atualizar atendimento.";
  if (error instanceof Error) return error.message || "Falha ao atualizar atendimento.";
  return "Falha ao atualizar atendimento.";
}

export function PrivateCareManager({ rows, csrfToken }: PrivateCareManagerProps) {
  const [items, setItems] = useState<AdminPrivateCareRequest[]>(rows);
  const [busyId, setBusyId] = useState("");
  const [flash, setFlash] = useState<{ tone: FlashTone; text: string } | null>(null);

  const [slotDraft, setSlotDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, slotsToText(row.availableSlots)]))
  );
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, String(row.adminNote || "")]))
  );

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    [items]
  );

  function mergeUpdatedRow(id: string, patch: Partial<AdminPrivateCareRequest>) {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function patchRequest(
    id: string,
    payload: {
      status?: string;
      decision?: "accept" | "decline";
      availableSlots?: string[];
      adminNote?: string;
    },
    successText: string
  ) {
    setBusyId(id);
    setFlash(null);
    try {
      const response = await updatePrivateCareAdmin(id, payload, csrfToken);
      const fromApi = response?.request;
      if (fromApi) {
        mergeUpdatedRow(id, fromApi);
        setSlotDraft((prev) => ({ ...prev, [id]: slotsToText(fromApi.availableSlots) }));
        setNoteDraft((prev) => ({ ...prev, [id]: String(fromApi.adminNote || "") }));
      } else {
        const nextPatch: Partial<AdminPrivateCareRequest> = {};
        if (payload.status) nextPatch.status = payload.status;
        if (payload.availableSlots) nextPatch.availableSlots = payload.availableSlots;
        if (payload.adminNote !== undefined) nextPatch.adminNote = payload.adminNote;
        mergeUpdatedRow(id, nextPatch);
      }
      setFlash({ tone: "ok", text: successText });
    } catch (error) {
      setFlash({ tone: "error", text: pickErrorMessage(error) });
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className={styles.wrap}>
      {flash ? <p className={flash.tone === "ok" ? styles.ok : styles.error}>{flash.text}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Solicitacao</th>
              <th>Status</th>
              <th>Horarios disponiveis</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((row) => {
              const isBusy = busyId === row.id;
              return (
                <tr key={row.id}>
                  <td>
                    <div className={styles.userCell}>
                      <strong>{row.userName || "-"}</strong>
                      <small>{row.userEmail || "-"}</small>
                      <small>ID: {row.id}</small>
                    </div>
                  </td>
                  <td>
                    <div className={styles.requestCell}>
                      <p>
                        <strong>{row.subject || "-"}</strong>
                      </p>
                      <p>{row.message || "-"}</p>
                      <small>
                        Canal: {row.channel || "-"} | Data: {row.date || "-"} | Hora: {row.time || "-"}
                      </small>
                      <small>Criado: {formatDateTime(row.createdAt)}</small>
                    </div>
                  </td>
                  <td>
                    <span className={styles.statusChip}>{toStatusLabel(row.status)}</span>
                  </td>
                  <td>
                    <textarea
                      className={styles.textarea}
                      rows={5}
                      placeholder={"Ex:\n11/03 10:00\n11/03 14:30"}
                      value={slotDraft[row.id] || ""}
                      onChange={(event) => setSlotDraft((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    />
                    <textarea
                      className={styles.textarea}
                      rows={3}
                      placeholder="Observacao interna (opcional)"
                      value={noteDraft[row.id] || ""}
                      onChange={(event) => setNoteDraft((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    />
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          patchRequest(
                            row.id,
                            {
                              status: "accepted",
                              decision: "accept",
                              adminNote: String(noteDraft[row.id] || "").trim(),
                            },
                            "Atendimento aceito."
                          )
                        }
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          patchRequest(
                            row.id,
                            {
                              status: "declined",
                              decision: "decline",
                              adminNote: String(noteDraft[row.id] || "").trim(),
                            },
                            "Atendimento recusado."
                          )
                        }
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() =>
                          patchRequest(
                            row.id,
                            {
                              availableSlots: normalizeSlotsInput(slotDraft[row.id] || ""),
                              adminNote: String(noteDraft[row.id] || "").trim(),
                            },
                            "Horarios disponiveis atualizados."
                          )
                        }
                      >
                        Salvar horarios
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sortedItems.length ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Nenhum atendimento encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

