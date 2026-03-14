"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cancelAppointmentAdmin,
  createAppointmentSlotAdmin,
  deleteAppointmentSlotAdmin,
  updateAppointmentSlotAdmin,
  type AdminAppointmentBooking,
  type AdminAppointmentSlot,
} from "@/services/admin";
import { RescheduleModal } from "./RescheduleModal";
import styles from "./PrivateCareManager.module.css";

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
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

const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const ALL_HOURS = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22"];

function todayKey(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function currentHourInSaoPaulo(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value || "0";
  return Number(hour);
}

function slotDateKey(slot: AdminAppointmentSlot): string {
  if (!slot.startsAt) return "";
  const date = new Date(slot.startsAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(date);
}

function slotHour(slot: AdminAppointmentSlot): string {
  return String(slot.time || "").slice(0, 2);
}

function formatLongDate(isoDate: string): string {
  const [year = "", monthRaw = "", dayRaw = ""] = String(isoDate || "").split("-");
  const month = Math.max(0, Number(monthRaw) - 1);
  const day = Number(dayRaw);
  return `${day} de ${MONTHS_PT[month] || ""}, ${year}`;
}

function buildSlotIso(isoDate: string, hour: string, offsetHours = 0): string {
  const nextHour = String(Math.max(0, Math.min(23, Number(hour) + offsetHours))).padStart(2, "0");
  return new Date(`${isoDate}T${nextHour}:00:00-03:00`).toISOString();
}

type Props = {
  rows: AdminAppointmentSlot[];
  csrfToken: string;
};

export function PrivateCareManager({ rows, csrfToken }: Props) {
  const [items, setItems] = useState<AdminAppointmentSlot[]>(rows);
  const [flash, setFlash] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const today = todayKey();
  const currentHour = currentHourInSaoPaulo();
  const [calYear, setCalYear] = useState(() => Number(today.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(today.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState(today);

  const [hoursModalOpen, setHoursModalOpen] = useState(false);
  const [modalHours, setModalHours] = useState<Set<string>>(new Set());
  const [dayDisabled, setDayDisabled] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  const [openAppointmentIds, setOpenAppointmentIds] = useState<Set<string>>(new Set());
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rescheduleAppointment, setRescheduleAppointment] = useState<AdminAppointmentBooking | null>(null);

  useEffect(() => {
    setItems(rows);
  }, [rows]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, AdminAppointmentSlot[]>();
    for (const slot of items) {
      const key = slotDateKey(slot);
      if (!key) continue;
      const current = map.get(key) || [];
      current.push(slot);
      map.set(key, current);
    }
    return map;
  }, [items]);

  const slotsForSelected = useMemo(() => {
    return [...(slotsByDate.get(selectedDate) || [])].sort((left, right) =>
      String(left.startsAt || "").localeCompare(String(right.startsAt || ""))
    );
  }, [selectedDate, slotsByDate]);

  const availableSlotsForSelected = useMemo(() => {
    return slotsForSelected.filter((slot) => slot.isAvailable && !slot.isBlocked);
  }, [slotsForSelected]);

  const appointmentsForSelected = useMemo(() => {
    return slotsForSelected
      .flatMap((slot) => slot.appointments || [])
      .filter((appointment) => appointment.status !== "canceled")
      .sort((left, right) => String(left.startsAt || "").localeCompare(String(right.startsAt || "")));
  }, [slotsForSelected]);

  const selectedDayHasOnlyBlockedSlots = useMemo(() => {
    return slotsForSelected.length > 0 && slotsForSelected.every((slot) => slot.isBlocked || !slot.isAvailable);
  }, [slotsForSelected]);

  const selectedDateIsToday = selectedDate === today;

  const futureAvailableSlotsForSelected = useMemo(() => {
    if (!selectedDateIsToday) return availableSlotsForSelected;
    return availableSlotsForSelected.filter((slot) => Number(slotHour(slot)) > currentHour);
  }, [availableSlotsForSelected, currentHour, selectedDateIsToday]);

  const selectedDateHasOnlyPastSlots = useMemo(() => {
    return selectedDateIsToday && availableSlotsForSelected.length > 0 && futureAvailableSlotsForSelected.length === 0;
  }, [availableSlotsForSelected.length, futureAvailableSlotsForSelected.length, selectedDateIsToday]);

  function showFlash(tone: "ok" | "error", text: string) {
    setFlash({ tone, text });
    window.setTimeout(() => setFlash(null), 4000);
  }

  function replaceSlot(nextSlot: AdminAppointmentSlot) {
    setItems((current) => {
      const exists = current.some((slot) => slot.id === nextSlot.id);
      if (!exists) return [...current, nextSlot];
      return current.map((slot) => (slot.id === nextSlot.id ? nextSlot : slot));
    });
  }

  function removeSlot(slotId: string) {
    setItems((current) => current.filter((slot) => slot.id !== slotId));
  }

  function changeMonth(delta: number) {
    setCalMonth((currentMonth) => {
      const nextMonth = currentMonth + delta;
      if (nextMonth < 0) {
        setCalYear((currentYear) => currentYear - 1);
        return 11;
      }
      if (nextMonth > 11) {
        setCalYear((currentYear) => currentYear + 1);
        return 0;
      }
      return nextMonth;
    });
  }

  function openHoursManager() {
    setModalHours(new Set(availableSlotsForSelected.map(slotHour)));
    setDayDisabled(selectedDayHasOnlyBlockedSlots);
    setHoursSaved(false);
    setHoursModalOpen(true);
  }

  async function handleSaveHours() {
    if (savingHours) return;

    setSavingHours(true);
    let hasError = false;

    try {
      const mutations: Promise<void>[] = [];

      for (const hour of ALL_HOURS) {
        if (selectedDateIsToday && Number(hour) <= currentHour) continue;
        const existingSlot = slotsForSelected.find((slot) => slotHour(slot) === hour) || null;
        const shouldBeAvailable = !dayDisabled && modalHours.has(hour);

        if (dayDisabled) {
          if (!existingSlot) continue;
          if (existingSlot.isBlocked && !existingSlot.isAvailable) continue;
          mutations.push(
            updateAppointmentSlotAdmin(existingSlot.id, { isAvailable: false, isBlocked: true }, csrfToken)
              .then((response) => replaceSlot(response.slot))
              .catch(() => {
                hasError = true;
              })
          );
          continue;
        }

        if (shouldBeAvailable) {
          if (!existingSlot) {
            mutations.push(
              createAppointmentSlotAdmin(
                {
                  startsAt: buildSlotIso(selectedDate, hour),
                  endsAt: buildSlotIso(selectedDate, hour, 1),
                  label: "Atendimento privado",
                  isAvailable: true,
                  isBlocked: false,
                  capacity: 1,
                },
                csrfToken
              )
                .then((response) => replaceSlot(response.slot))
                .catch(() => {
                  hasError = true;
                })
            );
            continue;
          }

          if (!existingSlot.isAvailable || existingSlot.isBlocked) {
            mutations.push(
              updateAppointmentSlotAdmin(existingSlot.id, { isAvailable: true, isBlocked: false }, csrfToken)
                .then((response) => replaceSlot(response.slot))
                .catch(() => {
                  hasError = true;
                })
            );
          }
          continue;
        }

        if (!existingSlot) continue;

        if (existingSlot.bookedCount === 0) {
          mutations.push(
            deleteAppointmentSlotAdmin(existingSlot.id, csrfToken)
              .then(() => removeSlot(existingSlot.id))
              .catch(() => {
                hasError = true;
              })
          );
          continue;
        }

        mutations.push(
          updateAppointmentSlotAdmin(existingSlot.id, { isAvailable: false, isBlocked: false }, csrfToken)
            .then((response) => replaceSlot(response.slot))
            .catch(() => {
              hasError = true;
            })
        );
      }

      await Promise.all(mutations);

      if (hasError) {
        showFlash("error", "Alguns horários não puderam ser atualizados.");
        return;
      }

      setHoursSaved(true);
      showFlash("ok", "Horários atualizados.");
      window.setTimeout(() => {
        setHoursModalOpen(false);
        setHoursSaved(false);
      }, 900);
    } finally {
      setSavingHours(false);
    }
  }

  async function handleCancelAppointment(appointmentId: string) {
    setCancellingId(appointmentId);
    try {
      await cancelAppointmentAdmin(appointmentId, csrfToken);
      setItems((current) =>
        current.map((slot) => {
          const nextAppointments = slot.appointments.map((appointment) =>
            appointment.id === appointmentId ? { ...appointment, status: "canceled" as const } : appointment
          );
          const nextBookedCount = nextAppointments.filter((appointment) => appointment.status !== "canceled").length;
          return {
            ...slot,
            appointments: nextAppointments,
            bookedCount: nextBookedCount,
            remainingCount: Math.max(0, slot.capacity - nextBookedCount),
          };
        })
      );
      setCancelConfirmId(null);
      showFlash("ok", "Agendamento cancelado. O cliente foi notificado.");
    } catch {
      showFlash("error", "Falha ao cancelar agendamento.");
    } finally {
      setCancellingId(null);
    }
  }

  function handleRescheduleSuccess(updatedAppointment: AdminAppointmentBooking) {
    setItems((current) =>
      current.map((slot) => {
        const baseAppointments = slot.appointments.filter((appointment) => appointment.id !== updatedAppointment.id);
        const nextAppointments =
          slot.id === updatedAppointment.slotId ? [...baseAppointments, updatedAppointment] : baseAppointments;
        const nextBookedCount = nextAppointments.filter((appointment) => appointment.status !== "canceled").length;

        return {
          ...slot,
          appointments: nextAppointments,
          bookedCount: nextBookedCount,
          remainingCount: Math.max(0, slot.capacity - nextBookedCount),
        };
      })
    );

    setRescheduleAppointment(null);
    showFlash("ok", "Agendamento remarcado. O cliente foi notificado.");
  }

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  return (
    <div className={styles.wrap}>
      {flash ? <p className={flash.tone === "ok" ? styles.flashOk : styles.flashError}>{flash.text}</p> : null}

      <div className={styles.calLayout}>
        <section className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
            <div className={styles.monthNav}>
              <button type="button" className={styles.navBtn} onClick={() => changeMonth(-1)} aria-label="Mês anterior">
                {"‹"}
              </button>
              <span className={styles.monthLabel}>
                {MONTHS_PT[calMonth]} {calYear}
              </span>
              <button type="button" className={styles.navBtn} onClick={() => changeMonth(1)} aria-label="Próximo mês">
                {"›"}
              </button>
            </div>

            <div className={styles.selectedMeta}>
              <span className={styles.sectionLabel}>Data selecionada</span>
              <strong className={styles.selectedDateValue}>{formatLongDate(selectedDate)}</strong>
            </div>
          </div>

          <div className={styles.dayLabels}>
            {DAY_LABELS.map((label) => (
              <span key={label} className={styles.dayLabel}>
                {label}
              </span>
            ))}
          </div>

          <div className={styles.calGrid}>
            {Array.from({ length: firstDay }, (_, index) => (
              <div key={`empty-${index}`} className={styles.daySpacer} />
            ))}

            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySlots = slotsByDate.get(dateKey) || [];
              const hasAppointments = daySlots.some((slot) =>
                slot.appointments.some((appointment) => appointment.status !== "canceled")
              );
              const hasFreeSlots = daySlots.some((slot) => slot.isAvailable && !slot.isBlocked);
              const isSelected = dateKey === selectedDate;
              const isToday = dateKey === today;
              const isPast = dateKey < today;

              return (
                <button
                  key={dateKey}
                  type="button"
                  className={`${styles.dayCell} ${isSelected ? styles.dayCellSelected : ""} ${
                    !isSelected && isPast ? styles.dayCellPast : ""
                  } ${
                    !isSelected && isToday ? styles.dayCellToday : ""
                  }`}
                  onClick={() => setSelectedDate(dateKey)}
                >
                  <span className={styles.dayNumber}>{day}</span>
                  <span className={styles.dayIndicators} aria-hidden="true">
                    {hasAppointments ? <span className={`${styles.dot} ${styles.dotAppointment}`} /> : null}
                    {hasFreeSlots ? <span className={`${styles.dot} ${styles.dotFree}`} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={`${styles.dot} ${styles.dotAppointment}`} />
              Com agendamento
            </span>
            <span className={styles.legendItem}>
              <span className={`${styles.dot} ${styles.dotFree}`} />
              Horário livre
            </span>
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>Disponibilidade do dia</span>
              <h3 className={styles.sectionTitle}>{formatLongDate(selectedDate)}</h3>
            </div>
            <button type="button" className={styles.manageBtn} onClick={openHoursManager}>
              Gerenciar horários
            </button>
          </div>

          <div className={styles.slotSummary}>
            {availableSlotsForSelected.length > 0 ? (
              <div className={styles.slotChips}>
                {availableSlotsForSelected.map((slot) => (
                  <span key={slot.id} className={styles.chip}>
                    {slot.time}
                  </span>
                ))}
              </div>
            ) : (
              <div className={styles.emptyMessage}>
                Nenhum horário disponível para clientes nesta data.
              </div>
            )}
            {selectedDateHasOnlyPastSlots ? (
              <p className={styles.helperWarning}>
                Esses horários já passaram em São Paulo e não aparecem mais para o cliente na conta.
              </p>
            ) : null}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionLabel}>Agendamentos</span>
              <h3 className={styles.sectionTitle}>
                {appointmentsForSelected.length > 0
                  ? `${appointmentsForSelected.length} agendamento${appointmentsForSelected.length > 1 ? "s" : ""}`
                  : "Nenhum agendamento"}
              </h3>
            </div>
          </div>

          {appointmentsForSelected.length === 0 ? (
            <p className={styles.noAppointments}>Nenhum agendamento para este dia.</p>
          ) : (
            <div className={styles.appointmentList}>
              {appointmentsForSelected.map((appointment) => {
                const isOpen = openAppointmentIds.has(appointment.id);
                const isConfirming = cancelConfirmId === appointment.id;
                const isCancelling = cancellingId === appointment.id;

                return (
                  <article key={appointment.id} className={styles.appointmentCard}>
                    <button
                      type="button"
                      className={styles.appointmentHeader}
                      onClick={() =>
                        setOpenAppointmentIds((current) => {
                          const next = new Set(current);
                          if (next.has(appointment.id)) next.delete(appointment.id);
                          else next.add(appointment.id);
                          return next;
                        })
                      }
                    >
                      <div className={styles.appointmentHeaderMain}>
                        <span className={styles.appointmentTime}>{appointment.time}</span>
                        <span className={styles.appointmentName}>
                          {appointment.userName || appointment.userEmail || "Cliente"}
                        </span>
                      </div>

                      <div className={styles.appointmentHeaderMeta}>
                        <span className={styles.appointmentTag}>{appointment.serviceType || "Atendimento privado"}</span>
                        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>▾</span>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className={styles.appointmentDetails}>
                        <div className={styles.detailGrid}>
                          <div>
                            <span className={styles.detailLabel}>Tipo de atendimento</span>
                            <span className={styles.detailValue}>{appointment.serviceType || "-"}</span>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>Modalidade</span>
                            <span className={styles.detailValue}>{appointment.modality || "-"}</span>
                          </div>
                          <div>
                            <span className={styles.detailLabel}>Email</span>
                            <span className={styles.detailValue}>{appointment.userEmail || "-"}</span>
                          </div>
                          {appointment.location ? (
                            <div>
                              <span className={styles.detailLabel}>Local</span>
                              <span className={styles.detailValue}>{appointment.location}</span>
                            </div>
                          ) : null}
                          {appointment.notes ? (
                            <div className={styles.detailBlock}>
                              <span className={styles.detailLabel}>Observações</span>
                              <span className={styles.detailValue}>{appointment.notes}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className={styles.appointmentActions}>
                          {!isConfirming ? (
                            <>
                              <button
                                type="button"
                                className={styles.cancelButton}
                                onClick={() => setCancelConfirmId(appointment.id)}
                                disabled={isCancelling}
                              >
                                Cancelar agendamento
                              </button>
                              <button
                                type="button"
                                className={styles.rescheduleButton}
                                onClick={() => setRescheduleAppointment(appointment)}
                                disabled={isCancelling}
                              >
                                Reagendar
                              </button>
                            </>
                          ) : (
                            <div className={styles.confirmBox}>
                              <span className={styles.confirmText}>
                                Confirmar cancelamento? O cliente será notificado por e-mail.
                              </span>
                              <button
                                type="button"
                                className={styles.confirmYes}
                                onClick={() => handleCancelAppointment(appointment.id)}
                                disabled={isCancelling}
                              >
                                {isCancelling ? "Cancelando..." : "Confirmar"}
                              </button>
                              <button
                                type="button"
                                className={styles.confirmNo}
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
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {hoursModalOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={(event) => {
            if (event.target === event.currentTarget) setHoursModalOpen(false);
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.sectionLabel}>Gerenciar horários</span>
                <h3 className={styles.modalTitle}>{formatLongDate(selectedDate)}</h3>
              </div>
              <button type="button" className={styles.closeButton} onClick={() => setHoursModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className={styles.toggleRow}>
              <div>
                <strong className={styles.toggleTitle}>Desativar dia inteiro</strong>
                <p className={styles.toggleSubtitle}>
                  Bloqueia todos os horários desta data para novos agendamentos.
                </p>
              </div>

              <button
                type="button"
                className={`${styles.switch} ${dayDisabled ? styles.switchActive : ""}`}
                onClick={() => {
                  setDayDisabled((current) => {
                    if (!current) setModalHours(new Set());
                    return !current;
                  });
                }}
              >
                <span className={styles.switchKnob} />
              </button>
            </div>

            <div className={styles.hoursSection}>
              <div className={styles.hoursHeader}>
                <span className={styles.sectionLabel}>
                  Horários disponíveis
                  {!dayDisabled && modalHours.size > 0
                    ? ` · ${modalHours.size} selecionado${modalHours.size > 1 ? "s" : ""}`
                    : ""}
                </span>

                <div className={styles.bulkActions}>
                  <button
                    type="button"
                    className={styles.bulkButton}
                    disabled={dayDisabled}
                    onClick={() => setModalHours(new Set(ALL_HOURS))}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    className={styles.bulkButton}
                    disabled={dayDisabled}
                    onClick={() => setModalHours(new Set())}
                  >
                    Limpar
                  </button>
                </div>
              </div>

              <div className={styles.hoursGrid}>
                {ALL_HOURS.map((hour) => {
                  const isPastHour = selectedDateIsToday && Number(hour) <= currentHour;
                  return (
                  <button
                    key={hour}
                    type="button"
                    className={`${styles.hourButton} ${!dayDisabled && modalHours.has(hour) ? styles.hourButtonActive : ""} ${
                      isPastHour ? styles.hourButtonPast : ""
                    }`}
                    disabled={dayDisabled || isPastHour}
                    onClick={() =>
                      setModalHours((current) => {
                        const next = new Set(current);
                        if (next.has(hour)) next.delete(hour);
                        else next.add(hour);
                        return next;
                      })
                    }
                  >
                    {hour}:00
                  </button>
                  );
                })}
              </div>

              {dayDisabled ? (
                <p className={styles.disabledNotice}>Este dia ficará oculto para o cliente até ser reativado.</p>
              ) : null}
              {selectedDateIsToday ? (
                <p className={styles.disabledNotice}>
                  Horários que já passaram hoje em São Paulo ficam bloqueados aqui e não aparecem mais na conta do cliente.
                </p>
              ) : null}
            </div>

            <div className={styles.modalFooter}>
              {hoursSaved ? <span className={styles.savedMessage}>Horários salvos com sucesso.</span> : <span />}
              <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.modalSecondaryButton}
                  onClick={() => setHoursModalOpen(false)}
                  disabled={savingHours}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className={styles.modalPrimaryButton}
                  onClick={handleSaveHours}
                  disabled={savingHours}
                >
                  {savingHours ? "Salvando..." : "Salvar horários"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {rescheduleAppointment ? (
        <RescheduleModal
          appointment={rescheduleAppointment}
          csrfToken={csrfToken}
          onClose={() => setRescheduleAppointment(null)}
          onSuccess={handleRescheduleSuccess}
        />
      ) : null}
    </div>
  );
}
