"use client";

import { useMemo, useState } from "react";
import {
  listAppointmentSlotsAdmin,
  rescheduleAppointmentAdmin,
  type AdminAppointmentSlot,
  type AdminAppointmentBooking,
} from "@/services/admin";
import styles from "./RescheduleModal.module.css";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

function todayKey(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function fmtDateLong(isoDate: string): string {
  const parts = isoDate.split("-");
  const year = parts[0] || "";
  const month = parseInt(parts[1] || "0") - 1;
  const day = parseInt(parts[2] || "0");
  return `${day} de ${MONTHS_PT[month] || ""}, ${year}`;
}

type Step = "date" | "time" | "confirm";

type Props = {
  appointment: AdminAppointmentBooking;
  csrfToken: string;
  onClose: () => void;
  onSuccess: (appt: AdminAppointmentBooking) => void;
};

export function RescheduleModal({ appointment, csrfToken, onClose, onSuccess }: Props) {
  const today = todayKey();
  const [calYear, setCalYear] = useState(() => parseInt(today.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => parseInt(today.slice(5, 7)) - 1);
  const [step, setStep] = useState<Step>("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<AdminAppointmentSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AdminAppointmentSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const firstDay = useMemo(() => new Date(calYear, calMonth, 1).getDay(), [calYear, calMonth]);
  const daysInMonth = useMemo(() => new Date(calYear, calMonth + 1, 0).getDate(), [calYear, calMonth]);

  function changeMonth(delta: number) {
    setCalMonth((m) => {
      const nm = m + delta;
      if (nm < 0) { setCalYear((y) => y - 1); return 11; }
      if (nm > 11) { setCalYear((y) => y + 1); return 0; }
      return nm;
    });
  }

  async function handlePickDate(dateKey: string) {
    setSelectedDate(dateKey);
    setLoadingSlots(true);
    setError(null);
    setSlots([]);
    try {
      const res = await listAppointmentSlotsAdmin({ date: dateKey });
      const available = (res.rows || []).filter(
        (s) => s.isAvailable && !s.isBlocked && s.remainingCount > 0 && s.id !== appointment.slotId
      );
      setSlots(available);
      setStep("time");
    } catch {
      setError("Falha ao carregar horários.");
      setStep("time");
    } finally {
      setLoadingSlots(false);
    }
  }

  async function handleConfirm() {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      const res = await rescheduleAppointmentAdmin(appointment.id, selectedSlot.id, csrfToken);
      onSuccess(res.appointment);
    } catch {
      setError("Falha ao remarcar agendamento. Tente novamente.");
      setSaving(false);
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.modal}>
        <div className={styles.hdr}>
          <div>
            <div className={styles.metaLbl}>REMARCAR AGENDAMENTO</div>
            <div className={styles.metaVal}>{appointment.userName || appointment.userEmail}</div>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.steps}>
          <span className={step === "date" ? styles.stepActive : styles.stepDone}>1. Data</span>
          <span className={styles.stepSep}>→</span>
          <span className={step === "time" ? styles.stepActive : step === "confirm" ? styles.stepDone : styles.stepPending}>
            2. Horário
          </span>
          <span className={styles.stepSep}>→</span>
          <span className={step === "confirm" ? styles.stepActive : styles.stepPending}>3. Confirmar</span>
        </div>

        <div className={styles.body}>
          {step === "date" ? (
            <div>
              <div className={styles.monthNav}>
                <button type="button" className={styles.navBtn} onClick={() => changeMonth(-1)}>‹</button>
                <span className={styles.monthLabel}>{MONTHS_PT[calMonth]} {calYear}</span>
                <button type="button" className={styles.navBtn} onClick={() => changeMonth(1)}>›</button>
              </div>
              <div className={styles.dayLabels}>
                {DAY_LABELS.map((d) => <span key={d} className={styles.dayLbl}>{d}</span>)}
              </div>
              <div className={styles.calGrid}>
                {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const isPast = dateKey < today;
                  const isToday = dateKey === today;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      disabled={isPast || loadingSlots}
                      className={`${styles.dayCell} ${isPast ? styles.dayCellPast : ""} ${isToday ? styles.dayCellToday : ""}`}
                      onClick={() => handlePickDate(dateKey)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === "time" ? (
            <div>
              <div className={styles.timeDateLabel}>
                {selectedDate ? fmtDateLong(selectedDate) : ""}
              </div>
              {loadingSlots ? (
                <p className={styles.loading}>Carregando horários...</p>
              ) : slots.length === 0 ? (
                <p className={styles.noSlots}>Nenhum horário disponível neste dia.</p>
              ) : (
                <div className={styles.slotList}>
                  {slots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`${styles.slotBtn} ${selectedSlot?.id === s.id ? styles.slotBtnActive : ""}`}
                      onClick={() => { setSelectedSlot(s); setStep("confirm"); }}
                    >
                      {s.time}
                      {s.label ? ` — ${s.label}` : ""}
                      <span className={styles.slotCapInfo}>
                        {s.remainingCount} vaga{s.remainingCount !== 1 ? "s" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" className={styles.backBtn} onClick={() => setStep("date")}>← Voltar</button>
            </div>
          ) : null}

          {step === "confirm" && selectedSlot ? (
            <div>
              <div className={styles.deParaCard}>
                <div className={styles.deParaItem}>
                  <span className={styles.deParaLbl}>DE</span>
                  <span className={styles.deParaVal}>{appointment.date} às {appointment.time}</span>
                  <span className={styles.deParaSub}>
                    {[appointment.label, appointment.location].filter(Boolean).join(" — ")}
                  </span>
                </div>
                <div className={styles.deParaArrow}>→</div>
                <div className={styles.deParaItem}>
                  <span className={styles.deParaLbl}>PARA</span>
                  <span className={styles.deParaVal}>
                    {selectedDate ? fmtDateLong(selectedDate) : ""} às {selectedSlot.time}
                  </span>
                  <span className={styles.deParaSub}>
                    {[selectedSlot.label, selectedSlot.location].filter(Boolean).join(" — ")}
                  </span>
                </div>
              </div>

              <div className={styles.clientInfo}>
                <div>
                  <span className={styles.dLbl}>Cliente</span>
                  <span className={styles.dVal}>{appointment.userName || "-"}</span>
                </div>
                <div>
                  <span className={styles.dLbl}>Email</span>
                  <span className={styles.dVal} style={{ fontSize: 12 }}>{appointment.userEmail || "-"}</span>
                </div>
                <div>
                  <span className={styles.dLbl}>Serviço</span>
                  <span className={styles.dVal}>{appointment.serviceType || "-"}</span>
                </div>
                <div>
                  <span className={styles.dLbl}>Modalidade</span>
                  <span className={styles.dVal}>{appointment.modality || "-"}</span>
                </div>
              </div>

              <p className={styles.noticeText}>
                O cliente será notificado por e-mail sobre a remarcação.
              </p>

              {error ? <p className={styles.errorText}>{error}</p> : null}

              <div className={styles.confirmActions}>
                <button type="button" className={styles.backBtn} onClick={() => setStep("time")} disabled={saving}>
                  ← Voltar
                </button>
                <button type="button" className={styles.confirmBtn} onClick={handleConfirm} disabled={saving}>
                  {saving ? "Remarcando..." : "Confirmar remarcação"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
