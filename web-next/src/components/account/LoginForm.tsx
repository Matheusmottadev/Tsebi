"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HttpError } from "@/lib/http";
import { getGoogleAuthConfig, login, loginWithGoogle, startEmailVerification, verifyEmailCode } from "@/services/auth";

type AuthState = "email" | "code" | "password";

const FALLBACK_RETURN_URL = "/account";
const GOOGLE_STATE_KEY = "tsebi-google-oauth-state";
const GOOGLE_NONCE_KEY = "tsebi-google-oauth-nonce";
const GOOGLE_RETURN_URL_KEY = "tsebi-google-return-url";

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function mapAuthError(errorCode: string): string {
  const value = String(errorCode || "").trim().toUpperCase();
  if (!value) return "Não foi possível concluir a operação.";
  if (value === "INVALID_INPUT") return "Preencha os campos corretamente.";
  if (value === "INVALID_CREDENTIALS") return "Email, senha ou código inválidos.";
  if (value === "INVALID_OR_EXPIRED_CODE") return "Código inválido ou expirado.";
  if (value === "EMAIL_NOT_FOUND") return "Não encontramos conta com este email.";
  if (value === "EMAIL_NOT_VERIFIED") return "Verifique seu email para continuar.";
  if (value === "AUTH_CODE_ISSUE_FAILED") return "Não foi possível gerar o código agora.";
  if (value === "EMAIL_DELIVERY_FAILED") return "Não foi possível enviar o código. Tente novamente.";
  if (value === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Aguarde alguns minutos.";
  return errorCode;
}

function resolveAuthStageMessage(stage: string): string {
  const normalized = String(stage || "").trim().toLowerCase();
  if (normalized === "account_verification_required" || normalized === "login_code_required") {
    return "Sua conta exige confirmação por código de email.";
  }
  if (normalized === "password_reset_required") {
    return "Sua conta exige redefinição de senha antes de continuar.";
  }
  return "Não foi possível concluir o login agora.";
}

function resolveReturnUrl(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return FALLBACK_RETURN_URL;

  if (trimmed === "/" || trimmed.toLowerCase() === "login.html" || trimmed.toLowerCase() === "/login") {
    return FALLBACK_RETURN_URL;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.origin !== window.location.origin) return FALLBACK_RETURN_URL;

    const normalizedPath = parsed.pathname.replace(/\/+$/, "") || "/";
    if (normalizedPath === "/" || normalizedPath === "/login" || normalizedPath === "/login.html") {
      return FALLBACK_RETURN_URL;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK_RETURN_URL;
  }
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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [authState, setAuthState] = useState<AuthState>("email");
  const [email, setEmail] = useState("");
  const [activeEmail, setActiveEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [resendRemaining, setResendRemaining] = useState(0);
  const [devCodeHint, setDevCodeHint] = useState("");

  const emailPreview = useMemo(() => normalizeEmail(activeEmail || email), [activeEmail, email]);
  const loginNotice = useMemo(() => {
    const raw = String(searchParams.get("notice") || "").trim().toLowerCase();
    if (raw === "private-care") {
      return "Cadastre-se ou fa�a login para agendar seu atendimento.";
    }
    return "";
  }, [searchParams]);

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

  function finishLogin(overrideReturnUrl?: string): void {
    const returnUrl = resolveReturnUrl(overrideReturnUrl ?? String(searchParams.get("returnUrl") || ""));
    router.push(returnUrl);
    router.refresh();
  }

  async function syncGoogleAvailability(): Promise<void> {
    try {
      const config = await getGoogleAuthConfig();
      setGoogleLoginAvailable(Boolean(config.enabled && config.clientId));
    } catch {
      setGoogleLoginAvailable(false);
    }
  }

  async function beginGoogleLogin(): Promise<void> {
    setErrorMessage("");
    if (!googleLoginAvailable) {
      setErrorMessage("Login com Google indisponivel no momento.");
      return;
    }

    setIsGoogleSubmitting(true);
    try {
      const config = await getGoogleAuthConfig();
      if (!config.enabled || !config.clientId) {
        setGoogleLoginAvailable(false);
        setErrorMessage("Login com Google indisponivel no momento.");
        return;
      }

      const state = randomToken();
      const nonce = randomToken();
      const returnUrl = resolveReturnUrl(String(searchParams.get("returnUrl") || ""));

      try {
        sessionStorage.setItem(GOOGLE_STATE_KEY, state);
        sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
        sessionStorage.setItem(GOOGLE_RETURN_URL_KEY, returnUrl);
      } catch {}

      const callbackUrl = new URL(window.location.origin + window.location.pathname);
      callbackUrl.searchParams.set("google", "1");

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
      setGoogleLoginAvailable(false);
      setErrorMessage("Login com Google indisponivel no momento.");
    } finally {
      setIsGoogleSubmitting(false);
    }
  }

  async function completeGoogleLoginFromHash(): Promise<void> {
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
  }

  useEffect(() => {
    if (authState !== "code" || resendRemaining <= 0) return;

    const timerId = window.setInterval(() => {
      setResendRemaining((current) => {
        if (current <= 1) return 0;
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [authState, resendRemaining]);

  useEffect(() => {
    syncGoogleAvailability();
    completeGoogleLoginFromHash();
  }, []);

  function setState(nextState: AuthState): void {
    setAuthState(nextState);
    if (nextState === "password") {
      setEmail((current) => normalizeEmail(current || activeEmail));
    }

    if (nextState === "email") {
      setCode("");
      setPassword("");
      setIsPasswordVisible(false);
      setResendRemaining(0);
      setDevCodeHint("");
    }
  }

  async function sendCode(): Promise<void> {
    setErrorMessage("");
    setDevCodeHint("");
    setIsSubmitting(true);

    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      setIsSubmitting(false);
      setErrorMessage("Informe um e-mail válido.");
      return;
    }

    try {
      const challenge = await startEmailVerification({ email: normalized });
      if (String(challenge?.stage || "").toLowerCase() === "password_reset_required") {
        redirectToForcedPasswordReset(normalized);
        return;
      }
      const maybeDevCode = String(challenge?.devCode || "").trim();
      if (maybeDevCode) setDevCodeHint(`Codigo de teste: ${maybeDevCode}`);
      setActiveEmail(normalized);
      setState("code");
      setResendRemaining(30);
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status === 429) {
          setErrorMessage("Muitas tentativas. Aguarde e tente novamente.");
        } else {
          setErrorMessage(mapAuthError(error.message || "EMAIL_DELIVERY_FAILED"));
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível enviar o código.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(): Promise<void> {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const normalizedCode = String(code || "").replace(/\D/g, "").slice(0, 6);
      if (normalizedCode.length !== 6) {
        setIsSubmitting(false);
        setErrorMessage("Digite o código de 6 dígitos.");
        return;
      }

      const normalized = normalizeEmail(activeEmail || email);
      if (!isValidEmail(normalized)) {
        setIsSubmitting(false);
        setErrorMessage("Informe um e-mail válido.");
        setState("email");
        return;
      }

      await verifyEmailCode({ email: normalized, code: normalizedCode });
      finishLogin();
    } catch (error) {
      if (error instanceof HttpError) {
        if (String(error.message || "").trim().toUpperCase() === "PASSWORD_RESET_REQUIRED") {
          redirectToForcedPasswordReset(normalizeEmail(activeEmail || email));
          return;
        }
        if (error.status === 429) {
          setErrorMessage("Muitas tentativas. Aguarde e tente novamente.");
        } else {
          setErrorMessage(mapAuthError(error.message || "INVALID_OR_EXPIRED_CODE"));
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Falha ao verificar código.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function loginWithPassword(): Promise<void> {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const normalized = normalizeEmail(email);
      if (!isValidEmail(normalized)) {
        setIsSubmitting(false);
        setErrorMessage("Informe um e-mail válido.");
        return;
      }
      if (!password) {
        setIsSubmitting(false);
        setErrorMessage("Informe sua senha.");
        return;
      }

      const result = await login(normalized, password);
      if ("user" in result && result.user) {
        finishLogin();
        return;
      }

      const stage = String(result.stage || "");
      if (stage === "login_code_required" || stage === "account_verification_required") {
        const challengeEmail = String(("email" in result && result.email) || normalized);
        setActiveEmail(normalizeEmail(challengeEmail));
        setCode("");
        setAuthState("code");
        setResendRemaining(30);
        return;
      }

      if (stage === "password_reset_required") {
        const challengeEmail = String(("email" in result && result.email) || normalized);
        redirectToForcedPasswordReset(challengeEmail);
        return;
      }

      setErrorMessage(resolveAuthStageMessage(stage));
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.status === 401) {
          setErrorMessage("Email, senha ou código inválidos.");
        } else if (error.status === 429) {
          setErrorMessage("Muitas tentativas. Aguarde e tente novamente.");
        } else {
          setErrorMessage(mapAuthError(error.message || "INVALID_CREDENTIALS"));
        }
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível entrar com senha.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function resendCode(): Promise<void> {
    if (resendRemaining > 0) return;

    setErrorMessage("");
    setDevCodeHint("");
    setIsResendingCode(true);

    try {
      const normalized = normalizeEmail(activeEmail || email);
      if (!isValidEmail(normalized)) {
        setErrorMessage("Informe um e-mail válido.");
        setState("email");
        return;
      }

      const challenge = await startEmailVerification({ email: normalized });
      const maybeDevCode = String(challenge?.devCode || "").trim();
      if (maybeDevCode) setDevCodeHint(`Codigo de teste: ${maybeDevCode}`);
      setResendRemaining(30);
    } catch (error) {
      if (error instanceof HttpError) {
        setErrorMessage(mapAuthError(error.message || "EMAIL_DELIVERY_FAILED"));
      } else if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Não foi possível reenviar o código.");
      }
    } finally {
      setIsResendingCode(false);
    }
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (authState === "email") {
      await sendCode();
      return;
    }

    if (authState === "code") {
      await verifyCode();
      return;
    }

    await loginWithPassword();
  }

  return (
    <>
      <section className="auth-card" aria-labelledby="loginTitle">
        <h1 id="loginTitle">Entrar</h1>
        <p className="auth-sub">Acesse sua conta Tsebi para acompanhar pedidos e preferencias.</p>

      <div id="authError" className="auth-error" role="alert" hidden={!errorMessage}>
        {errorMessage}
      </div>

        <form onSubmit={handleFormSubmit}>
        <section id="stateEmail" className="auth-state" hidden={authState !== "email"}>
          <label htmlFor="emailInput">Email</label>
          <input
            id="emailInput"
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button
            id="showPasswordBtnPrimary"
            className="btn-primary auth-btn"
            type="button"
            onClick={() => {
              setErrorMessage("");
              setState("password");
            }}
          >
            Entrar com senha
          </button>
          <button id="sendCodeBtn" className="btn-primary auth-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enviando..." : "Enviar código"}
          </button>
          <div className="auth-micro">Enviaremos um código para seu e-mail.</div>
        </section>

        <section id="stateCode" className="auth-state" hidden={authState !== "code"}>
          <div className="auth-inline">
            <span id="emailPreview">{emailPreview}</span>
            <button
              id="changeEmailBtn"
              type="button"
              className="auth-link auth-link-btn"
              onClick={() => {
                setErrorMessage("");
                setState("email");
              }}
            >
              Alterar e-mail
            </button>
          </div>

          <label htmlFor="codeInput">Código</label>
          <input
            id="codeInput"
            className="auth-input"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
          />
          <button id="verifyCodeBtn" className="btn-primary auth-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Confirmando..." : "Confirmar"}
          </button>

          <div className="auth-row">
            <button
              id="resendBtn"
              type="button"
              className="auth-link auth-link-btn"
              onClick={resendCode}
              disabled={isResendingCode || resendRemaining > 0}
            >
              {isResendingCode ? "Reenviando..." : resendRemaining > 0 ? `Reenviar código (${resendRemaining}s)` : "Reenviar código"}
            </button>
            <button
              id="showPasswordBtn"
              type="button"
              className="auth-link auth-link-btn"
              onClick={() => {
                setErrorMessage("");
                setState("password");
              }}
            >
              Entrar com senha
            </button>
          </div>
          {devCodeHint ? <div className="auth-micro">{devCodeHint}</div> : null}
        </section>

        <section id="statePassword" className="auth-state" hidden={authState !== "password"}>
          <label htmlFor="emailInput2">Email</label>
          <input
            id="emailInput2"
            className="auth-input"
            type="email"
            autoComplete="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label htmlFor="passwordInput">Senha</label>
          <div className="auth-password-wrap">
            <input
              id="passwordInput"
              className="auth-input"
              type={isPasswordVisible ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              id="togglePasswordBtn"
              className="auth-link-btn auth-toggle-pass"
              onClick={() => setIsPasswordVisible((current) => !current)}
            >
              {isPasswordVisible ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <button id="loginPasswordBtn" className="btn-primary auth-btn" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>

          <div className="auth-row">
            <Link className="auth-link" href="/recuperar-senha">
              Esqueci minha senha
            </Link>
            <Link className="auth-link" href="/recuperar-senha-codigo">
              Já tenho código
            </Link>
            <button
              id="backToCodeBtn"
              type="button"
              className="auth-link auth-link-btn"
              onClick={() => {
                setErrorMessage("");
                setState("code");
                setResendRemaining((current) => (current > 0 ? current : 30));
              }}
            >
              Voltar para código por e-mail
            </button>
          </div>
        </section>

        <div className="auth-divider">
          <span>ou</span>
        </div>

        <div className="auth-social-stack">
          <button
            id="googleBtn"
            className="btn-outline auth-btn"
            type="button"
            onClick={beginGoogleLogin}
            disabled={isGoogleSubmitting || !googleLoginAvailable}
          >
            {isGoogleSubmitting ? "Conectando..." : "Continuar com Google"}
          </button>
          <button
            id="passkeyBtn"
            className="btn-outline auth-btn"
            type="button"
            onClick={() => setErrorMessage("Passkey indisponivel no momento.")}
          >
            Entrar com Passkey
          </button>
        </div>

        <p className="auth-footer">
          Ainda não tem conta?{" "}
          <Link className="auth-link" href="/account">
            Criar conta
          </Link>
        </p>
        </form>
      </section>
      {loginNotice ? (
        <div className="auth-fixed-notice" role="status" aria-live="polite">
          {loginNotice}
        </div>
      ) : null}
    </>
  );
}

