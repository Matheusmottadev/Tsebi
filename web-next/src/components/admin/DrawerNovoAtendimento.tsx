"use client";

import { useEffect, useMemo, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  createAppointmentSlotAdmin,
  updateAppointmentSlotAdmin,
  type AdminAppointmentSlot,
} from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerNovoAtendimentoProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
  slot?: AdminAppointmentSlot | null;
};

type FormState = {
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

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const localValue = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localValue.toISOString().slice(0, 16);
}

function toIsoValue(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function createInitialState(slot?: AdminAppointmentSlot | null): FormState {
  return {
    startsAt: toDateTimeLocalValue(slot?.startsAt),
    endsAt: toDateTimeLocalValue(slot?.endsAt),
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

export function DrawerNovoAtendimento({
  isOpen,
  onClose,
  onSaved,
  slot = null,
}: DrawerNovoAtendimentoProps) {
  const [formState, setFormState] = useState<FormState>(() => createInitialState(slot));
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setFormState(createInitialState(slot));
    setSubmitting(false);
    setErrorMessage("");
  }, [isOpen, slot]);

  const isEditing = Boolean(slot?.id);
  const disableSave = useMemo(
    () => !formState.startsAt || !formState.endsAt || !formState.label.trim(),
    [formState.endsAt, formState.label, formState.startsAt]
  );

  async function handleSave() {
    if (disableSave || submitting) return;

    setSubmitting(true);
    setErrorMessage("");
    try {
      const payload = {
        startsAt: toIsoValue(formState.startsAt),
        endsAt: toIsoValue(formState.endsAt),
        label: formState.label.trim(),
        modality: formState.modality.trim(),
        location: formState.location.trim(),
        adminNote: formState.adminNote.trim(),
        capacity: Math.max(1, Number(formState.capacity || 1) || 1),
        isAvailable: formState.isAvailable,
        isBlocked: formState.isBlocked,
      };

      if (isEditing && slot?.id) {
        await updateAppointmentSlotAdmin(slot.id, payload);
      } else {
        await createAppointmentSlotAdmin(payload);
      }

      onSaved?.();
      onClose();
    } catch (error) {
      setErrorMessage(pickErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      onSave={handleSave}
      title={isEditing ? "Editar Horário" : "Novo Horário"}
      subtitle="Crie um slot individual com data, faixa de horário e detalhes do atendimento."
      saveLabel={submitting ? "Salvando..." : isEditing ? "Salvar" : "Criar horario"}
      disableSave={disableSave || submitting}
      stickyFooter
    >
      <div className={form.stack}>
        <div className={form.row2}>
          <div className={form.field}>
            <label htmlFor="appointment-starts-at">Inicio</label>
            <input
              id="appointment-starts-at"
              type="datetime-local"
              value={formState.startsAt}
              onChange={(event) => setFormState((current) => ({ ...current, startsAt: event.target.value }))}
            />
          </div>
          <div className={form.field}>
            <label htmlFor="appointment-ends-at">Fim</label>
            <input
              id="appointment-ends-at"
              type="datetime-local"
              value={formState.endsAt}
              onChange={(event) => setFormState((current) => ({ ...current, endsAt: event.target.value }))}
            />
          </div>
        </div>

        <div className={form.field}>
          <label htmlFor="appointment-title">Titulo</label>
          <input
            id="appointment-title"
            type="text"
            value={formState.label}
            onChange={(event) => setFormState((current) => ({ ...current, label: event.target.value }))}
            placeholder="Ex.: Consultoria privada"
          />
        </div>

        <div className={form.row2}>
          <div className={form.field}>
            <label htmlFor="appointment-modality">Modalidade</label>
            <input
              id="appointment-modality"
              type="text"
              value={formState.modality}
              onChange={(event) => setFormState((current) => ({ ...current, modality: event.target.value }))}
              placeholder="WhatsApp / Ligacao"
            />
          </div>
          <div className={form.field}>
            <label htmlFor="appointment-location">Local</label>
            <input
              id="appointment-location"
              type="text"
              value={formState.location}
              onChange={(event) => setFormState((current) => ({ ...current, location: event.target.value }))}
              placeholder="Numero ou link de contato"
            />
          </div>
        </div>

        <div className={form.field}>
          <label htmlFor="appointment-capacity">Capacidade</label>
          <input
            id="appointment-capacity"
            type="number"
            min={1}
            max={20}
            value={formState.capacity}
            onChange={(event) => setFormState((current) => ({ ...current, capacity: event.target.value }))}
          />
        </div>

        <div className={form.checks}>
          <label className={form.check}>
            <input
              type="checkbox"
              checked={formState.isAvailable}
              onChange={(event) => setFormState((current) => ({ ...current, isAvailable: event.target.checked }))}
            />
            <span>Disponivel</span>
          </label>
          <label className={form.check}>
            <input
              type="checkbox"
              checked={formState.isBlocked}
              onChange={(event) => setFormState((current) => ({ ...current, isBlocked: event.target.checked }))}
            />
            <span>Bloqueado</span>
          </label>
        </div>

        <div className={form.field}>
          <label htmlFor="appointment-admin-note">Observacao interna</label>
          <textarea
            id="appointment-admin-note"
            rows={4}
            value={formState.adminNote}
            onChange={(event) => setFormState((current) => ({ ...current, adminNote: event.target.value }))}
            placeholder="Observacoes do admin sobre este horario."
          />
        </div>

        {errorMessage ? <p className={form.error}>{errorMessage}</p> : null}
      </div>
    </Drawer>
  );
}
