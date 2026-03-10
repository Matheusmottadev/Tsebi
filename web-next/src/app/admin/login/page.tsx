"use client";

import { Cormorant_Garamond, Jost } from "next/font/google";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { useRef, useState } from "react";
import styles from "./page.module.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-cormorant",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-jost",
});

type FieldErrors = {
  email?: string;
  password?: string;
};

export default function AdminLoginPage() {
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);

  function handleLoginClick() {
    if (isLoading) return;

    const nextErrors: FieldErrors = {};
    if (!String(email || "").includes("@")) {
      nextErrors.email = "E-mail inválido.";
    }
    if (String(password || "").trim().length < 4) {
      nextErrors.password = "Senha incorreta.";
    }

    setErrors(nextErrors);

    if (nextErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    setIsLoading(true);
    window.setTimeout(() => {
      router.push("/admin");
    }, 2000);
  }

  return (
    <main className={`${styles.root} ${cormorant.variable} ${jost.variable}`}>
      <section className={styles.leftPanel}>
        <header className={styles.brandBlock}>
          <h1>TSEBI</h1>
          <p>Painel Administrativo</p>
        </header>

        <div className={styles.quoteWrap}>
          <h2>
            Forma,
            <br />
            <em>princípio</em>
            <br />e excelência.
          </h2>
          <span>Gestão com o mesmo padrão da marca</span>
        </div>

        <footer className={styles.leftFooter}>© 2025 Tsebi Brasil - Acesso restrito</footer>
      </section>

      <section className={styles.rightPanel}>
        <div className={styles.loginBox}>
          <h3>Bem-vindo de volta.</h3>
          <p className={styles.subtitle}>Insira suas credenciais para continuar</p>

          <div className={styles.fields}>
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
