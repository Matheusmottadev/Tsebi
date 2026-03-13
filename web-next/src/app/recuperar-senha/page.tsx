"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BodyClassName } from "@/components/BodyClassName";
import styles from "./recuperar-senha.module.css";

type RecoveryStep = "email" | "codigo" | "nova-senha" | "sucesso";

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

export default function RecuperarSenhaPage() {
  const router = useRouter();
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [helperMessage, setHelperMessage] = useState("");

  const codigo = useMemo(() => digits.join(""), [digits]);
  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);

  useEffect(() => {
    if (step !== "codigo") return;
    inputRefs.current[0]?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== "sucesso") return;

    const timeout = window.setTimeout(() => {
      router.push("/login");
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [router, step]);

  async function handleEnviarCodigo(): Promise<void> {
    if (!isValidEmail(normalizedEmail)) {
      setError("Insira um e-mail válido.");
      return;
    }

    setLoading(true);
    setError("");
    setHelperMessage("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const apiCode = await readErrorCode(response);
        throw new Error(mapApiError(apiCode, "Não foi possível enviar o código. Tente novamente."));
      }

      setDigits(["", "", "", "", "", ""]);
      setStep("codigo");
      setHelperMessage("Código enviado com sucesso.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível enviar o código. Tente novamente.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleDigit(value: string, index: number): void {
    const nextValue = String(value || "").replace(/\D/g, "").slice(-1);
    const nextDigits = [...digits];
    nextDigits[index] = nextValue;
    setDigits(nextDigits);
    setError("");
    setHelperMessage("");

    if (nextValue && index < nextDigits.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (nextDigits.every((digit) => digit !== "")) {
      window.setTimeout(() => {
        setStep("nova-senha");
      }, 60);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, index: number): void {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < digits.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleVerificarCodigo(): void {
    if (digits.some((digit) => digit === "")) {
      setError("Preencha os 6 dígitos do código.");
      return;
    }

    setError("");
    setHelperMessage("");
    setStep("nova-senha");
  }

  async function handleReenviar(): Promise<void> {
    if (!isValidEmail(normalizedEmail)) {
      setError("Insira um e-mail válido para reenviar.");
      return;
    }

    setLoading(true);
    setError("");
    setHelperMessage("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        const apiCode = await readErrorCode(response);
        throw new Error(mapApiError(apiCode, "Não foi possível reenviar o código."));
      }

      setHelperMessage("Enviamos um novo código para o seu e-mail.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível reenviar o código.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRedefinir(): Promise<void> {
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          code: codigo,
          password: senha,
        }),
      });

      if (!response.ok) {
        const apiCode = await readErrorCode(response);
        throw new Error(mapApiError(apiCode, "Não foi possível redefinir a senha. Tente novamente."));
      }

      setStep("sucesso");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível redefinir a senha. Tente novamente.";
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
              <Image
                className={styles.leftBrandLogo}
                src="/images/logo-tsebi.png"
                alt=""
                aria-hidden="true"
                width={26}
                height={26}
              />
              <span>TSEBI</span>
            </div>
          </div>

          <div className={styles.leftBottom}>
            <p className={styles.leftQuote}>
              Forma,
              <br />
              princípio
              <br />
              e excelência.
            </p>
            <p className={styles.leftTagline}>COLEÇÃO ATUAL — SÃO PAULO</p>
          </div>
        </section>

        <section className={styles.rightPanel}>
          <div className={styles.rightTop}>
            <Link href="/login" className={styles.backLink}>
              ← Voltar ao login
            </Link>
          </div>

          <div className={styles.formWrap}>
            {step === "email" ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Recuperar acesso.</h1>
                <p className={styles.stepSub}>
                  Insira seu e-mail e enviaremos um código para criar uma nova senha.
                </p>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="recuperar-email">
                    E-mail
                  </label>
                  <input
                    id="recuperar-email"
                    className={styles.input}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="seu@email.com"
                    autoComplete="email"
                  />
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}

                <button className={styles.btnPrimary} type="button" onClick={() => void handleEnviarCodigo()} disabled={loading}>
                  {loading ? "Aguarde..." : "Enviar código"}
                </button>
              </section>
            ) : null}

            {step === "codigo" ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Verifique seu e-mail.</h1>
                <p className={styles.stepSub}>
                  Enviamos um código de 6 dígitos para <strong>{normalizedEmail}</strong>.
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
                      aria-label={`Dígito ${index + 1} do código`}
                    />
                  ))}
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}
                {!error && helperMessage ? <p className={styles.helper}>{helperMessage}</p> : null}

                <button className={styles.btnPrimary} type="button" onClick={handleVerificarCodigo} disabled={loading}>
                  {loading ? "Aguarde..." : "Verificar código"}
                </button>

                <button className={styles.resend} type="button" onClick={() => void handleReenviar()} disabled={loading}>
                  Reenviar código
                </button>
              </section>
            ) : null}

            {step === "nova-senha" ? (
              <section className={styles.step} aria-live="polite">
                <h1 className={styles.stepTitle}>Nova senha.</h1>
                <p className={styles.stepSub}>Escolha uma senha segura para sua conta Tsebi.</p>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="recuperar-senha">
                    Nova senha
                  </label>
                  <input
                    id="recuperar-senha"
                    className={styles.input}
                    type="password"
                    value={senha}
                    onChange={(event) => setSenha(event.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    autoComplete="new-password"
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="recuperar-confirmacao">
                    Confirmar senha
                  </label>
                  <input
                    id="recuperar-confirmacao"
                    className={styles.input}
                    type="password"
                    value={confirmacao}
                    onChange={(event) => setConfirmacao(event.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                  />
                </div>

                {error ? <p className={styles.error}>{error}</p> : null}

                <button className={styles.btnPrimary} type="button" onClick={() => void handleRedefinir()} disabled={loading}>
                  {loading ? "Aguarde..." : "Redefinir senha"}
                </button>
              </section>
            ) : null}

            {step === "sucesso" ? (
              <section className={styles.step} aria-live="polite">
                <Image
                  className={styles.successIcon}
                  src="/images/logo-tsebi.png"
                  alt="Tsebi"
                  width={52}
                  height={52}
                />
                <h1 className={styles.stepTitle}>Senha redefinida.</h1>
                <p className={styles.stepSub}>
                  Sua senha foi alterada com sucesso. Você já pode entrar na sua conta.
                </p>

                <button className={styles.btnPrimary} type="button" onClick={() => router.push("/login")}>
                  Entrar na conta
                </button>
              </section>
            ) : null}
          </div>

          <footer className={styles.footer}>
            <span>© 2025 Tsebi Brasil</span>
            <span>·</span>
            <Link href="/politica-privacidade" className={styles.footerLink}>
              Privacidade
            </Link>
            <span>·</span>
            <Link href="/aviso-legal" className={styles.footerLink}>
              Termos
            </Link>
          </footer>
        </section>
      </main>
    </>
  );
}
