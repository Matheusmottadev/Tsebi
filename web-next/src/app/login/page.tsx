"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HttpError } from "@/lib/http";
import {
  checkEmail,
  getGoogleAuthConfig,
  getMe,
  login,
  loginWithGoogle,
  registerLite,
  startEmailVerification,
  verifyEmailCode,
} from "@/services/auth";
import styles from "./login.module.css";

type LoginStep = "email" | "password" | "code" | "create";
type CodeOrigin = "password" | "create";

const FALLBACK_RETURN_URL = "/account";
const GOOGLE_STATE_KEY = "tsebi-google-oauth-state";
const GOOGLE_NONCE_KEY = "tsebi-google-oauth-nonce";
const GOOGLE_RETURN_URL_KEY = "tsebi-google-return-url";
const EDITORIAL_QUOTE_LINE_1 = "Forma,";
const EDITORIAL_QUOTE_LINE_2 = "princ\u00EDpio";
const EDITORIAL_QUOTE_LINE_3 = "e excel\u00EAncia.";
const EDITORIAL_META = "COLE\u00C7\u00C3O ATUAL \u2014 S\u00C3O PAULO";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function randomToken(size = 24): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = new Uint8Array(size);
  window.crypto.getRandomValues(values);
  let token = "";
  for (let index = 0; index < values.length; index += 1) {
    token += alphabet[values[index] % alphabet.length];
  }
  return token;
}

