"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HttpError } from "@/lib/http";
import {
  studioAuthLogin,
  studioAuthMe,
  studioAuthMfaSetupInit,
  studioAuthMfaVerify,
  type StudioAuthMfaSetupInitResponse,
} from "@/services/admin";
import styles from "./StudioLoginFlow.module.css";

type StudioLoginFlowProps = {
  returnTo?: string;
};

type LoginStage = "login" | "mfa_setup" | "mfa_verify" | "mfa_recovery";
type StudioStatus = "checking" | "authenticated_admin" | "mfa_setup_required" | "mfa_required" | "not_authenticated";
type StudioLoginFailureReason =
  | "not_admin"
  | "mfa_required"
  | "invalid_credentials"
  | "session_expired"
  | "csrf_missing"
  | "unknown";

function normalizeReturnTo(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/studio";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/studio";
  return raw;
}

function readErrorCode(error: HttpError): string {
  const payload = error.payload;
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return String(error.message || "").trim();
}

function readErrorStage(error: HttpError): string {
  const payload = error.payload;
  if (payload && typeof payload === "object" && "stage" in payload) {
    const value = (payload as { stage?: unknown }).stage;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function resolveLoginFailure(error: unknown, fallback: string): { reason: StudioLoginFailureReason; message: string } {
  if (error instanceof HttpError) {
    const code = readErrorCode(error).toUpperCase();
    const stage = readErrorStage(error).toLowerCase();

    if (code === "FORBIDDEN" || code === "ADMIN_NOT_CONFIGURED") {
      return { reason: "not_admin", message: "Este usuário não possui permissão de admin no Studio." };
    }
    if (stage === "mfa_required" || code === "INVALID_MFA_CODE") {
      return { reason: "mfa_required", message: "Sua conta exige MFA. Complete a verificação para continuar." };
    }
    if (code === "INVALID_CREDENTIALS") {
      return { reason: "invalid_credentials", message: "Email ou senha inválidos." };
    }
    if (code === "ADMIN_SESSION_EXPIRED" || code === "ADMIN_UNAUTHORIZED") {
      return { reason: "session_expired", message: "Sessão expirada. Faça login novamente." };
    }
    if (code === "CSRF_INVALID") {
      return { reason: "csrf_missing", message: "Falha de segurança da sessão. Recarregue a página e tente novamente." };
    }

    if (error.status === 401) {
      return { reason: "invalid_credentials", message: "Email ou senha inválidos." };
    }
    if (error.status === 403) {
      return { reason: "not_admin", message: "Acesso negado para este usuário admin." };
    }
    return { reason: "unknown", message: error.message || fallback };
  }

  if (error instanceof Error) return { reason: "unknown", message: error.message || fallback };
  return { reason: "unknown", message: fallback };
}

function studioStatusLabel(status: StudioStatus): string {
  switch (status) {
    case "authenticated_admin":
      return "authenticated admin";
    case "mfa_setup_required":
      return "mfa_setup_required";
    case "mfa_required":
      return "mfa_required";
    case "not_authenticated":
      return "not authenticated";
    default:
      return "checking";
  }
}

export function StudioLoginFlow({ returnTo }: StudioLoginFlowProps) {
  const router = useRouter();
  const safeReturnTo = useMemo(() => normalizeReturnTo(returnTo), [returnTo]);

  const [stage, setStage] = useState<LoginStage>("login");
  const [studioStatus, setStudioStatus] = useState<StudioStatus>("checking");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [failureReason, setFailureReason] = useState<StudioLoginFailureReason | "">("");
  const [noticeMessage, setNoticeMessage] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [setupData, setSetupData] = useState<StudioAuthMfaSetupInitResponse | null>(null);
  const [setupToken, setSetupToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [verifyRecoveryCode, setVerifyRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const navigateToStudio = useCallback(() => {
    router.replace(safeReturnTo);
    router.refresh();
  }, [router, safeReturnTo]);

  async function openMfaSetup() {
    const data = await studioAuthMfaSetupInit();
    setSetupData(data);
    setSetupToken("");
    setStage("mfa_setup");
    setStudioStatus("mfa_setup_required");
    setNoticeMessage("Escaneie o QR no app autenticador e confirme o código de 6 dígitos.");
    setFailureReason("");
    setErrorMessage("");
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsBootstrapping(true);
      try {
        setStudioStatus("checking");
        const me = await studioAuthMe({ cache: "no-store" });
        if (cancelled) return;

        if (me.authenticated) {
          setStudioStatus("authenticated_admin");
          navigateToStudio();
          return;
        }

        if (me.stage === "mfa_setup_required") {
          await openMfaSetup();
          return;
        }

        if (me.stage === "mfa_required") {
          setStudioStatus("mfa_required");
          setStage("mfa_verify");
          setNoticeMessage("Digite o código MFA ou um código de recuperação.");
          setFailureReason("");
          setErrorMessage("");
          return;
        }

        setStudioStatus("not_authenticated");
        setStage("login");
        setNoticeMessage("");
      } catch (error) {
        if (cancelled) return;
        const resolved = resolveLoginFailure(error, "Não foi possível validar a sessão admin.");
        if (resolved.reason !== "session_expired") {
          setFailureReason(resolved.reason);
          setErrorMessage(resolved.message);
        } else {
          setFailureReason("");
          setErrorMessage("");
        }
        setStudioStatus("not_authenticated");
        setStage("login");
        setNoticeMessage("");
      } finally {
        if (cancelled) return;
        setIsBootstrapping(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [navigateToStudio]);

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage("");
    setFailureReason("");
    setNoticeMessage("");

    try {
      const response = await studioAuthLogin({
        email: email.trim(),
        password,
      });

      if (response.stage === "authenticated") {
        setStudioStatus("authenticated_admin");
        navigateToStudio();
        return;
      }

      if (response.stage === "mfa_setup_required") {
        await openMfaSetup();
        return;
      }

      if (response.stage === "mfa_required") {
        setStudioStatus("mfa_required");
        setStage("mfa_verify");
        setVerifyToken("");
        setVerifyRecoveryCode("");
        setNoticeMessage("Credenciais validadas. Informe o MFA para entrar.");
        return;
      }

      setFailureReason("unknown");
      setErrorMessage("Etapa de login inválida.");
    } catch (error) {
      const resolved = resolveLoginFailure(error, "Falha no login admin.");
      setFailureReason(resolved.reason);
      setErrorMessage(resolved.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetupVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const token = setupToken.replace(/\D/g, "").slice(0, 6);
    if (!token) {
      setErrorMessage("Digite o código de 6 dígitos para ativar MFA.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setFailureReason("");

    try {
      const response = await studioAuthMfaVerify({ token });
      const codes = Array.isArray(response.recoveryCodes) ? response.recoveryCodes : [];
      if (codes.length > 0) {
        setRecoveryCodes(codes);
        setStage("mfa_recovery");
        setNoticeMessage("MFA ativado. Guarde os códigos de recuperação.");
        return;
      }
      navigateToStudio();
    } catch (error) {
      const resolved = resolveLoginFailure(error, "Falha ao validar MFA.");
      setFailureReason(resolved.reason);
      setErrorMessage(resolved.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMfaVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const token = verifyToken.replace(/\D/g, "").slice(0, 6);
    const recoveryCode = verifyRecoveryCode.trim();
    if (!token && !recoveryCode) {
      setErrorMessage("Informe código MFA ou código de recuperação.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setFailureReason("");

    try {
      await studioAuthMfaVerify({ token, recoveryCode });
      navigateToStudio();
    } catch (error) {
      const resolved = resolveLoginFailure(error, "Falha ao validar MFA.");
      setFailureReason(resolved.reason);
      setErrorMessage(resolved.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return <p className={styles.loading}>Validando sessao admin...</p>;
  }

  return (
    <div className={styles.flow}>
      <div className={styles.statusBox}>
        <span className={styles.statusLabel}>Studio status:</span> {studioStatusLabel(studioStatus)}
      </div>

      {noticeMessage ? <p className={styles.notice}>{noticeMessage}</p> : null}
      {errorMessage ? (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      ) : null}
      {failureReason && failureReason !== "session_expired" ? (
        <p className={styles.reason}>Reason: {failureReason}</p>
      ) : null}

      {stage === "login" ? (
        <form className={styles.form} onSubmit={handleLoginSubmit}>
          <label className={styles.field}>
            <span>Email admin</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className={styles.field}>
            <span>Senha</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Continuar"}
          </button>
        </form>
      ) : null}

      {stage === "mfa_setup" ? (
        <div className={styles.setupBlock}>
          <div className={styles.setupGrid}>
            {setupData?.qrDataUrl ? (
              <Image
                src={setupData.qrDataUrl}
                alt="QR code MFA"
                width={180}
                height={180}
                className={styles.qr}
                unoptimized
              />
            ) : null}
            <div className={styles.manualSecret}>
              <p>Chave manual:</p>
              <code>{setupData?.secret || "-"}</code>
            </div>
          </div>

          <form className={styles.form} onSubmit={handleSetupVerifySubmit}>
            <label className={styles.field}>
              <span>Código MFA</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
                required
              />
            </label>
            <button type="submit" className={styles.submit} disabled={isSubmitting}>
              {isSubmitting ? "Validando..." : "Ativar e entrar"}
            </button>
          </form>
        </div>
      ) : null}

      {stage === "mfa_verify" ? (
        <form className={styles.form} onSubmit={handleMfaVerifySubmit}>
          <label className={styles.field}>
            <span>Código MFA (6 dígitos)</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={verifyToken}
              onChange={(event) => setVerifyToken(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Ou código de recuperação</span>
            <input
              type="text"
              autoComplete="one-time-code"
              value={verifyRecoveryCode}
              onChange={(event) => setVerifyRecoveryCode(event.target.value)}
            />
          </label>

          <button type="submit" className={styles.submit} disabled={isSubmitting}>
            {isSubmitting ? "Validando..." : "Entrar no Studio"}
          </button>
        </form>
      ) : null}

      {stage === "mfa_recovery" ? (
        <div className={styles.recoveryBlock}>
          <p>Guarde estes códigos em local seguro. Cada código funciona uma única vez.</p>
          <pre>{recoveryCodes.map((code, index) => `${index + 1}. ${code}`).join("\n")}</pre>
          <button type="button" className={styles.submit} onClick={navigateToStudio}>
            Continuar para Studio
          </button>
        </div>
      ) : null}

      <section className={styles.helpBox} aria-label="Need admin access">
        <h2>Need admin access?</h2>
        <p>Studio requires an AdminUser in the backend DB.</p>
        <p>Use the admin email provisioned in the DB allowlist.</p>
      </section>
    </div>
  );
}

