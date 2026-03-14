"use client";

import { useMemo, useState } from "react";
import {
  createAppointmentSlotAdmin,
  deleteAppointmentSlotAdmin,
  updateAppointmentSlotAdmin,
  cancelAppointmentAdmin,
  type AdminAppointmentSlot,
  type AdminAppointmentBooking,
} from "@/services/admin";
import { RescheduleModal } from "./RescheduleModal";
import styles from "./PrivateCareManager.module.css";

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const ALL_HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];

function todayKey(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function slotDateKey(slot: AdminAppointmentSlot): string {
  if (!slot.startsAt) return "";
  const d = new Date(slot.startsAt);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}

function slotHour(slot: AdminAppointmentSlot): string {
  return (slot.time || "").slice(0, 2);
}

function fmtDateLong(isoDate: string): string {
  const parts = isoDate.split("-");
  const year = parts[0] || "";
  const month = parseInt(parts[1] || "0") - 1;
  const day = parseInt(parts[2] || "0");
  return `${day} de ${MONTHS_PT[month] || ""}, ${year}`;
}

function buildSlotIso(isoDate: string, hour: string, offsetHours = 0): string {
  const d = new Date(`${isoDate}T${hour.padStart(2, "0")}:00:00`);
  d.setHours(d.getHours() + offsetHours);
  return d.toISOString();
}

type Props = {
  rows: AdminAppointmentSlot[];
  csrfToken: string;
};

export function PrivateCareManager({ rows, csrfToken }: Props) {
  const [items, setItems] = useState<AdminAppointmentSlot[]>(rows);
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Calendar
  const today = todayKey();
  const [calYear, setCalYear] = useState(() => parseInt(today.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => parseInt(today.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState(today);

  // Edit Hours Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [modalHours, setModalHours] = useState<Set<string>>(new Set());
  const [dayDisabled, setDayDisabled] = useState(false);
  const [savingModal, setSavingModal] = useState(false);
  const [modalSaved, setModalSaved] = useState(false);

  // Appointment interactions
  const [openApptIds, setOpenApptIds] = useState<Set<string>>(new Set());
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rescheduleAppt, setRescheduleAppt] = useState<AdminAppointmentBooking | null>(null);

  const slotsByDate = useMemo(() => {
    const map: Record<string, AdminAppointmentSlot[]> = {};
    for (const slot of items) {
      const key = slotDateKey(slot);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(slot);
    }
    return map;
  }, [items]);

  const slotsForSelected = useMemo(
    () => (slotsByDate[selectedDate] || []).sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || "")),
    [slotsByDate, selectedDate]
  );

  const appointmentsForSelected = useMemo(
    () =>
      slotsForSelected
        .flatMap((s) => s.appointments || [])
        .filter((a) => a.status !== "canceled")
        .sort((a, b) => (a.startsAt || "").localeCompare(b.startsAt || "")),
    [slotsForSelected]
  );

  function showFlash(tone: "ok" | "error", text: string) {
    setFlash({ tone, text });
    setTimeout(() => setFlash(null), 4000);
  }

  function replaceSlot(next: AdminAppointmentSlot) {
    setItems((cur) => {
      const exists = cur.some((s) => s.id === next.id);
      if (!exists) return [...cur, next];
      return cur.map((s) => (s.id === next.id ? next : s));
    });
  }

  function removeSlot(slotId: string) {
    setItems((cur) => cur.filter((s) => s.id !== slotId));
  }

  function openEditModal() {
    const allBlocked = slotsForSelected.length > 0 && slotsForSelected.every((s) => s.isBlocked);
    setModalHours(new Set(slotsForSelected.filter((s) => !s.isBlocked && s.isAvailable).map(slotHour)));
    setDayDisabled(allBlocked);
    setModalSaved(false);
    setEditModalOpen(true);
  }

  async function handleSaveHours() {
    setSavingModal(true);
    const promises: Promise<void>[] = [];

    for (const hour of ALL_HOURS) {
      const shouldBeActive = modalHours.has(hour) && !dayDisabled;
      const existingSlot = slotsForSelected.find((s) => slotHour(s) === hour);

      if (dayDisabled && existingSlot && !existingSlot.isBlocked) {
        promises.push(
          updateAppointmentSlotAdmin(existingSlot.id, { isBlocked: true }, csrfToken)
            .then((res) => replaceSlot(res.slot))
            .catch(() => {})
        );
      } else if (!dayDisabled) {
        if (shouldBeActive) {
          if (!existingSlot) {
            promises.push(
              createAppointmentSlotAdmin(
                { startsAt: buildSlotIso(selectedDate, hour), endsAt: buildSlotIso(selectedDate, hour, 1), isAvailable: true, isBlocked: false, capacity: 1 },
                csrfToken
              )
                .then((res) => replaceSlot(res.slot))
                .catch(() => {})
            );
          } else if (existingSlot.isBlocked || !existingSlot.isAvailable) {
            promises.push(
              updateAppointmentSlotAdmin(existingSlot.id, { isAvailable: true, isBlocked: false }, csrfToken)
                .then((res) => replaceSlot(res.slot))
                .catch(() => {})
            );
          }
        } else if (!shouldBeActive && existingSlot) {
          if (existingSlot.bookedCount === 0) {
            promises.push(
              deleteAppointmentSlotAdmin(existingSlot.id, csrfToken)
                .then(() => removeSlot(existingSlot.id))
                .catch(() => {})
            );
          } else {
            promises.push(
              updateAppointmentSlotAdmin(existingSlot.id, { isAvailable: false, isBlocked: false }, csrfToken)
                .then((res) => replaceSlot(res.slot))
                .catch(() => {})
            );
          }
        }
      }
    }

    await Promise.all(promises);
    setSavingModal(false);
    setModalSaved(true);
    setTimeout(() => {
      setEditModalOpen(false);
      setModalSaved(false);
    }, 1200);
  }

  async function handleCancelAppointment(appointmentId: string) {
    setCancellingId(appointmentId);
    try {
      await cancelAppointmentAdmin(appointmentId, csrfToken);
      setItems((cur) =>
        cur.map((slot) => ({
          ...slot,
          appointments: slot.appointments.map((a) =>
            a.id === appointmentId ? { ...a, status: "canceled" as const } : a
          ),
        }))
      );
      setCancelConfirmId(null);
      showFlash("ok", "Agendamento cancelado. E-mail enviado ao cliente.");
    } catch {
      showFlash("error", "Falha ao cancelar agendamento.");
    } finally {
      setCancellingId(null);
    }
  }

  function handleRescheduleSuccess(updatedAppt: AdminAppointmentBooking) {
    setItems((cur) =>
      cur.map((slot) => {
        const filtered = slot.appointments.filter((a) => a.id !== updatedAppt.id);
        if (slot.id === updatedAppt.slotId) {
          return { ...slot, appointments: [...filtered, updatedAppt] };
        }
        return { ...slot, appointments: filtered };
      })
    );
    setRescheduleAppt(null);
    showFlash("ok", "Agendamento remarcado. E-mail enviado ao cliente.");
  }

  function changeMonth(delta: number) {
    setCalMonth((m) => {
      const nm = m + delta;
      if (nm < 0) { setCalYear((y) => y - 1); return 11; }
      if (nm > 11) { setCalYear((y) => y + 1); return 0; }
      return nm;
    });
  }

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className={styles.wrap}>
      {flash ? (
        <p className={flash.tone === "ok" ? styles.flashOk : styles.flashError}>{flash.text}</p>
      ) : null}

      <div className={styles.calLayout}>
        {/* LEFT: Calendar */}
        <div className={styles.calPanel}>
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
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === today;
              const daySlots = slotsByDate[dateKey] || [];
              const hasAppt = daySlots.some((s) => (s.appointments || []).some((a) => a.status !== "canceled"));
              const hasSlot = daySlots.some((s) => !s.isBlocked && s.isAvailable);
              return (
                <button
                  key={dateKey}
                  type="button"
                  className={`${styles.dayCell} ${isSelected ? styles.dayCellSelected : isToday ? styles.dayCellToday : ""}`}
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <span>{day}</span>
                  {(hasAppt || hasSlot) ? (
                    <div className={styles.dots}>
                      {hasAppt && <span className={`${styles.dot} ${styles.dotAppt}`} />}
                      {hasSlot && <span className={`${styles.dot} ${styles.dotSlot}`} />}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span className={styles.legItem}><span className={`${styles.dot} ${styles.dotAppt}`} /> agendamento</span>
            <span className={styles.legItem}><span className={`${styles.dot} ${styles.dotSlot}`} /> horário livre</span>
          </div>
        </div>

        {/* RIGHT: Detail panel */}
        <div className={styles.detailPanel}>
          <div className={styles.dateHdr}>
            <div>
              <div className={styles.dateMetaLbl}>DATA SELECIONADA</div>
              <div className={styles.dateMetaVal}>{fmtDateLong(selectedDate)}</div>
            </div>
            <button type="button" className={styles.editBtn} onClick={openEditModal}>Editar horários</button>
          </div>

          {slotsForSelected.length > 0 ? (
            <div style={{ marginBottom: 22 }}>
              <span className={styles.secLbl}>HORÁRIOS DISPONÍVEIS</span>
              {slotsForSelected.some((s) => s.isAvailable && !s.isBlocked) ? (
                <div className={styles.slotChips}>
                  {slotsForSelected
                    .filter((s) => s.isAvailable && !s.isBlocked)
                    .map((s) => <span key={s.id} className={styles.chip}>{s.time}</span>)}
                </div>
              ) : (
                <div className={styles.noSlotsBox}>
                  <span className={styles.noSlotsTxt}>Dia desativado — nenhum horário disponível para clientes.</span>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.noSlotsBox}>
              <span className={styles.noSlotsTxt}>Nenhum horário cadastrado para este dia.</span>
              <button type="button" className={styles.addSlotsBtn} onClick={openEditModal}>+ Adicionar horários</button>
            </div>
          )}

          <div className={styles.apptsLbl}>
            AGENDAMENTOS{appointmentsForSelected.length > 0 ? ` (${appointmentsForSelected.length})` : ""}
          </div>

          {appointmentsForSelected.length === 0 ? (
            <p className={styles.noAppts}>Nenhum agendamento para este dia.</p>
          ) : (
            <div className={styles.apptList}>
              {appointmentsForSelected.map((appt) => {
                const isOpen = openApptIds.has(appt.id);
                const isConfirming = cancelConfirmId === appt.id;
                const isCancelling = cancellingId === appt.id;

                return (
                  <div key={appt.id} className={styles.apptRow}>
                    <button
                      type="button"
                      className={styles.apptHdr}
                      onClick={() =>
                        setOpenApptIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(appt.id)) next.delete(appt.id);
                          else next.add(appt.id);
                          return next;
                        })
                      }
                    >
                      <div className={styles.apptLeft}>
                        <span className={styles.apptTime}>{appt.time}</span>
                        <span className={styles.apptName}>{appt.userName || appt.userEmail || "Cliente"}</span>
                      </div>
                      <div className={styles.apptRight}>
                        <span className={styles.apptTypeTag}>{appt.serviceType}</span>
                        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>▾</span>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className={styles.apptDetails}>
                        <div className={styles.detailGrid}>
                          <div>
                            <span className={styles.dLbl}>Tipo de Atendimento</span>
                            <span className={styles.dVal}>{appt.serviceType || "-"}</span>
                          </div>
                          <div>
                            <span className={styles.dLbl}>Modalidade</span>
                            <span className={styles.dVal}>{appt.modality || "-"}</span>
                          </div>
                          <div>
                            <span className={styles.dLbl}>Email</span>
                            <span className={styles.dVal} style={{ fontSize: 12 }}>{appt.userEmail || "-"}</span>
                          </div>
                          {appt.notes ? (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <span className={styles.dLbl}>Observações</span>
                              <span className={styles.dVal}>{appt.notes}</span>
                            </div>
                          ) : null}
                          {appt.location ? (
                            <div>
                              <span className={styles.dLbl}>Local</span>
                              <span className={styles.dVal}>{appt.location}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.apptActions}>
                          {!isConfirming ? (
                            <>
                              <button
                                type="button"
                                className={styles.cancelApptBtn}
                                onClick={() => setCancelConfirmId(appt.id)}
                                disabled={isCancelling}
                              >
                                Cancelar agendamento
                              </button>
                              <button
                                type="button"
                                className={styles.rescheduleBtn}
                                onClick={() => setRescheduleAppt(appt)}
                                disabled={isCancelling}
                              >
                                Reagendar
                              </button>
                            </>
                          ) : (
                            <div className={styles.confirmBox}>
                              <span className={styles.confTxt}>
                                Tem certeza? O cliente será notificado por e-mail (via Resend).
                              </span>
                              <button
                                type="button"
                                className={styles.confYes}
                                onClick={() => handleCancelAppointment(appt.id)}
                                disabled={isCancelling}
                              >
                                {isCancelling ? "Cancelando..." : "Confirmar cancelamento"}
                              </button>
                              <button
                                type="button"
                                className={styles.confNo}
                                onClick={() => setCancelConfirmId(null)}
                                disabled={isCancelling}
                              >
                                Voltar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit Hours Modal */}
      {editModalOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={(e) => { if (e.target === e.currentTarget) setEditModalOpen(false); }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHdr}>
              <div>
                <div className={styles.modalMetaLbl}>EDITAR HORÁRIOS</div>
                <div className={styles.modalDateVal}>{fmtDateLong(selectedDate)}</div>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setEditModalOpen(false)}>✕</button>
            </div>

            <div className={styles.toggleRow}>
              <div>
                <div className={styles.toggleTitle}>Desativar dia inteiro</div>
                <div className={styles.toggleSub}>Bloqueia todos os horários deste dia para novos agendamentos</div>
              </div>
              <button
                type="button"
                className={styles.sw}
                style={{ background: dayDisabled ? "var(--studio-text)" : "var(--studio-border-strong)" }}
                onClick={() => {
                  setDayDisabled((v) => {
                    if (!v) setModalHours(new Set());
                    return !v;
                  });
                }}
              >
                <span
                  className={styles.swKnob}
                  style={{ transform: dayDisabled ? "translateX(20px)" : "translateX(2px)" }}
                />
              </button>
            </div>

            <div className={styles.hoursSection}>
              <div className={styles.hoursHdr}>
                <span className={styles.hoursLbl}>
                  HORÁRIOS DISPONÍVEIS
                  {!dayDisabled && modalHours.size > 0 ? ` — ${modalHours.size} selecionado${modalHours.size > 1 ? "s" : ""}` : ""}
                </span>
                <div className={styles.bulkActions}>
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={dayDisabled}
                    onClick={() => { if (!dayDisabled) setModalHours(new Set(ALL_HOURS)); }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={dayDisabled}
                    onClick={() => setModalHours(new Set())}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className={styles.hoursGrid}>
                {ALL_HOURS.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    disabled={dayDisabled}
                    className={`${styles.hrBtn} ${!dayDisabled && modalHours.has(hour) ? styles.hrBtnActive : ""}`}
                    onClick={() => {
                      if (dayDisabled) return;
                      setModalHours((prev) => {
                        const next = new Set(prev);
                        if (next.has(hour)) next.delete(hour);
                        else next.add(hour);
                        return next;
                      });
                    }}
                  >
                    {hour}
                  </button>
                ))}
              </div>

              {dayDisabled ? (
                <div className={styles.disabledNotice}>
                  Dia desativado — nenhum horário será exibido ao cliente.
                </div>
              ) : null}
            </div>

            <div className={styles.modalFtr}>
              {modalSaved ? <span className={styles.savedMsg}>✓ Horários salvos com sucesso</span> : null}
              <button type="button" className={styles.cancelModalBtn} onClick={() => setEditModalOpen(false)} disabled={savingModal}>
                Cancelar
              </button>
              <button type="button" className={styles.saveBtn} onClick={handleSaveHours} disabled={savingModal}>
                {savingModal ? "Salvando..." : "Salvar horários"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Reschedule Modal */}
      {rescheduleAppt ? (
        <RescheduleModal
          appointment={rescheduleAppt}
          csrfToken={csrfToken}
          onClose={() => setRescheduleAppt(null)}
          onSuccess={handleRescheduleSuccess}
        />
      ) : null}
    </div>
  );
}
