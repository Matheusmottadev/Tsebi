"use client";

import { useState } from "react";
import type { PublicUser } from "@/types";
import styles from "../account.module.css";

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const BASE_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
];
const SERVICE_TYPES = [
  "Consultoria de estilo",
  "Composição de looks",
  "Compra assistida",
  "Cuidados com peças",
];
const MODALITIES = ["Presencial — São Paulo", "Videochamada"];

function getMockSlots(year: number, month: number, day: number) {
  const seed = year * 10000 + month * 100 + day;
  return BASE_SLOTS.map((time, i) => ({
    time,
    taken: ((seed + i * 7) % 5) === 0,
  }));
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Props = { user: PublicUser };

export function AppointmentsTab({ user }: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0] ?? "");
  const [modality, setModality] = useState(MODALITIES[0] ?? "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const totalDays = daysInMonth(year, month);
  const offset = firstDayOfWeek(year, month);
  const slots = selectedDay ? getMockSlots(year, month, selectedDay) : [];

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
    setSelectedSlot(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
    setSelectedSlot(null);
  };

  const isPast = (day: number) => {
    const d = new Date(year, month, day);
    d.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return d < t;
  };

  const isToday = (day: number) => {
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const handleConfirm = async () => {
    if (!selectedDay || !selectedSlot) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  };

  const formatSelectedDate = () => {
    if (!selectedDay) return "—";
    return `${selectedDay} de ${MONTH_NAMES[month]}, ${year}`;
  };

  const defaultAddr =
    user.addresses.find((a) => a.id === user.defaultAddressId) ?? user.addresses[0] ?? null;
  const addressStr = defaultAddr
    ? `${defaultAddr.street}${defaultAddr.number ? `, ${defaultAddr.number}` : ""} — ${defaultAddr.city}`
    : "";

  return (
    <div className={styles.appointmentsGrid}>
      {/* ── Calendar ── */}
      <div>
        <div className={styles.calendarHeader}>
          <button type="button" className={styles.calNavBtn} onClick={prevMonth}>‹</button>
          <span className={styles.calMonth}>
            {MONTH_NAMES[month]} {year}
          </span>
          <button type="button" className={styles.calNavBtn} onClick={nextMonth}>›</button>
        </div>

        <div className={styles.dayNamesRow}>
          {DAY_NAMES.map((d) => (
            <div key={d} className={styles.dayName}>{d}</div>
          ))}
        </div>

        <div className={styles.dayGrid}>
          {Array.from({ length: offset }, (_, i) => (
            <div key={`e-${i}`} className={`${styles.day} ${styles.dayEmpty}`} />
          ))}
          {Array.from({ length: totalDays }, (_, i) => {
            const day = i + 1;
            const past = isPast(day);
            const today_ = isToday(day);
            const selected = selectedDay === day;
            return (
              <button
                key={day}
                type="button"
                className={`${styles.day} ${past ? styles.dayDisabled : ""} ${today_ ? styles.dayToday : ""} ${selected ? styles.daySelected : ""}`}
                onClick={() => {
                  if (past) return;
                  setSelectedDay(day);
                  setSelectedSlot(null);
                }}
              >
                {day}
              </button>
            );
          })}
        </div>

        {selectedDay && (
          <div className={styles.slotsSection}>
            <p className={styles.slotsTitle}>Horários disponíveis</p>
            <div className={styles.slotsGrid}>
              {slots.map(({ time, taken }) => (
                <button
                  key={time}
                  type="button"
                  className={`${styles.slot} ${taken ? styles.slotTaken : ""} ${selectedSlot === time && !taken ? styles.slotSelected : ""}`}
                  onClick={() => !taken && setSelectedSlot(time)}
                  disabled={taken}
                >
                  {time}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Form ── */}
      <div className={styles.appointmentForm}>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Tipo de atendimento</label>
          <select
            className={styles.fieldSelect}
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Modalidade</label>
          <select
            className={styles.fieldSelect}
            value={modality}
            onChange={(e) => setModality(e.target.value)}
          >
            {MODALITIES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.fieldLabel}>Observações</label>
          <textarea
            className={styles.fieldTextarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Descreva suas preferências ou necessidades específicas…"
          />
        </div>

        {(selectedDay || selectedSlot || serviceType || modality) && (
          <div className={styles.summaryBox}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Data</span>
              <span className={styles.summaryVal}>{formatSelectedDate()}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Horário</span>
              <span className={styles.summaryVal}>{selectedSlot ?? "—"}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Tipo</span>
              <span className={styles.summaryVal}>{serviceType}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryKey}>Modalidade</span>
              <span className={styles.summaryVal}>{modality}</span>
            </div>
            {addressStr && modality.startsWith("Presencial") && (
              <div className={styles.summaryRow}>
                <span className={styles.summaryKey}>Local</span>
                <span className={styles.summaryVal}>{addressStr}</span>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className={styles.btnSquare}
          onClick={handleConfirm}
          disabled={!selectedDay || !selectedSlot || submitting}
        >
          {submitted ? "Agendamento confirmado!" : submitting ? "Confirmando…" : "Confirmar agendamento"}
        </button>
      </div>
    </div>
  );
}
