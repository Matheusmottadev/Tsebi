"use client";

import { useEffect, useState } from "react";
import { getMe } from "@/services/auth";
import styles from "./HelpCenterContactSection.module.css";

export function HelpCenterContactSection() {
  const privateCareTarget = "/account#private-care";
  const privateCareLoginHref = `/login?returnUrl=${encodeURIComponent(privateCareTarget)}&notice=private-care`;
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getMe({ cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      setIsAuthenticated(Boolean(user));
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={styles.section} aria-label="Contato e atendimento">
      <div className={styles.container}>
        <div className={styles.grid}>
          <article className={styles.card} aria-label="Fale Conosco">
            <h3 className={styles.cardTitle}>Fale Conosco</h3>
            <p className={styles.cardText}>Nosso atendimento por telefone está pronto para ajudar em dúvidas sobre compras e suporte.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.actions}>
              <a className={styles.button} href={isAuthenticated ? privateCareTarget : privateCareLoginHref}>
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
                  <path d="M8 3v4"></path>
                  <path d="M16 3v4"></path>
                  <path d="M3 10h18"></path>
                </svg>
                <span>Agende um atendimento especializado</span>
              </a>
              <a className={styles.button} href="tel:+5511918596632">
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 2h4l2 5-2 2a15 15 0 0 0 5 5l2-2 5 2v4a2 2 0 0 1-2 2C10.5 20 4 13.5 4 4a2 2 0 0 1 2-2z"></path>
                </svg>
                <span>(11) 91859-6632</span>
              </a>
            </div>
          </article>

          <article className={styles.card} aria-label="Envie uma Mensagem">
            <h3 className={styles.cardTitle}>Envie uma Mensagem</h3>
            <p className={styles.cardText}>Fale com nossa equipe via WhatsApp para suporte rápido durante o horário de atendimento.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.actions}>
              <a className={styles.button} href="https://www.instagram.com/tsebiofficial/" target="_blank" rel="noreferrer">
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/>
                  <circle cx="12" cy="12" r="5"/>
                  <circle cx="17.5" cy="6.5" r="1.5" style={{fill:"currentColor",stroke:"none"}}/>
                </svg>
                <span>Direct Instagram</span>
              </a>
              <a className={styles.button} href="https://wa.me/5511918596632" target="_blank" rel="noreferrer">
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 21l1.65-3.8A9 9 0 1 1 9.5 20.4z" strokeLinejoin="round"/>
                  <path d="M9 10c.5 3 3 5.5 5.5 5.5l.4-.2a1 1 0 0 0 .6-.6l.2-1.2a.5.5 0 0 0-.4-.5l-1.2-.4a.5.5 0 0 0-.6.2l-.4.4a3 3 0 0 1-2.1-2.1l.4-.4a.5.5 0 0 0 .2-.6l-.4-1.2a.5.5 0 0 0-.5-.4L9.8 9a1 1 0 0 0-.6.6Z" strokeLinejoin="round"/>
                </svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </article>

          <article className={styles.card} aria-label="E-mail e WhatsApp">
            <h3 className={styles.cardTitle}>Envie um E-mail ou fale conosco</h3>
            <p className={styles.cardText}>
              Para solicitacoes detalhadas, envie um e-mail. Se preferir, fale com nossa equipe pelo WhatsApp.
            </p>
            <div className={styles.actions}>
              <a className={`${styles.button} ${styles.chatButton}`} href="https://wa.me/5511918596632" target="_blank" rel="noreferrer">
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 21l1.65-3.8A9 9 0 1 1 9.5 20.4z" strokeLinejoin="round"/>
                  <path d="M9 10c.5 3 3 5.5 5.5 5.5l.4-.2a1 1 0 0 0 .6-.6l.2-1.2a.5.5 0 0 0-.4-.5l-1.2-.4a.5.5 0 0 0-.6.2l-.4.4a3 3 0 0 1-2.1-2.1l.4-.4a.5.5 0 0 0 .2-.6l-.4-1.2a.5.5 0 0 0-.5-.4L9.8 9a1 1 0 0 0-.6.6Z" strokeLinejoin="round"/>
                </svg>
                <span>Fale conosco</span>
                <span className={styles.chatPulse} aria-hidden="true"></span>
              </a>
              <a className={styles.button} href="mailto:contato@tsebi.com.br">
                <svg className={styles.buttonIcon} viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                  <path d="m4 7 8 6 8-6"></path>
                </svg>
                <span>Enviar um e-mail</span>
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
