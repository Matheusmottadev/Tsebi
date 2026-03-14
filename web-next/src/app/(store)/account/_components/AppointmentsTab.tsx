"use client";

import { useEffect, useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  cancelMyAppointment,
  createAppointment,
  listAvailableAppointmentSlots,
  listMyAppointments,
  type AppointmentBooking,
  type AppointmentSlot,
} from "@/services/appointments";
import type { PublicUser } from "@/types";
import styles from "../account.module.css";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const SERVICE_TYPES = [
  "Consultoria de estilo",
  "Composicao de looks",
  "Compra assistida",
  "Cuidados com pecas",
];
const MODALITIES = ["WhatsApp", "Ligacao", "Videochamada"];

type Props = { user: PublicUser };

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function buildDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

function statusLabel(value: AppointmentBooking["status"]): string {
  if (value === "completed") return "Concluido";
  if (value === "canceled") return "Cancelado";
  return "Agendado";
}

function isCancelableAppointment(appointment: AppointmentBooking): boolean {
  if (appointment.status !== "scheduled") return false;
  if (!appointment.startsAt) return true;
  const startsAtMs = new Date(appointment.startsAt).getTime();
  if (Number.isNaN(startsAtMs)) return true;
  return startsAtMs > Date.now();
}

function normalizeModality(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("video")) return "Videochamada";
  if (normalized.includes("whats")) return "WhatsApp";
  if (normalized.includes("liga")) return "Ligacao";
  return MODALITIES[0] || "WhatsApp";
}

function getContactFieldMeta(modality: string) {
  if (modality === "Videochamada") {
    return {
      label: "Email Teams",
      placeholder: "seuemail@empresa.com",
      summaryKey: "Email Teams",
    };
  }

  return {
    label: "Numero do cliente",
    placeholder: "(11) 99999-9999",
    summaryKey: "Numero",
  };
}

function isValidTeamsEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhoneNumber(value: string): boolean {
  return String(value || "").replace(/\D/g, "").length >= 10;
}

function buildAppointmentNotes(modality: string, contactValue: string, notes: string): string {
  const meta = getContactFieldMeta(modality);
  const lines = [`${meta.summaryKey}: ${String(contactValue || "").trim()}`];
  const trimmedNotes = String(notes || "").trim();
  if (trimmedNotes) lines.push(`Observacoes: ${trimmedNotes}`);
  return lines.join("\n");
}

