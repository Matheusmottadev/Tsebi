"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BodyClassName } from "@/components/BodyClassName";
import styles from "@/app/recuperar-senha/recuperar-senha.module.css";

type SetupStep = "codigo" | "nova-senha" | "sucesso";

type ApiErrorPayload = {
  error?: string;
  message?: string;
};

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function maskEmail(value: string): string {
  const email = normalizeEmail(value);
  const atIndex = email.indexOf("@");
  if (atIndex <= 1) return email;
  return `${email.slice(0, 2)}***${email.slice(atIndex)}`;
}

function parseCooldown(value: string | null): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return 60;
  return Math.max(0, Math.min(300, Math.floor(parsed)));
}

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const remainder = String(safe % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function mapApiError(code: string, fallback: string): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return fallback;
  if (normalized === "INVALID_INPUT") return "Revise os dados preenchidos e tente novamente.";
  if (normalized === "INVALID_OR_EXPIRED_CODE") return "Código inválido ou expirado. Tente novamente.";
  if (normalized === "EMAIL_DELIVERY_FAILED") return "Não foi possível enviar o código agora.";
  if (normalized === "AUTH_CODE_ISSUE_FAILED") return "Não foi possível gerar o código agora.";
  return fallback;
}

async function readErrorCode(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return String(payload.error || payload.message || "").trim();
  } catch {
    return "";
  }
}

