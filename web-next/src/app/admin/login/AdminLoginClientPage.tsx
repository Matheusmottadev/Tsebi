"use client";

import Image from "next/image";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HttpError } from "@/lib/http";
import {
  studioAuthLogin,
  studioAuthMe,
  studioAuthMfaSetupInit,
  studioAuthMfaVerify,
  type StudioAuthMfaSetupInitResponse,
} from "@/services/admin";
import styles from "./admin-login.module.css";

type FieldErrors = {
  email?: string;
  password?: string;
  token?: string;
  recoveryCode?: string;
};

type LoginStage = "login" | "mfa_setup" | "mfa_verify" | "mfa_recovery";

function sanitizeReturnTo(value: string | null): string {
  const raw = String(value || "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  return raw || "/admin";
}

function readHttpErrorCode(error: HttpError): string {
  const payload = error.payload;
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error?: unknown }).error || "").trim().toUpperCase();
  }
  return "";
}

function readHttpErrorStage(error: HttpError): string {
  const payload = error.payload;
  if (payload && typeof payload === "object" && "stage" in payload) {
    return String((payload as { stage?: unknown }).stage || "").trim().toLowerCase();
  }
  return "";
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    const code = readHttpErrorCode(error);
    if (code === "INVALID_CREDENTIALS") return "Email ou senha inválidos.";
    if (code === "INVALID_MFA_CODE") return "Código MFA inválido.";
    if (code === "INVALID_RECOVERY_CODE") return "Código de recuperação inválido.";
    if (code === "FORBIDDEN" || code === "ADMIN_NOT_CONFIGURED") return "Sem permissão admin para este usuário.";
    if (code === "CSRF_INVALID") return "Falha de segurança. Recarregue a página.";
    if (error.status === 401) return "Sessão inválida. Faça login novamente.";
    if (error.status === 403) return "Acesso negado.";
    return error.message || "Falha ao autenticar.";
  }
  if (error instanceof Error) return error.message || "Falha ao autenticar.";
  return "Falha ao autenticar.";
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = useState("/admin");

  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const tokenRef = useRef<HTMLInputElement | null>(null);
  const recoveryCodeRef = useRef<HTMLInputElement | null>(null);

  const [stage, setStage] = useState<LoginStage>("login");
  const [setupData, setSetupData] = useState<StudioAuthMfaSetupInitResponse | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setReturnTo(sanitizeReturnTo(params.get("returnTo")));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const me = await studioAuthMe({ cache: "no-store" });
        if (cancelled) return;

        if (me.authenticated) {
          router.replace(returnTo);
          router.refresh();
          return;
        }

        if (me.stage === "mfa_required") {
          setStage("mfa_verify");
          setMessage("Informe o código MFA ou o código de recuperação.");
        }

        if (me.stage === "mfa_setup_required") {
          const data = await studioAuthMfaSetupInit();
          if (cancelled) return;
          setSetupData(data);
          setStage("mfa_setup");
          setMessage("Escaneie o QR no autenticador e valide o código.");
        }
      } catch {
        // mantém na tela de login
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, returnTo]);

  async function handleLoginClick() {
    if (isLoading) return;

    const nextErrors: FieldErrors = {};
    if (!email.includes("@")) nextErrors.email = "E-mail inválido.";
    if (password.trim().length < 4) nextErrors.password = "Senha incorreta.";

    setErrors(nextErrors);
    setMessage("");

    if (nextErrors.email) {
      emailRef.current?.focus();
      return;
    }

    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    setIsLoading(true);
    try {
      const response = await studioAuthLogin({ email: email.trim(), password });

      if (response.stage === "authenticated") {
        router.replace(returnTo);
        router.refresh();
        return;
      }

      if (response.stage === "mfa_required") {
        setStage("mfa_verify");
        setMessage("Credenciais validadas. Falta confirmar o MFA.");
        return;
      }

      if (response.stage === "mfa_setup_required") {
        const data = await studioAuthMfaSetupInit();
        setSetupData(data);
        setStage("mfa_setup");
        setMessage("Ative o MFA para concluir o primeiro acesso.");
        return;
      }
    } catch (error) {
      const fallbackMessage = resolveErrorMessage(error);
      if (error instanceof HttpError) {
        const apiStage = readHttpErrorStage(error);
        if (apiStage === "mfa_required") {
          setStage("mfa_verify");
          setMessage("Informe o código MFA para continuar.");
          setErrors({});
          return;
        }
      }
      setErrors({ password: fallbackMessage });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMfaSubmit() {
    if (isLoading) return;

    const cleanedToken = token.replace(/\D/g, "").slice(0, 6);
    const cleanedRecovery = recoveryCode.trim();
    const nextErrors: FieldErrors = {};

    if (!cleanedToken && !cleanedRecovery) {
      nextErrors.token = "Informe código MFA ou recuperação.";
    }

    setErrors(nextErrors);
    if (nextErrors.token) {
      tokenRef.current?.focus();
      return;
    }

    setIsLoading(true);
    setMessage("");
    try {
      const response = await studioAuthMfaVerify({ token: cleanedToken, recoveryCode: cleanedRecovery });
      const codes = Array.isArray(response.recoveryCodes) ? response.recoveryCodes : [];
      if (codes.length > 0) {
        setRecoveryCodes(codes);
        setStage("mfa_recovery");
        setMessage("Guarde os códigos de recuperação antes de continuar.");
        return;
      }

      router.replace(returnTo);
      router.refresh();
    } catch (error) {
      const fallbackMessage = resolveErrorMessage(error);
      setErrors({ token: fallbackMessage, recoveryCode: fallbackMessage });
      if (!cleanedToken && cleanedRecovery) {
        recoveryCodeRef.current?.focus();
      } else {
        tokenRef.current?.focus();
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className={`admin-login-root ${styles.root}`}>
      <section className={`admin-login-left ${styles.leftPanel}`}>
        <header className={styles.brandBlock}>
          <h1>TSEBI</h1>
          <p>Painel Administrativo</p>
        </header>

        <div className={styles.quoteWrap}>
          <h2>
            Forma,
            <br />
            <em>princípio</em>
            <br />
            e excelência.
          </h2>
          <span>Gestão com o mesmo padrão da marca</span>
        </div>

        <footer className={styles.leftFooter}>© 2025 Tsebi Brasil - Acesso restrito</footer>
      </section>

      <section className={`admin-login-right ${styles.rightPanel}`}>
        <div className={styles.loginBox}>
          <h3>Bem-vindo de volta.</h3>
          <p className={styles.subtitle}>Insira suas credenciais para continuar</p>

          {message ? <p className={styles.statusText}>{message}</p> : null}

          <div className={styles.fields}>
            {stage === "login" ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="admin-email">E-MAIL</label>
                  <input
                    ref={emailRef}
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
                    placeholder="seuemail@tsebi.com"
                    autoComplete="email"
                  />
                  {errors.email ? <small className={styles.error}>{errors.email}</small> : null}
                </div>

                <div className={styles.field}>
                  <div className={styles.passwordTopRow}>
                    <label htmlFor="admin-password">SENHA</label>
                    <button type="button" className={styles.forgotBtn}>
                      Esqueci a senha
                    </button>
                  </div>
                  <input
                    ref={passwordRef}
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={`${styles.input} ${errors.password ? styles.inputError : ""}`}
                    placeholder="********"
                    autoComplete="current-password"
                  />
                  {errors.password ? <small className={styles.error}>{errors.password}</small> : null}
                </div>

                <button type="button" className={styles.submitBtn} onClick={handleLoginClick} disabled={isLoading}>
                  {isLoading ? "Verificando..." : "Entrar"}
                </button>
              </>
            ) : null}

            {stage === "mfa_setup" ? (
              <>
                {setupData?.qrDataUrl ? (
                  <div className={styles.qrBox}>
                    <Image src={setupData.qrDataUrl} alt="QR code MFA" width={160} height={160} className={styles.qrImage} unoptimized />
                    <small className={styles.setupSecret}>Chave manual: {setupData.secret}</small>
                  </div>
                ) : null}

                <div className={styles.field}>
                  <label htmlFor="admin-mfa-setup">CÓDIGO MFA</label>
                  <input
                    ref={tokenRef}
                    id="admin-mfa-setup"
                    type="text"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    className={`${styles.input} ${errors.token ? styles.inputError : ""}`}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                  {errors.token ? <small className={styles.error}>{errors.token}</small> : null}
                </div>

                <button type="button" className={styles.submitBtn} onClick={handleMfaSubmit} disabled={isLoading}>
                  {isLoading ? "Validando..." : "Ativar e entrar"}
                </button>
              </>
            ) : null}

            {stage === "mfa_verify" ? (
              <>
                <div className={styles.field}>
                  <label htmlFor="admin-mfa-token">CÓDIGO MFA</label>
                  <input
                    ref={tokenRef}
                    id="admin-mfa-token"
                    type="text"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    className={`${styles.input} ${errors.token ? styles.inputError : ""}`}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="admin-mfa-recovery">OU CÓDIGO DE RECUPERAÇÃO</label>
                  <input
                    ref={recoveryCodeRef}
                    id="admin-mfa-recovery"
                    type="text"
                    value={recoveryCode}
                    onChange={(event) => setRecoveryCode(event.target.value)}
                    className={`${styles.input} ${errors.recoveryCode ? styles.inputError : ""}`}
                    placeholder="XXXX-XXXX"
                    autoComplete="one-time-code"
                  />
                  {errors.token || errors.recoveryCode ? (
                    <small className={styles.error}>{errors.token || errors.recoveryCode}</small>
                  ) : null}
                </div>

                <button type="button" className={styles.submitBtn} onClick={handleMfaSubmit} disabled={isLoading}>
                  {isLoading ? "Validando..." : "Entrar"}
                </button>
              </>
            ) : null}

            {stage === "mfa_recovery" ? (
              <>
                <div className={styles.recoveryList}>
                  {recoveryCodes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={() => {
                    router.replace(returnTo);
                    router.refresh();
                  }}
                >
                  Continuar
                </button>
              </>
            ) : null}
          </div>

          <div className={styles.divider}>
            <span />
            <strong>ACESSO SEGURO</strong>
            <span />
          </div>

          <div className={styles.securityNote}>
            <Lock size={13} strokeWidth={1.5} aria-hidden="true" />
            <p>Conexão criptografada - apenas administradores autorizados</p>
          </div>
        </div>
      </section>
    </main>
  );
}
