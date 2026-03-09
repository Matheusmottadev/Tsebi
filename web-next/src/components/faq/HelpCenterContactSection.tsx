"use client";

import { useEffect, useState } from "react";
import styles from "./HelpCenterContactSection.module.css";

function isChatWithinBusinessHours(date: Date): boolean {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const currentMinutes = hour * 60 + minute;
  const startMinutes = 9 * 60;
  const endMinutes = 18 * 60;
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

export function HelpCenterContactSection() {
  const [chatOnline, setChatOnline] = useState<boolean>(() => isChatWithinBusinessHours(new Date()));

  useEffect(() => {
    const syncChatStatus = () => {
      setChatOnline(isChatWithinBusinessHours(new Date()));
    };

    syncChatStatus();
    const timer = window.setInterval(syncChatStatus, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className={styles.section} aria-label="Contato e atendimento">
      <header className={styles.intro}>
        <h2 className={styles.introTitle}>Precisa de Ajuda?</h2>
        <p className={styles.introText}>
          Nossa equipe estÃ¡ disponÃ­vel para orientar vocÃª sobre pedidos, entregas, trocas e cuidados com as peÃ§as.
          Escolha abaixo o canal mais conveniente para falar com a Tsebi.
        </p>
      </header>

      <div className={styles.contentBox} id="precisa-de-ajuda">
        <div className={styles.grid}>
          <article className={styles.column} id="fale-conosco" aria-label="Fale Conosco">
            <h3 className={styles.columnTitle}>Fale Conosco</h3>
            <p className={styles.columnText}>Nosso atendimento por telefone estÃ¡ pronto para ajudar em dÃºvidas sobre compras e suporte.</p>
            <ul className={styles.hours}>
              <li>Segunda a SÃ¡bado: 09h Ã s 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.buttonRow}>
              <a className={styles.actionButton} href="/faq">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2"></rect>
                  <path d="M8 3v4"></path>
                  <path d="M16 3v4"></path>
                  <path d="M3 10h18"></path>
                </svg>
                <span>Agende um atendimento especializado</span>
              </a>
              <a className={styles.actionButton} href="tel:+5511918596632">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 2h4l2 5-2 2a15 15 0 0 0 5 5l2-2 5 2v4a2 2 0 0 1-2 2C10.5 20 4 13.5 4 4a2 2 0 0 1 2-2z"></path>
                </svg>
                <span>(11) 91859-6632</span>
              </a>
            </div>
          </article>

          <article className={styles.column} aria-label="Envie uma Mensagem">
            <h3 className={styles.columnTitle}>Envie uma Mensagem</h3>
            <p className={styles.columnText}>Fale com nossa equipe via WhatsApp para suporte rÃ¡pido durante o horÃ¡rio de atendimento.</p>
            <ul className={styles.hours}>
              <li>Segunda a SÃ¡bado: 09h Ã s 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.buttonRow}>
              <a className={styles.actionButton} href="https://www.instagram.com/tsebi/" target="_blank" rel="noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3.5" y="3.5" width="17" height="17" rx="4.5"></rect>
                  <circle cx="12" cy="12" r="4"></circle>
                  <circle cx="17.5" cy="6.5" r="1"></circle>
                </svg>
                <span>Direct Instagram</span>
              </a>
              <a className={styles.actionButton} href="https://wa.me/5511918596632" target="_blank" rel="noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21a8.7 8.7 0 0 1-4.3-1.1L4 21l1.2-3.5A8.8 8.8 0 1 1 12 21z"></path>
                  <path d="M9.2 8.8c.2-.4.4-.4.6-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4 0 .5l-.4.7c-.1.2-.1.4 0 .6.3.5.8 1.1 1.4 1.6.6.5 1.2.9 1.8 1.1.2.1.4.1.6-.1l.7-.6c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.3.4.5v.5c0 .2 0 .4-.3.6-.4.3-.9.5-1.5.5-.9 0-2-.3-3.2-1-1-.6-1.9-1.4-2.6-2.3-.9-1.1-1.4-2.2-1.4-3.2 0-.6.2-1.2.4-1.5z"></path>
                </svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </article>

          <article className={styles.column} aria-label="Envie um E-mail ou entre no chat ao vivo">
            <h3 className={styles.columnTitle}>Envie um E-mail ou entre no chat ao vivo</h3>
            <p className={styles.columnText}>
              Para solicitaÃ§Ãµes detalhadas, envie um e-mail. Nossa equipe responde em atÃ© 24 horas Ãºteis.
              <br />
              Entre no chat ao vivo para ser atendido por um de nossos consultores.
            </p>
            <div className={styles.buttonRow}>
              {chatOnline ? (
                <a className={`${styles.actionButton} ${styles.chatButton}`} href="/faq">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3v-3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"></path>
                  </svg>
                  <span>Chat ao vivo</span>
                  <span className={styles.chatOnlineDot} aria-hidden="true"></span>
                </a>
              ) : (
                <p className={styles.chatOfflineText}>
                  O chat estÃ¡ fora do horÃ¡rio de funcionamento. Por favor, volte mais tarde ou entre em contato por
                  outros meios de comunicaÃ§Ã£o.
                </p>
              )}
              <a className={styles.actionButton} href="mailto:contato@tsebi.com.br">
                <svg viewBox="0 0 24 24" aria-hidden="true">
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

