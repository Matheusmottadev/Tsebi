"use client";

import { useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  createAppointmentSlotAdmin,
  deleteAppointmentSlotAdmin,
  updateAppointmentSlotAdmin,
  type AdminAppointmentSlot,
} from "@/services/admin";
import styles from "./PrivateCareManager.module.css";

type PrivateCareManagerProps = {
  rows: AdminAppointmentSlot[];
  csrfToken: string;
};

type FlashTone = "ok" | "error";
type SlotDraft = {
  startsAt: string;
  endsAt: string;
  label: string;
  modality: string;
  location: string;
  adminNote: string;
  capacity: string;
  isAvailable: boolean;
  isBlocked: boolean;
};

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const localValue = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return localValue.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function createDraft(slot?: AdminAppointmentSlot): SlotDraft {
  return {
    startsAt: toDateTimeLocalValue(slot?.startsAt || null),
    endsAt: toDateTimeLocalValue(slot?.endsAt || null),
    label: String(slot?.label || ""),
    modality: String(slot?.modality || ""),
    location: String(slot?.location || ""),
    adminNote: String(slot?.adminNote || ""),
    capacity: String(slot?.capacity || 1),
    isAvailable: slot?.isAvailable ?? true,
    isBlocked: slot?.isBlocked ?? false,
  };
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) return error.message || "Falha ao salvar horario.";
  if (error instanceof Error) return error.message || "Falha ao salvar horario.";
  return "Falha ao salvar horario.";
}

