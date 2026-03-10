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

  return currentMinutes >= 9 * 60 && currentMinutes < 18 * 60;
}

export function HelpCenterContactSection() {
  const [chatOnline, setChatOnline] = useState<boolean>(() => isChatWithinBusinessHours(new Date()));

  useEffect(() => {
    const syncChatStatus = () => setChatOnline(isChatWithinBusinessHours(new Date()));
    syncChatStatus();
    const timer = window.setInterval(syncChatStatus, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={styles.section} aria-label="Contato e atendimento">
      <div className={styles.container}>
        <div className={styles.grid}>
          <article className={styles.card} aria-label="Fale Conosco">
            <h3 className={styles.cardTitle}>Fale Conosco</h3>
            <p className={styles.cardText}>Nosso atendimento por telefone esta pronto para ajudar em duvidas sobre compras e suporte.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.actions}>
              <a className={styles.button} href="/faq">
                Agende um atendimento especializado
              </a>
              <a className={styles.button} href="tel:+5511918596632">
                (11) 91859-6632
              </a>
            </div>
          </article>

          <article className={styles.card} aria-label="Envie uma Mensagem">
            <h3 className={styles.cardTitle}>Envie uma Mensagem</h3>
            <p className={styles.cardText}>Fale com nossa equipe via WhatsApp para suporte rapido durante o horario de atendimento.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.actions}>
              <a className={styles.button} href="https://www.instagram.com/tsebi/" target="_blank" rel="noreferrer">
                Direct Instagram
              </a>
              <a className={styles.button} href="https://wa.me/5511918596632" target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            </div>
          </article>

          <article className={styles.card} aria-label="E-mail e chat">
            <h3 className={styles.cardTitle}>Envie um E-mail ou entre no chat ao vivo</h3>
            <p className={styles.cardText}>
              Para solicitacoes detalhadas, envie um e-mail. Nossa equipe responde em ate 24 horas uteis.
            </p>
            <div className={styles.actions}>
              {chatOnline ? (
                <a className={styles.button} href="/faq">
                  Chat ao vivo
                </a>
              ) : (
                <p className={styles.offlineText}>Chat fora do horario de funcionamento.</p>
              )}
              <a className={styles.button} href="mailto:contato@tsebi.com.br">
                Enviar um e-mail
              </a>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