function mapAuthError(errorCode: string): string {
  const value = String(errorCode || "").trim().toUpperCase();
  if (!value) return "Nao foi possivel concluir a operacao.";
  if (value === "INVALID_INPUT") return "Preencha os campos corretamente.";
  if (value === "INVALID_CREDENTIALS") return "Email, senha ou codigo invalidos.";
  if (value === "INVALID_OR_EXPIRED_CODE") return "Codigo invalido ou expirado.";
  if (value === "EMAIL_ALREADY_EXISTS") return "Este email ja possui uma conta.";
  if (value === "EMAIL_NOT_VERIFIED") return "Verifique seu email para continuar.";
  if (value === "AUTH_CODE_ISSUE_FAILED") return "Nao foi possivel gerar o codigo agora.";
  if (value === "EMAIL_DELIVERY_FAILED") return "Nao foi possivel enviar o codigo. Tente novamente.";
  if (value === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Aguarde alguns minutos.";
  if (value === "PASSWORD_RESET_REQUIRED") return "Sua conta exige redefinicao de senha antes de continuar.";
  return "Nao foi possivel concluir a operacao.";
}

function resolveReturnUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return FALLBACK_RETURN_URL;

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "https://tsebi.com.br";
  try {
    const parsed = new URL(trimmed, siteOrigin);
    if (parsed.origin !== siteOrigin) return FALLBACK_RETURN_URL;

    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath === "/" || normalizedPath === "/login" || normalizedPath === "/login.html") {
      return FALLBACK_RETURN_URL;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK_RETURN_URL;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrlParam = String(searchParams.get("returnUrl") || "");

  const [step, setStep] = useState<LoginStep>("email");
  const [stepKey, setStepKey] = useState(0);
  const [codeOrigin, setCodeOrigin] = useState<CodeOrigin>("password");

  const [email, setEmail] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [helperMessage, setHelperMessage] = useState("");

  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const activeEmailPreview = useMemo(() => normalizeEmail(activeEmail || email), [activeEmail, email]);
  const loginNotice = useMemo(() => {
    const notice = String(searchParams.get("notice") || "").trim().toLowerCase();
    if (notice === "private-care") return "Cadastre-se ou faca login para agendar seu atendimento.";
    return "";
  }, [searchParams]);

  function goToStep(nextStep: LoginStep): void {
    setStep(nextStep);
    setStepKey((current) => current + 1);
    setFieldErrors({});
    setErrorMessage("");
  }

  function clearFeedback(): void {
    setFieldErrors({});
    setErrorMessage("");
    setHelperMessage("");
  }

  function redirectToForcedPasswordReset(targetEmail: string): void {
    const normalized = normalizeEmail(targetEmail);
    if (!isValidEmail(normalized)) {
      setErrorMessage("Nao foi possivel iniciar a redefinicao de senha.");
      return;
    }

    const params = new URLSearchParams();
    params.set("email", normalized);
    params.set("cooldown", "60");
    router.push(`/recuperar-senha-codigo?${params.toString()}`);
  }

  const finishLogin = useCallback(
    (overrideReturnUrl?: string) => {
      const nextPath = resolveReturnUrl(overrideReturnUrl ?? returnUrlParam);
      router.replace(nextPath);
      router.refresh();
    },
    [returnUrlParam, router]
  );

  async function beginGoogleLogin(): Promise<void> {
    clearFeedback();
    setIsGoogleSubmitting(true);
    try {
      const config = await getGoogleAuthConfig();
      if (!config.enabled || !config.clientId) {
        setErrorMessage("Login com Google indisponivel no momento.");
        return;
      }

      const state = randomToken();
      const nonce = randomToken();
      const returnUrl = resolveReturnUrl(returnUrlParam);

      try {
        sessionStorage.setItem(GOOGLE_STATE_KEY, state);
        sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
        sessionStorage.setItem(GOOGLE_RETURN_URL_KEY, returnUrl);
      } catch {}

      const callbackUrl = new URL(window.location.origin + window.location.pathname);
      callbackUrl.searchParams.set("google", "1");
      if (returnUrlParam) callbackUrl.searchParams.set("returnUrl", returnUrlParam);

      const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      oauthUrl.searchParams.set("client_id", config.clientId);
      oauthUrl.searchParams.set("redirect_uri", callbackUrl.toString());
      oauthUrl.searchParams.set("response_type", "id_token");
      oauthUrl.searchParams.set("scope", "openid email profile");
      oauthUrl.searchParams.set("prompt", "select_account");
      oauthUrl.searchParams.set("state", state);
      oauthUrl.searchParams.set("nonce", nonce);

      window.location.href = oauthUrl.toString();
    } catch {
      setErrorMessage("Login com Google indisponivel no momento.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  const completeGoogleLoginFromHash = useCallback(async (): Promise<void> => {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return;

    const hashParams = new URLSearchParams(hash);
    const idToken = String(hashParams.get("id_token") || "").trim();
    if (!idToken) return;

    const stateFromHash = String(hashParams.get("state") || "").trim();
    let expectedState = "";
    let expectedNonce = "";
    let storedReturnUrl = "";

    try {
      expectedState = String(sessionStorage.getItem(GOOGLE_STATE_KEY) || "");
      expectedNonce = String(sessionStorage.getItem(GOOGLE_NONCE_KEY) || "");
      storedReturnUrl = String(sessionStorage.getItem(GOOGLE_RETURN_URL_KEY) || "");
      sessionStorage.removeItem(GOOGLE_STATE_KEY);
      sessionStorage.removeItem(GOOGLE_NONCE_KEY);
      sessionStorage.removeItem(GOOGLE_RETURN_URL_KEY);
    } catch {}

    history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);

    if (!stateFromHash || !expectedState || stateFromHash !== expectedState) {
      setErrorMessage("Falha ao validar login Google.");
      return;
    }

    setIsGoogleSubmitting(true);
    try {
      const response = await loginWithGoogle({ idToken, nonce: expectedNonce });
      if (!response?.ok || !response?.user) {
        setErrorMessage("Nao foi possivel concluir o login com Google.");
        return;
      }
      finishLogin(storedReturnUrl || undefined);
    } catch {
      setErrorMessage("Nao foi possivel concluir o login com Google.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  }, [finishLogin]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession(): Promise<void> {
      try {
        const user = await getMe({ cache: "no-store" });
        if (cancelled) return;
        if (user) {
          finishLogin();
          return;
        }
      } catch {
        // login segue para exibicao do formulario
      } finally {
        if (!cancelled) setIsSessionReady(true);
      }
    }

    void bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, [finishLogin]);

  useEffect(() => {
    void completeGoogleLoginFromHash();
  }, [completeGoogleLoginFromHash]);

  async function handleStepEmailSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe um e-mail valido." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await checkEmail({ email: normalized });
      setEmail(normalized);
      setActiveEmail(normalized);
      if (response.exists) {
        setPassword("");
        goToStep("password");
        return;
      }

      goToStep("create");
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "REQUEST_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel validar o e-mail.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStepPasswordSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    const normalized = normalizeEmail(activeEmail || email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe um e-mail valido." });
      setIsSubmitting(false);
      goToStep("email");
      return;
    }

    if (!String(password || "").trim()) {
      setFieldErrors({ password: "Informe sua senha." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await login({ email: normalized, password: String(password || "") });
      if ("user" in response && response.user) {
        finishLogin();
        return;
      }

      const stage = String(response.stage || "").trim().toLowerCase();
      if (stage === "password_reset_required") {
        redirectToForcedPasswordReset(normalized);
        return;
      }

      if (stage === "login_code_required" || stage === "account_verification_required") {
        setActiveEmail(normalized);
        setCode("");
        setCodeOrigin("password");
        setHelperMessage("Codigo enviado para seu e-mail.");
        goToStep("code");
        return;
      }

      setErrorMessage("Nao foi possivel concluir o login agora.");
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "INVALID_CREDENTIALS"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel entrar agora.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendCodeFromPassword(): Promise<void> {
    clearFeedback();
    setIsSubmitting(true);

    const normalized = normalizeEmail(activeEmail || email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe um e-mail valido." });
      setIsSubmitting(false);
      goToStep("email");
      return;
    }

    try {
      const response = await startEmailVerification({ email: normalized });
      const stage = String(response.stage || "").trim().toLowerCase();
      if (stage === "password_reset_required") {
        redirectToForcedPasswordReset(normalized);
        return;
      }

      setActiveEmail(normalized);
      setCode("");
      setCodeOrigin("password");
      setHelperMessage("Codigo enviado para seu e-mail.");
      goToStep("code");
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "EMAIL_DELIVERY_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel enviar o codigo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStepCodeSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    const normalized = normalizeEmail(activeEmail || email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe um e-mail valido." });
      setIsSubmitting(false);
      goToStep("email");
      return;
    }

    const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setFieldErrors({ code: "Digite o codigo de 6 digitos." });
      setIsSubmitting(false);
      return;
    }

    try {
      await verifyEmailCode({ email: normalized, code: normalizedCode });
      finishLogin();
    } catch (error) {
      if (error instanceof HttpError) {
        if (String(error.message || "").trim().toUpperCase() === "PASSWORD_RESET_REQUIRED") {
          redirectToForcedPasswordReset(normalized);
          return;
        }
        setErrorMessage(mapAuthError(error.message || "INVALID_OR_EXPIRED_CODE"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel verificar o codigo.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendCode(): Promise<void> {
    clearFeedback();
    setIsResending(true);

    const normalized = normalizeEmail(activeEmail || email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe um e-mail valido." });
      setIsResending(false);
      goToStep("email");
      return;
    }

    try {
      const response = await startEmailVerification({ email: normalized });
      const stage = String(response.stage || "").trim().toLowerCase();
      if (stage === "password_reset_required") {
        redirectToForcedPasswordReset(normalized);
        return;
      }
      setHelperMessage("Codigo reenviado para seu e-mail.");
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "EMAIL_DELIVERY_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel reenviar o codigo.");
      }
    } finally {
      setIsResending(false);
    }
  }

  async function handleStepCreateSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();
    setIsSubmitting(true);

    const nextErrors: Record<string, string> = {};
    const normalizedEmailValue = normalizeEmail(email);
    const normalizedName = String(name || "").trim();

    if (normalizedName.length < 2) nextErrors.name = "Informe seu nome completo.";
    if (!isValidEmail(normalizedEmailValue)) nextErrors.email = "Informe um e-mail valido.";
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setIsSubmitting(false);
      return;
    }

    try {
      await registerLite({
        name: normalizedName,
        email: normalizedEmailValue,
      });

      setActiveEmail(normalizedEmailValue);
      setCode("");
      setCodeOrigin("create");
      setHelperMessage("Enviamos um codigo para concluir seu cadastro.");
      goToStep("code");
    } catch (error) {
      if (error instanceof HttpError) {
        const codeValue = String(error.message || "").trim().toUpperCase();
        if (codeValue === "EMAIL_ALREADY_EXISTS") {
          setActiveEmail(normalizedEmailValue);
          setPassword("");
          setHelperMessage("Este e-mail ja possui conta. Entre com sua senha.");
          goToStep("password");
          return;
        }
        setErrorMessage(mapAuthError(codeValue || "REQUEST_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Nao foi possivel criar sua conta agora.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderStepContent() {
    if (step === "email") {
      return (
        <div className={styles.stepPane} key={`step-${stepKey}-email`}>
          <h1 className={styles.title}>Entrar.</h1>
          <p className={styles.subtitle}>Insira seu e-mail para continuar.</p>

          <form className={styles.form} onSubmit={handleStepEmailSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-email">
                E-MAIL
              </label>
              <input
                id="login-email"
                className={`${styles.input} ${fieldErrors.email ? styles.inputError : ""}`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="seu@email.com"
              />
              {fieldErrors.email ? <small className={styles.fieldError}>{fieldErrors.email}</small> : null}
            </div>

            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Continuando..." : "Continuar"}
            </button>

            <div className={styles.divider}>
              <span>ou</span>
            </div>

            <button
              type="button"
              className={`${styles.outlineButton} ${styles.iconOutlineButton}`}
              onClick={() => void beginGoogleLogin()}
              disabled={isGoogleSubmitting}
            >
              <span className={styles.outlineIcon}>
                <GoogleIcon />
              </span>
              <span>{isGoogleSubmitting ? "Conectando..." : "Continuar com Google"}</span>
            </button>
            <button
              type="button"
              className={`${styles.outlineButton} ${styles.iconOutlineButton}`}
              onClick={() => setErrorMessage("Passkey indisponivel no momento.")}
            >
              <span className={styles.outlineIcon}>
                <PasskeyIcon />
              </span>
              <span>Entrar com Passkey</span>
            </button>
          </form>

          <p className={styles.footerLinkText}>
            Ainda nao tem conta?{" "}
            <button
              type="button"
              className={styles.inlineLinkButton}
              onClick={() => {
                clearFeedback();
                setName("");
                goToStep("create");
              }}
            >
              Criar agora
            </button>
          </p>
        </div>
      );
    }

    if (step === "password") {
      return (
        <div className={styles.stepPane} key={`step-${stepKey}-password`}>
          <button type="button" className={styles.backButton} onClick={() => goToStep("email")} aria-label="Voltar">
            &larr; Voltar
          </button>
          <h1 className={styles.title}>Bem-vinda de volta.</h1>
          <p className={styles.subtitle}>{activeEmailPreview}</p>

          <form className={styles.form} onSubmit={handleStepPasswordSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">
                SENHA
              </label>
              <input
                id="login-password"
                className={`${styles.input} ${fieldErrors.password ? styles.inputError : ""}`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Digite sua senha"
              />
              {fieldErrors.password ? <small className={styles.fieldError}>{fieldErrors.password}</small> : null}
            </div>

            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Entrando..." : "Entrar"}
            </button>

            <div className={styles.divider}>
              <span>ou</span>
            </div>

            <button
              type="button"
              className={styles.outlineButton}
              onClick={() => void handleSendCodeFromPassword()}
              disabled={isSubmitting}
            >
              Entrar com codigo por e-mail
            </button>
          </form>

          <Link className={styles.secondaryLink} href="/recuperar-senha">
            Esqueceu a senha?
          </Link>
        </div>
      );
    }

    if (step === "code") {
      return (
        <div className={styles.stepPane} key={`step-${stepKey}-code`}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => goToStep(codeOrigin === "create" ? "create" : "password")}
            aria-label="Voltar"
          >
            &larr; Voltar
          </button>
          <h1 className={styles.title}>Verifique seu e-mail.</h1>
          <p className={styles.subtitle}>Enviamos um codigo de acesso.</p>

          <form className={styles.form} onSubmit={handleStepCodeSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-code">
                CODIGO
              </label>
              <input
                id="login-code"
                className={`${styles.input} ${fieldErrors.code ? styles.inputError : ""}`}
                inputMode="numeric"
                maxLength={6}
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
              />
              {fieldErrors.code ? <small className={styles.fieldError}>{fieldErrors.code}</small> : null}
            </div>

            <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
              {isSubmitting ? "Verificando..." : "Verificar"}
            </button>
          </form>

          <button type="button" className={styles.secondaryLinkButton} onClick={() => void handleResendCode()} disabled={isResending}>
            {isResending ? "Reenviando..." : "Reenviar codigo"}
          </button>
        </div>
      );
    }

    return (
      <div className={styles.stepPane} key={`step-${stepKey}-create`}>
        <button type="button" className={styles.backButton} onClick={() => goToStep("email")} aria-label="Voltar">
          &larr; Voltar
        </button>
        <h1 className={styles.title}>Criar conta.</h1>
        <p className={styles.subtitle}>Junte-se a Tsebi.</p>

        <form className={styles.form} onSubmit={handleStepCreateSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="create-name">
              NOME
            </label>
            <input
              id="create-name"
              className={`${styles.input} ${fieldErrors.name ? styles.inputError : ""}`}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Seu nome"
            />
            {fieldErrors.name ? <small className={styles.fieldError}>{fieldErrors.name}</small> : null}
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="create-email">
              E-MAIL
            </label>
            <input
              id="create-email"
              className={`${styles.input} ${fieldErrors.email ? styles.inputError : ""}`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
            />
            {fieldErrors.email ? <small className={styles.fieldError}>{fieldErrors.email}</small> : null}
          </div>

          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "Criando..." : "Criar conta"}
          </button>

          <div className={styles.divider}>
            <span>ou</span>
          </div>

          <button
            type="button"
            className={`${styles.outlineButton} ${styles.iconOutlineButton}`}
            onClick={() => void beginGoogleLogin()}
            disabled={isGoogleSubmitting}
          >
            <span className={styles.outlineIcon}>
              <GoogleIcon />
            </span>
            <span>{isGoogleSubmitting ? "Conectando..." : "Continuar com Google"}</span>
          </button>
        </form>

        <p className={styles.footerLinkText}>
          Ja tem conta?{" "}
          <button type="button" className={styles.inlineLinkButton} onClick={() => goToStep("email")}>
            Entrar
          </button>
        </p>
      </div>
    );
  }

  return (
    <main className={`${styles.loginPage} ${styles.page}`}>
      <section className={styles.editorialPanel} aria-hidden="true">
        <div className={styles.editorialContent}>
          <p className={styles.editorialBrand}>TSEBI</p>
          <div className={styles.editorialQuoteWrap}>
            <p className={styles.editorialQuote} suppressHydrationWarning>
              {EDITORIAL_QUOTE_LINE_1}
              <br />
              {EDITORIAL_QUOTE_LINE_2}
              <br />
              {EDITORIAL_QUOTE_LINE_3}
            </p>
            <p className={styles.editorialMeta} suppressHydrationWarning>
              {EDITORIAL_META}
            </p>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formWrap}>
          {!isSessionReady ? <div className={styles.loadingState}>Carregando...</div> : renderStepContent()}

          {errorMessage ? (
            <p className={styles.errorMessage} role="alert">
              {errorMessage}
            </p>
          ) : null}
          {helperMessage ? <p className={styles.helperMessage}>{helperMessage}</p> : null}
          {loginNotice ? <p className={styles.notice}>{loginNotice}</p> : null}
        </div>
      </section>
    </main>
  );
}
