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

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 6.3A10.7 10.7 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-4 4.8" />
      <path d="M6.5 6.8A18.7 18.7 0 0 0 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.6-.6" />
    </svg>
  );
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(value: string): ArrayBuffer {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function decodeAuthenticationOptions(options: any): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: fromBase64Url(String(options?.challenge || "")),
    allowCredentials: Array.isArray(options?.allowCredentials)
      ? options.allowCredentials.map((item: any) => ({
          ...item,
          id: fromBase64Url(String(item?.id || "")),
        }))
      : [],
  };
}

function serializeAuthenticationCredential(credential: PublicKeyCredential | null): Record<string, unknown> | null {
  if (!credential) return null;
  const response = credential.response as AuthenticatorAssertionResponse;
  if (!response) return null;

  return {
    id: credential.id,
    rawId: toBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64Url(response.clientDataJSON),
      authenticatorData: toBase64Url(response.authenticatorData),
      signature: toBase64Url(response.signature),
      userHandle: response.userHandle ? toBase64Url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() || {},
    authenticatorAttachment: credential.authenticatorAttachment || null,
  };
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
  if (!value) return "Não foi possível concluir a operação.";
  if (value === "INVALID_INPUT") return "Preencha os campos corretamente.";
  if (value === "INVALID_CREDENTIALS") return "Email, senha ou código inválidos.";
  if (value === "INVALID_OR_EXPIRED_CODE") return "Código inválido ou expirado.";
  if (value === "EMAIL_ALREADY_EXISTS") return "Este email já possui uma conta.";
  if (value === "EMAIL_NOT_VERIFIED") return "Verifique seu email para continuar.";
  if (value === "AUTH_CODE_ISSUE_FAILED") return "Não foi possível gerar o código agora.";
  if (value === "EMAIL_DELIVERY_FAILED") return "Não foi possível enviar o código. Tente novamente.";
  if (value === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Aguarde alguns minutos.";
  if (value === "PASSWORD_RESET_REQUIRED") return "Sua conta exige redefinição de senha antes de continuar.";
  if (value === "PASSKEY_NOT_CONFIGURED") return "Passkey indisponível no momento (configuração do domínio).";
  if (value === "PASSKEY_NOT_FOUND") return "Nenhuma passkey cadastrada para este e-mail.";
  if (value === "PASSKEY_CHALLENGE_NOT_FOUND") return "Sessão de passkey expirada. Tente novamente.";
  return "Não foi possível concluir a operação.";
}

function readHttpErrorCode(error: HttpError): string {
  const payload = error.payload;
  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error?: unknown }).error || "").trim().toUpperCase();
  }
  return String(error.message || "").trim().toUpperCase();
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
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [helperMessage, setHelperMessage] = useState("");

  const [isSessionReady, setIsSessionReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isPasskeySubmitting, setIsPasskeySubmitting] = useState(false);

  const activeEmailPreview = useMemo(() => normalizeEmail(activeEmail || email), [activeEmail, email]);
  const loginNotice = useMemo(() => {
    const notice = String(searchParams.get("notice") || "").trim().toLowerCase();
    if (notice === "private-care") return "Cadastre-se ou faça login para agendar seu atendimento.";
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
      setErrorMessage("Não foi possível iniciar a redefinição de senha.");
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
        setErrorMessage("Não foi possível concluir o login com Google.");
        return;
      }
      finishLogin(storedReturnUrl || undefined);
    } catch {
      setErrorMessage("Não foi possível concluir o login com Google.");
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
      setFieldErrors({ email: "Informe um e-mail válido." });
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
        setErrorMessage("Não foi possível validar o e-mail.");
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
      setFieldErrors({ email: "Informe um e-mail válido para continuar." });
      setErrorMessage("Não conseguimos validar o e-mail desta sessão. Tente novamente.");
      setIsSubmitting(false);
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
        setHelperMessage("Código enviado para seu e-mail.");
        goToStep("code");
        return;
      }

      setErrorMessage("Não foi possível concluir o login agora.");
    } catch (error) {
      if (error instanceof HttpError) {
        const code = readHttpErrorCode(error);
        if (code === "INVALID_CREDENTIALS") {
          setFieldErrors({ password: "Senha incorreta." });
          setErrorMessage("Email ou senha inválidos.");
        } else {
          setErrorMessage(mapAuthError(code || "INVALID_CREDENTIALS"));
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível entrar agora.");
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
      setFieldErrors({ email: "Informe um e-mail válido." });
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
        setErrorMessage("Não foi possível enviar o código.");
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
      setFieldErrors({ email: "Informe um e-mail válido." });
      setIsSubmitting(false);
      goToStep("email");
      return;
    }

    const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6);
    if (normalizedCode.length !== 6) {
      setFieldErrors({ code: "Digite o código de 6 dígitos." });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await verifyEmailCode({ email: normalized, code: normalizedCode });

      if (codeOrigin === "create") {
        const stage = String((response as { stage?: unknown })?.stage || "").trim().toLowerCase();
        const passwordResetRequired = Boolean(
          (response as { user?: { passwordResetRequired?: unknown } })?.user?.passwordResetRequired
        );
        if (passwordResetRequired || stage === "password_reset_required") {
          redirectToForcedPasswordReset(normalized);
          return;
        }
      }

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
        setErrorMessage("Não foi possível verificar o código.");
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
      setFieldErrors({ email: "Informe um e-mail válido." });
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
      setHelperMessage("Código reenviado para seu e-mail.");
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "EMAIL_DELIVERY_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível reenviar o código.");
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
    if (!isValidEmail(normalizedEmailValue)) nextErrors.email = "Informe um e-mail válido.";
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
      setHelperMessage("Enviamos um código para concluir seu cadastro.");
      goToStep("code");
    } catch (error) {
      if (error instanceof HttpError) {
        const codeValue = String(error.message || "").trim().toUpperCase();
        if (codeValue === "EMAIL_ALREADY_EXISTS") {
          setActiveEmail(normalizedEmailValue);
          setPassword("");
          setHelperMessage("Este e-mail já possui conta. Entre com sua senha.");
          goToStep("password");
          return;
        }
        setErrorMessage(mapAuthError(codeValue || "REQUEST_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível criar sua conta agora.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasskeyLogin(): Promise<void> {
    clearFeedback();

    if (!(window.PublicKeyCredential && navigator.credentials)) {
      setErrorMessage("Este navegador nao suporta Passkey.");
      return;
    }

    const normalized = normalizeEmail(activeEmail || email);
    if (!isValidEmail(normalized)) {
      setFieldErrors({ email: "Informe seu e-mail para entrar com Passkey." });
      if (step !== "email") goToStep("email");
      return;
    }

    setIsPasskeySubmitting(true);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/login/options", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });
      const optionsData = await optionsResponse.json().catch(() => ({}));
      if (!optionsResponse.ok || !optionsData?.ok || !optionsData?.options) {
        setErrorMessage(mapAuthError(String(optionsData?.error || "PASSKEY_NOT_FOUND")));
        return;
      }

      let assertion: PublicKeyCredential | null = null;
      try {
        assertion = (await navigator.credentials.get({
          publicKey: decodeAuthenticationOptions(optionsData.options),
        })) as PublicKeyCredential | null;
      } catch (error: any) {
        if (error?.name === "NotAllowedError") {
          setErrorMessage("Autenticacao por Passkey cancelada.");
        } else {
          setErrorMessage("Falha ao autenticar com Passkey.");
        }
        return;
      }

      const serialized = serializeAuthenticationCredential(assertion);
      if (!serialized) {
        setErrorMessage("Falha ao autenticar com Passkey.");
        return;
      }

      const verifyResponse = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalized, credential: serialized }),
      });
      const verifyData = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || !verifyData?.ok) {
        setErrorMessage(mapAuthError(String(verifyData?.error || "INVALID_CREDENTIALS")));
        return;
      }

      finishLogin();
    } catch {
      setErrorMessage("Não foi possível concluir o login por Passkey.");
    } finally {
      setIsPasskeySubmitting(false);
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
              onClick={() => void handlePasskeyLogin()}
              disabled={isPasskeySubmitting}
            >
              <span className={styles.outlineIcon}>
                <PasskeyIcon />
              </span>
              <span>{isPasskeySubmitting ? "Conectando..." : "Entrar com Passkey"}</span>
            </button>
          </form>

          <p className={styles.footerLinkText}>
            Ainda não tem conta?{" "}
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
              <div className={styles.passwordInputWrap}>
                <input
                  id="login-password"
                  className={`${styles.input} ${styles.passwordInput} ${fieldErrors.password ? styles.inputError : ""}`}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Digite sua senha"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
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
              Entrar com código por e-mail
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
          <p className={styles.subtitle}>Enviamos um código de acesso.</p>

          <form className={styles.form} onSubmit={handleStepCodeSubmit}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-code">
                CÓDIGO
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
            {isResending ? "Reenviando..." : "Reenviar código"}
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
          Já tem conta?{" "}
          <button type="button" className={styles.inlineLinkButton} onClick={() => goToStep("email")}>
            Entrar
          </button>
        </p>
      </div>
    );
  }

  return (
    <main className={`${styles.loginPage} ${styles.page}`}>
      <section className={styles.editorialPanel}>
        <div className={styles.editorialContent}>
          <Link className={styles.editorialBrand} href="/">
            TSEBI
          </Link>
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
          {loginNotice ? (
            <p className={styles.noticeBanner} role="status" aria-live="polite">
              {loginNotice}
            </p>
          ) : null}
          {!isSessionReady ? <div className={styles.loadingState}>Carregando...</div> : renderStepContent()}

          {errorMessage ? (
            <p className={styles.errorMessage} role="alert">
              {errorMessage}
            </p>
          ) : null}
          {helperMessage ? <p className={styles.helperMessage}>{helperMessage}</p> : null}
        </div>
      </section>
    </main>
  );
}