export function AppointmentsTab({ user }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [appointments, setAppointments] = useState<AppointmentBooking[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0] || "");
  const [modality, setModality] = useState(MODALITIES[0] || "");
  const [contactValue, setContactValue] = useState(() => String(user.phone || "").trim());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelingId, setCancelingId] = useState("");
  const [confirmCancelId, setConfirmCancelId] = useState("");
  const [flash, setFlash] = useState("");

  const totalDays = daysInMonth(year, month);
  const offset = firstDayOfWeek(year, month);
  const selectedDateKey = selectedDay ? buildDateKey(year, month, selectedDay) : "";
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) || null;
  const contactFieldMeta = getContactFieldMeta(modality);
  const contactValueIsValid =
    modality === "Videochamada" ? isValidTeamsEmail(contactValue) : isValidPhoneNumber(contactValue);

  const sortedAppointments = useMemo(
    () =>
      [...appointments].sort((a, b) => {
        const left = new Date(a.startsAt || a.createdAt || 0).getTime();
        const right = new Date(b.startsAt || b.createdAt || 0).getTime();
        return right - left;
      }),
    [appointments]
  );

  useEffect(() => {
    listMyAppointments()
      .then((response) => {
        setAppointments(response);
        setHistoryError("");
      })
      .catch((error) => {
        if (error instanceof HttpError) {
          setHistoryError(error.message || "Nao foi possivel carregar seus agendamentos.");
        } else {
          setHistoryError("Nao foi possivel carregar seus agendamentos.");
        }
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDateKey) {
      setSlots([]);
      setSelectedSlotId("");
      return;
    }

    setSlotsLoading(true);
    setSlotsError("");
    listAvailableAppointmentSlots(selectedDateKey)
      .then((response) => {
        setSlots(response);
        setSelectedSlotId((current) => (response.some((slot) => slot.id === current) ? current : ""));
      })
      .catch((error) => {
        setSlots([]);
        setSelectedSlotId("");
        if (error instanceof HttpError) {
          setSlotsError(error.message || "Nao foi possivel carregar os horarios.");
        } else {
          setSlotsError("Nao foi possivel carregar os horarios.");
        }
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDateKey]);

  useEffect(() => {
    if (!selectedSlot?.modality) return;
    setModality(normalizeModality(selectedSlot.modality));
  }, [selectedSlot?.id, selectedSlot?.modality]);

  useEffect(() => {
    setContactValue((current) => {
      const trimmed = String(current || "").trim();
      if (modality === "Videochamada") {
        if (!trimmed || isValidPhoneNumber(trimmed)) return String(user.email || "").trim();
        return trimmed;
      }
      if (!trimmed || trimmed.includes("@")) return String(user.phone || "").trim();
      return trimmed;
    });
  }, [modality, user.email, user.phone]);

  const prevMonth = () => {
    if (month === 0) {
      setYear((value) => value - 1);
      setMonth(11);
    } else {
      setMonth((value) => value - 1);
    }
    setSelectedDay(null);
    setSelectedSlotId("");
  };

  const nextMonth = () => {
    if (month === 11) {
      setYear((value) => value + 1);
      setMonth(0);
    } else {
      setMonth((value) => value + 1);
    }
    setSelectedDay(null);
    setSelectedSlotId("");
  };

  const isPast = (day: number) => {
    const value = new Date(year, month, day);
    value.setHours(0, 0, 0, 0);
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    return value < base;
  };

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const formatSelectedDate = () => {
    if (!selectedDay) return "-";
    return `${selectedDay} de ${MONTH_NAMES[month]}, ${year}`;
  };

  async function refreshDaySlots() {
    if (!selectedDateKey) return;
    const response = await listAvailableAppointmentSlots(selectedDateKey);
    setSlots(response);
    setSelectedSlotId("");
  }

  async function handleConfirm() {
    if (!selectedSlotId || !contactValueIsValid) return;
    setSubmitting(true);
    setFlash("");

    try {
      const appointment = await createAppointment({
        slotId: selectedSlotId,
        serviceType,
        modality,
        notes: buildAppointmentNotes(modality, contactValue, notes),
      });
      setAppointments((current) => [appointment, ...current.filter((item) => item.id !== appointment.id)]);
      setNotes("");
      setFlash("Agendamento confirmado.");
      await refreshDaySlots();
    } catch (error) {
      if (error instanceof HttpError) {
        setFlash(error.message || "Nao foi possivel confirmar o agendamento.");
      } else {
        setFlash("Nao foi possivel confirmar o agendamento.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelAppointment(appointment: AppointmentBooking) {
    if (!appointment.id || cancelingId) return;
    setCancelingId(appointment.id);
    setFlash("");

    try {
      const canceled = await cancelMyAppointment(appointment.id);
      setAppointments((current) => current.map((item) => (item.id === canceled.id ? canceled : item)));
      setConfirmCancelId("");
      setFlash("Agendamento cancelado.");
      await refreshDaySlots();
    } catch (error) {
      if (error instanceof HttpError) {
        setFlash(error.message || "Nao foi possivel cancelar o agendamento.");
      } else {
        setFlash("Nao foi possivel cancelar o agendamento.");
      }
    } finally {
      setCancelingId("");
    }
  }

  return (
    <div className={styles.appointmentsGrid}>
      <div>
        <div className={styles.calendarHeader}>
          <button type="button" className={styles.calNavBtn} onClick={prevMonth}>
            ‹
          </button>
          <span className={styles.calMonth}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" className={styles.calNavBtn} onClick={nextMonth}>
            ›
          </button>
        </div>

        <div className={styles.dayNamesRow}>
          {DAY_NAMES.map((dayName) => (
            <div key={dayName} className={styles.dayName}>
              {dayName}
            </div>
          ))}
        </div>

        <div className={styles.dayGrid}>
          {Array.from({ length: offset }, (_, index) => (
            <div key={`empty-${index}`} className={`${styles.day} ${styles.dayEmpty}`} />
          ))}
          {Array.from({ length: totalDays }, (_, index) => {
            const day = index + 1;
            const past = isPast(day);
            const currentDay = isToday(day);
            const selected = selectedDay === day;

            return (
              <button
                key={day}
                type="button"
                className={`${styles.day} ${past ? styles.dayDisabled : ""} ${currentDay ? styles.dayToday : ""} ${selected ? styles.daySelected : ""}`}
                onClick={() => {
                  if (past) return;
                  setSelectedDay(day);
                  setSelectedSlotId("");
                  setFlash("");
                }}
              >
                {day}
              </button>
            );
          })}
        </div>

        {selectedDay ? (
          <div className={styles.slotsSection}>
            <p className={styles.slotsTitle}>Horarios disponiveis</p>
            {slotsLoading ? <p className={styles.loading}>Carregando horarios...</p> : null}
            {slotsError ? <p className={styles.errorState}>{slotsError}</p> : null}
            {!slotsLoading && !slotsError ? (
              <>
                <div className={styles.slotsGrid}>
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={`${styles.slot} ${selectedSlotId === slot.id ? styles.slotSelected : ""}`}
                      onClick={() => setSelectedSlotId(slot.id)}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
                {!slots.length ? (
                  <p className={styles.appointmentsHint}>
                    Nenhum horario futuro liberado para esta data. Horarios que ja passaram nao aparecem aqui.
                  </p>
                ) : null}
                {selectedSlot ? <p className={styles.appointmentsHint}>{selectedSlot.label || "Atendimento privado"}</p> : null}
              </>
            ) : null}
          </div>
        ) : null}

        <div className={styles.appointmentsHistory}>
          <div className={styles.appointmentsHistoryHeader}>
            <p className={styles.slotsTitle}>Seus agendamentos</p>
          </div>
          {historyLoading ? <div className={styles.loading}>Carregando historico...</div> : null}
          {historyError ? <div className={styles.errorState}>{historyError}</div> : null}
          {!historyLoading && !historyError && !sortedAppointments.length ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyTitle}>Nenhum atendimento agendado</p>
              <p className={styles.emptyDesc}>Quando voce confirmar um horario, ele aparecera aqui e no admin.</p>
            </div>
          ) : null}
          {!historyLoading && !historyError && sortedAppointments.length ? (
            <div className={styles.appointmentHistoryList}>
              {sortedAppointments.map((appointment) => (
                <article key={appointment.id} className={styles.appointmentHistoryCard}>
                  <div className={styles.appointmentHistoryRow}>
                    <strong>{appointment.label || appointment.serviceType || "Atendimento privado"}</strong>
                    <span
                      className={`${styles.appointmentStatusBadge} ${
                        appointment.status === "canceled"
                          ? styles.appointmentStatusCanceled
                          : appointment.status === "completed"
                            ? styles.appointmentStatusCompleted
                            : styles.appointmentStatusScheduled
                      }`}
                    >
                      {statusLabel(appointment.status)}
                    </span>
                  </div>
                  <p className={styles.appointmentHistoryMeta}>{formatDateTime(appointment.startsAt)}</p>
                  <p className={styles.appointmentHistoryMeta}>{appointment.modality || "-"}</p>
                  {appointment.notes ? <p className={styles.appointmentHistoryMeta}>{appointment.notes}</p> : null}
                  {isCancelableAppointment(appointment) ? (
                    <div className={styles.appointmentActionStack}>
                      {confirmCancelId === appointment.id ? (
                        <div className={styles.appointmentConfirmBox}>
                          <p className={styles.appointmentConfirmText}>Cancelar este agendamento?</p>
                          <div className={styles.appointmentConfirmActions}>
                            <button
                              type="button"
                              className={styles.appointmentSecondaryButton}
                              onClick={() => setConfirmCancelId("")}
                              disabled={cancelingId === appointment.id}
                            >
                              Voltar
                            </button>
                            <button
                              type="button"
                              className={styles.appointmentDangerButton}
                              onClick={() => handleCancelAppointment(appointment)}
                              disabled={cancelingId === appointment.id}
                            >
                              {cancelingId === appointment.id ? "Cancelando..." : "Confirmar cancelamento"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.appointmentSecondaryButton}
                          onClick={() => {
                            setConfirmCancelId(appointment.id);
                            setFlash("");
                          }}
                        >
                          Cancelar agendamento
                        </button>
                      )}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.appointmentForm}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Tipo de atendimento</label>
          <select className={styles.fieldSelect} value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
            {SERVICE_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Modalidade</label>
          <select className={styles.fieldSelect} value={modality} onChange={(event) => setModality(event.target.value)}>
            {MODALITIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>{contactFieldMeta.label}</label>
          <input
            className={styles.fieldInput}
            type={modality === "Videochamada" ? "email" : "tel"}
            value={contactValue}
            onChange={(event) => setContactValue(event.target.value)}
            placeholder={contactFieldMeta.placeholder}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Observacoes</label>
          <textarea
            className={styles.fieldTextarea}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Descreva suas preferencias ou necessidades especificas."
          />
        </div>

        <div className={styles.summaryBox}>
          <div className={styles.summaryRow}>
            <span className={styles.summaryKey}>Data</span>
            <span className={styles.summaryVal}>{formatSelectedDate()}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryKey}>Horario</span>
            <span className={styles.summaryVal}>{selectedSlot?.time || "-"}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryKey}>Tipo</span>
            <span className={styles.summaryVal}>{serviceType}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryKey}>Modalidade</span>
            <span className={styles.summaryVal}>{modality}</span>
          </div>
          <div className={styles.summaryRow}>
            <span className={styles.summaryKey}>{contactFieldMeta.summaryKey}</span>
            <span className={styles.summaryVal}>{contactValue || "-"}</span>
          </div>
        </div>

        {flash ? <p className={flash === "Agendamento confirmado." ? styles.loading : styles.errorState}>{flash}</p> : null}

        <button
          type="button"
          className={styles.btnSquare}
          onClick={handleConfirm}
          disabled={!selectedSlotId || submitting || !contactValueIsValid}
        >
          {submitting ? "Confirmando..." : "Confirmar agendamento"}
        </button>
      </div>
    </div>
  );
}
