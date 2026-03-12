"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import styles from "./FaqSupportSections.module.css";

const FAQ_ITEMS = [
  "Quais as formas de pagamento?",
  "Como rastrear meu pedido?",
  "Quando meu pedido sera entregue?",
  "Como realizar ou cancelar um pedido?",
  "Como trocar ou devolver meu pedido?",
  "Como cuidar das minhas pecas?",
] as const;

export function FaqSupportSections() {
  const goToTab = (tabHash: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;
    window.location.hash = tabHash;
  };

  return (
    <section className={styles.section} aria-label="Conteudo complementar de ajuda">
      <div className={styles.container}>
        <article className={styles.panel}>
          <h2 className={styles.panelTitle}>CUIDADOS E REPAROS</h2>
          <p className={styles.panelText}>
            A Tsebi oferece suporte especializado para avaliacao de cuidados e reparos das pecas. Cada solicitacao e
            analisada individualmente pelo nosso time para orientar o melhor procedimento, prazos e disponibilidade de
            servico.
          </p>
          <a className={styles.pillAction} href="/faq#servicos-e-reparos" onClick={goToTab("servicos-e-reparos")}>
            Ir para aba de cuidados e reparos
          </a>
        </article>

        <article className={styles.panel}>
          <div className={styles.headerRow}>
            <h2 className={styles.panelTitle}>PERGUNTAS FREQUENTES</h2>
          </div>

          <div className={styles.faqGrid}>
            {FAQ_ITEMS.map((question) => (
              <Link key={question} href="/faq#perguntas-frequentes" className={styles.faqLink}>
                {question}
              </Link>
            ))}
          </div>

          <a className={styles.pillAction} href="/faq#perguntas-frequentes" onClick={goToTab("perguntas-frequentes")}>
            Ver todas as perguntas
          </a>
        </article>
      </div>
    </section>
  );
}