function statusLabel(value: AdminAppointmentSlot["status"]): string {
  if (value === "blocked") return "bloqueado";
  if (value === "unavailable") return "indisponivel";
  if (value === "filled") return "lotado";
  if (value === "booked") return "com agenda";
  return "disponivel";
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function PrivateCareManager({ rows, csrfToken }: PrivateCareManagerProps) {
  const [items, setItems] = useState<AdminAppointmentSlot[]>(rows);
  const [busyId, setBusyId] = useState("");
  const [flash, setFlash] = useState<{ tone: FlashTone; text: string } | null>(null);
  const [createDraftState, setCreateDraftState] = useState<SlotDraft>(() => createDraft());
  const [slotDrafts, setSlotDrafts] = useState<Record<string, SlotDraft>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, createDraft(row)]))
  );

  const sortedItems = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(String(a.startsAt || a.createdAt || 0)).getTime() - new Date(String(b.startsAt || b.createdAt || 0)).getTime()
      ),
    [items]
  );

  function replaceSlot(next: AdminAppointmentSlot) {
    setItems((current) => {
      const exists = current.some((item) => item.id === next.id);
      if (!exists) return [next, ...current];
      return current.map((item) => (item.id === next.id ? next : item));
    });
    setSlotDrafts((current) => ({ ...current, [next.id]: createDraft(next) }));
  }

  async function handleCreate() {
    setBusyId("create");
    setFlash(null);
    try {
      const response = await createAppointmentSlotAdmin(
        {
          startsAt: toIsoDateTime(createDraftState.startsAt),
          endsAt: toIsoDateTime(createDraftState.endsAt),
          label: createDraftState.label,
          modality: createDraftState.modality,
          location: createDraftState.location,
          adminNote: createDraftState.adminNote,
          capacity: Number(createDraftState.capacity || 1),
          isAvailable: createDraftState.isAvailable,
          isBlocked: createDraftState.isBlocked,
        },
        csrfToken
      );
      replaceSlot(response.slot);
      setCreateDraftState(createDraft());
      setFlash({ tone: "ok", text: "Horario criado." });
    } catch (error) {
      setFlash({ tone: "error", text: pickErrorMessage(error) });
    } finally {
      setBusyId("");
    }
  }

  async function handleSave(slotId: string) {
    const draft = slotDrafts[slotId];
    if (!draft) return;
    setBusyId(slotId);
    setFlash(null);
    try {
      const response = await updateAppointmentSlotAdmin(
        slotId,
        {
          startsAt: toIsoDateTime(draft.startsAt),
          endsAt: toIsoDateTime(draft.endsAt),
          label: draft.label,
          modality: draft.modality,
          location: draft.location,
          adminNote: draft.adminNote,
          capacity: Number(draft.capacity || 1),
          isAvailable: draft.isAvailable,
          isBlocked: draft.isBlocked,
        },
        csrfToken
      );
      replaceSlot(response.slot);
      setFlash({ tone: "ok", text: "Horario atualizado." });
    } catch (error) {
      setFlash({ tone: "error", text: pickErrorMessage(error) });
    } finally {
      setBusyId("");
    }
  }

  async function handleDelete(slotId: string) {
    setBusyId(slotId);
    setFlash(null);
    try {
      await deleteAppointmentSlotAdmin(slotId, csrfToken);
      setItems((current) => current.filter((item) => item.id !== slotId));
      setSlotDrafts((current) => {
        const next = { ...current };
        delete next[slotId];
        return next;
      });
      setFlash({ tone: "ok", text: "Horario removido." });
    } catch (error) {
      setFlash({ tone: "error", text: pickErrorMessage(error) });
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className={styles.wrap}>
      {flash ? <p className={flash.tone === "ok" ? styles.ok : styles.error}>{flash.text}</p> : null}

      <section className={styles.createCard}>
        <h3 className={styles.sectionTitle}>Novo horario</h3>
        <div className={styles.formGrid}>
          <label className={styles.field}>
            <span>Inicio</span>
            <input
              type="datetime-local"
              value={createDraftState.startsAt}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, startsAt: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>Fim</span>
            <input
              type="datetime-local"
              value={createDraftState.endsAt}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, endsAt: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>Titulo</span>
            <input
              type="text"
              value={createDraftState.label}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, label: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>Modalidade</span>
            <input
              type="text"
              value={createDraftState.modality}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, modality: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>Local</span>
            <input
              type="text"
              value={createDraftState.location}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, location: event.target.value }))}
            />
          </label>
          <label className={styles.field}>
            <span>Capacidade</span>
            <input
              type="number"
              min={1}
              max={20}
              value={createDraftState.capacity}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, capacity: event.target.value }))}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Observacao interna</span>
            <textarea
              rows={3}
              value={createDraftState.adminNote}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, adminNote: event.target.value }))}
            />
          </label>
        </div>
        <div className={styles.toggles}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={createDraftState.isAvailable}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, isAvailable: event.target.checked }))}
            />
            <span>Disponivel</span>
          </label>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={createDraftState.isBlocked}
              onChange={(event) => setCreateDraftState((current) => ({ ...current, isBlocked: event.target.checked }))}
            />
            <span>Bloqueado</span>
          </label>
          <button type="button" className={styles.primaryButton} onClick={handleCreate} disabled={busyId === "create"}>
            {busyId === "create" ? "Salvando..." : "Criar horario"}
          </button>
        </div>
      </section>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Horario</th>
              <th>Status</th>
              <th>Configuracao</th>
              <th>Agendamentos</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((row) => {
              const draft = slotDrafts[row.id] || createDraft(row);
              const isBusy = busyId === row.id;
              return (
                <tr key={row.id}>
                  <td>
                    <div className={styles.infoCell}>
                      <strong>{row.label || "Horario privado"}</strong>
                      <small>{formatDateTime(row.startsAt)} - {formatDateTime(row.endsAt)}</small>
                      <small>{row.modality || "-"} {row.location ? `| ${row.location}` : ""}</small>
                      <small>ID: {row.id}</small>
                    </div>
                  </td>
                  <td>
                    <div className={styles.infoCell}>
                      <span className={styles.statusChip}>{statusLabel(row.status)}</span>
                      <small>
                        {row.bookedCount}/{row.capacity} reservados
                      </small>
                      <small>{row.remainingCount} vagas restantes</small>
                    </div>
                  </td>
                  <td>
                    <div className={styles.formGridCompact}>
                      <label className={styles.field}>
                        <span>Inicio</span>
                        <input
                          type="datetime-local"
                          value={draft.startsAt}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, startsAt: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Fim</span>
                        <input
                          type="datetime-local"
                          value={draft.endsAt}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, endsAt: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Titulo</span>
                        <input
                          type="text"
                          value={draft.label}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, label: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Capacidade</span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={draft.capacity}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, capacity: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Modalidade</span>
                        <input
                          type="text"
                          value={draft.modality}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, modality: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Local</span>
                        <input
                          type="text"
                          value={draft.location}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, location: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label className={`${styles.field} ${styles.fieldWide}`}>
                        <span>Observacao interna</span>
                        <textarea
                          rows={3}
                          value={draft.adminNote}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, adminNote: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.toggles}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={draft.isAvailable}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, isAvailable: event.target.checked },
                            }))
                          }
                        />
                        <span>Disponivel</span>
                      </label>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={draft.isBlocked}
                          onChange={(event) =>
                            setSlotDrafts((current) => ({
                              ...current,
                              [row.id]: { ...draft, isBlocked: event.target.checked },
                            }))
                          }
                        />
                        <span>Bloqueado</span>
                      </label>
                    </div>
                  </td>
                  <td>
                    {row.appointments.length ? (
                      <div className={styles.bookingList}>
                        {row.appointments.map((appointment) => (
                          <article key={appointment.id} className={styles.bookingCard}>
                            <strong>{appointment.userName || appointment.userEmail || "Cliente"}</strong>
                            <small>{appointment.userEmail || "-"}</small>
                            <small>{appointment.serviceType || "-"}</small>
                            <small>{appointment.modality || "-"}</small>
                            {appointment.notes ? <small>{appointment.notes}</small> : null}
                            <small>Status: {appointment.status}</small>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <span className={styles.empty}>Nenhum agendamento.</span>
                    )}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button type="button" disabled={isBusy} onClick={() => handleSave(row.id)}>
                        {isBusy ? "Salvando..." : "Salvar"}
                      </button>
                      <button type="button" disabled={isBusy} onClick={() => handleDelete(row.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!sortedItems.length ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  Nenhum horario encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