export function PasswordSetupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [step, setStep] = useState<SetupStep>("codigo");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [helperMessage, setHelperMessage] = useState("");
  const [resendRemaining, setResendRemaining] = useState(60);

  const email = useMemo(() => normalizeEmail(searchParams.get("email") || ""), [searchParams]);
  const cooldown = useMemo(() => parseCooldown(searchParams.get("cooldown")), [searchParams]);
  const codigo = useMemo(() => digits.join(""), [digits]);
  const hasValidEmail = isValidEmail(email);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  useEffect(() => {
    setResendRemaining(cooldown);
    if (hasValidEmail) {
      setHelperMessage(`Enviamos um código de 6 dígitos para ${maskEmail(email)}.`);
    } else {
      setHelperMessage("");
    }
  }, [cooldown, email, hasValidEmail]);

  useEffect(() => {
    if (step !== "sucesso") return;
    const timeout = window.setTimeout(() => {
      router.push("/login");
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [router, step]);

  useEffect(() => {
    if (resendRemaining <= 0) return;
    const timerId = window.setInterval(() => {
      setResendRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [resendRemaining]);

  async function requestResetCode(): Promise<void> {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      const apiCode = await readErrorCode(response);
      throw new Error(mapApiError(apiCode, "Não foi possível enviar o código. Tente novamente."));
    }
  }

  function handleDigit(value: string, index: number): void {
    const nextValue = String(value || "").replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = nextValue;
    setDigits(nextDigits);
    setError("");

    if (nextValue && index < nextDigits.length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number): void {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputRefs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < digits.length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleVerificarCodigo(): void {
    if (!hasValidEmail) {
      setError("Sessão inválida. Volte ao login e tente novamente.");
      return;
    }

    if (digits.some((digit) => digit === "")) {
      setError("Preencha os 6 dígitos do código.");
      return;
    }

    setError("");
    setStep("nova-senha");
  }

  async function handleReenviar(): Promise<void> {
    if (resendRemaining > 0) return;
    if (!hasValidEmail) {
      setError("Sessao invalida. Volte ao login e tente novamente.");
      return;
    }

    setLoading(true);
    setError("");
    setHelperMessage("");

    try {
      await requestResetCode();
      setResendRemaining(60);
      setHelperMessage(`Enviamos um novo código para ${maskEmail(email)}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível reenviar o código.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCriarSenha(): Promise<void> {
    if (!hasValidEmail) {
      setError("Sessão inválida. Volte ao login e tente novamente.");
      return;
    }

    if (codigo.length !== 6) {
      setError("Preencha o código de 6 dígitos.");
      setStep("codigo");
      return;
    }

    if (senha.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (senha !== confirmacao) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    setError("");
    setHelperMessage("");

    try {
      const response = await fetch("/api/auth/forgot-password/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code: codigo,
          password: senha,
        }),
      });

      if (!response.ok) {
        const apiCode = await readErrorCode(response);
        throw new Error(mapApiError(apiCode, "Não foi possível concluir a criação da senha. Tente novamente."));
      }

      setStep("sucesso");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível concluir a criação da senha. Tente novamente.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <BodyClassName className={styles.isolatedBody} />
      <main className={styles.page}>
        <section className={styles.leftPanel} aria-hidden="true">
          <div className={styles.leftBackground} />
          <div className={styles.leftTop}>
            <div className={styles.leftBrand}>
              <Image className={styles.leftBrandLogo} src="/images/logo-tsebi.png" alt="" aria-hidden="true" width={26} height={26} />
              <span>TSEBI</span>
            </div>
          </div>
          <div className={styles.leftBottom}>
            <p className={styles.leftQuote}>
              Forma,
              <br />
              principio
              <br />e excelencia.
            </p>
            <p className={styles.leftTagline}>COLECAO ATUAL - SAO PAULO</p>
          </div>
        </section>

        <section className={styles.rightPanel}>
          <div className={styles.rightTop}>
            <Link href="/login" className={styles.backLink}>
              Voltar ao login
            </Link>
          </div>

          <div className={styles.formWrap}>
            {!hasValidEmail ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Criar senha.</h1>
                <p className={styles.stepSub}>Não encontramos o e-mail desta sessão. Volte ao login e tente novamente.</p>
                <button className={styles.btnPrimary} type="button" onClick={() => router.push("/login")}>
                  Voltar ao login
                </button>
              </section>
            ) : null}

            {hasValidEmail && step === "codigo" ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Criar senha.</h1>
                <p className={styles.stepSub}>
                  Confirme o codigo enviado para {maskEmail(email)} antes de definir sua senha.
                </p>

                <div className={styles.codeRow}>
                  {digits.map((digit, index) => (
                    <input
                      key={`digit-${index}`}
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      className={styles.codeDigit}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digit}
                      onChange={(event) => handleDigit(event.target.value, index)}
                      onKeyDown={(event) => handleKeyDown(event, index)}
                      aria-label={`Digito ${index + 1} do codigo`}
                    />
                  ))}
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}
                {!error && helperMessage ? <p className={styles.helper}>{helperMessage}</p> : null}

                <button className={styles.btnPrimary} type="button" onClick={handleVerificarCodigo} disabled={loading}>
                  {loading ? "Aguarde..." : "Verificar codigo"}
                </button>

                <button className={styles.resend} type="button" onClick={() => void handleReenviar()} disabled={loading || resendRemaining > 0}>
                  {resendRemaining > 0 ? `Reenviar codigo em ${formatTimer(resendRemaining)}` : "Reenviar codigo"}
                </button>
              </section>
            ) : null}

            {hasValidEmail && step === "nova-senha" ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Criar senha.</h1>
                <p className={styles.stepSub}>Defina a senha principal da sua conta Tsebi.</p>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="setup-senha">
                    Nova senha
                  </label>
                  <input
                    id="setup-senha"
                    className={styles.input}
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder="Minimo de 8 caracteres"
                    autoComplete="new-password"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="setup-confirmacao">
                    Confirmar senha
                  </label>
                  <input
                    id="setup-confirmacao"
                    className={styles.input}
                    type="password"
                    value={confirmacao}
                    onChange={(event) => setConfirmacao(event.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                  />
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}
                {!error && helperMessage ? <p className={styles.helper}>{helperMessage}</p> : null}

                <button className={styles.btnPrimary} type="button" onClick={() => void handleCriarSenha()} disabled={loading}>
                  {loading ? "Aguarde..." : "Criar senha"}
                </button>

                <button className={styles.resend} type="button" onClick={() => void handleReenviar()} disabled={loading || resendRemaining > 0}>
                  {resendRemaining > 0 ? `Reenviar codigo em ${formatTimer(resendRemaining)}` : "Reenviar codigo"}
                </button>
              </section>
            ) : null}

            {hasValidEmail && step === "sucesso" ? (
              <section className={styles.step} aria-live="polite">
                <Image className={styles.successIcon} src="/images/logo-tsebi.png" alt="Tsebi" width={52} height={52} />
                <h1 className={styles.stepTitle}>Senha criada.</h1>
                <p className={styles.stepSub}>Sua senha foi definida com sucesso. Voce ja pode entrar na sua conta.</p>

                <button className={styles.btnPrimary} type="button" onClick={() => router.push("/login")}>
                  Entrar na conta
                </button>
              </section>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <span>(c) 2025 Tsebi Brasil</span>
            <span>.</span>
            <Link href="/politica-privacidade" className={styles.footerLink}>
              Privacidade
            </Link>
            <span>.</span>
            <Link href="/aviso-legal" className={styles.footerLink}>
              Termos
            </Link>
          </footer>
        </section>
      </main>
    </>
  );
}
