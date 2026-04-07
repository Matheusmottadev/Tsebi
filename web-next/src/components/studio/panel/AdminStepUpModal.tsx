"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AdminStepUpModal.module.css";

type StepUpType = "password" | "mfa";

type StepUpEventDetail = {
  stepUpType: StepUpType;
  actionLabel?: string;
  errorMessage?: string;
  resolve: (value: string | null) => void;
};

const EVENT_NAME = "tsebi-admin-step-up";

function buildTitle(stepUpType: StepUpType): string {
  return stepUpType === "mfa" ? "Confirmar com MFA" : "Confirmar com senha";
}

function buildDescription(stepUpType: StepUpType, actionLabel: string): string {
  if (stepUpType === "mfa") {
    return `${actionLabel || "Esta ação"} precisa do código do autenticador para continuar.`;
  }
  return `${actionLabel || "Esta ação"} precisa da sua senha de login para continuar.`;
}

export function AdminStepUpModal() {
  const [detail, setDetail] = useState<StepUpEventDetail | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const onStepUpRequest = (event: Event) => {
      const customEvent = event as CustomEvent<StepUpEventDetail>;
      const nextDetail = customEvent.detail;
      if (!nextDetail?.resolve) return;
      setValue("");
      setDetail(nextDetail);
    };

    window.addEventListener(EVENT_NAME, onStepUpRequest as EventListener);
    return () => window.removeEventListener(EVENT_NAME, onStepUpRequest as EventListener);
  }, []);

  useEffect(() => {
    if (!detail) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        detail.resolve(null);
        setDetail(null);
        setValue("");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detail]);

  const inputLabel = useMemo(() => {
    if (!detail) return "";
    return detail.stepUpType === "mfa" ? "Código do autenticador" : "Senha de login";
  }, [detail]);

  if (!detail) return null;

  const isMfa = detail.stepUpType === "mfa";
  const title = buildTitle(detail.stepUpType);
  const description = buildDescription(detail.stepUpType, String(detail.actionLabel || "").trim());

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        className={styles.backdrop}
        onClick={() => {
          detail.resolve(null);
          setDetail(null);
          setValue("");
        }}
        aria-label="Fechar"
      />

      <div className={styles.modal}>
        <div className={styles.eyebrow}>Segurança</div>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.description}>{description}</p>

        {detail.errorMessage ? <div className={styles.error}>{detail.errorMessage}</div> : null}

        <label className={styles.field}>
          <span className={styles.label}>{inputLabel}</span>
          <input
            autoFocus
            className={styles.input}
            type={isMfa ? "text" : "password"}
            inputMode={isMfa ? "numeric" : "text"}
            placeholder={isMfa ? "000000" : "Digite sua senha"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && String(value || "").trim()) {
                detail.resolve(value);
                setDetail(null);
                setValue("");
              }
            }}
          />
        </label>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => {
              detail.resolve(null);
              setDetail(null);
              setValue("");
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!String(value || "").trim()}
            onClick={() => {
              detail.resolve(value);
              setDetail(null);
              setValue("");
            }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
