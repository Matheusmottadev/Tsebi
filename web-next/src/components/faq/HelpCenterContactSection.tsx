import styles from "./HelpCenterContactSection.module.css";

export function HelpCenterContactSection() {
  return (
    <section className={styles.section} aria-label="Contato e atendimento">
      <header className={styles.intro} id="precisa-de-ajuda">
        <h2 className={styles.introTitle}>Precisa de Ajuda?</h2>
        <p className={styles.introText}>
          Nossa equipe esta disponivel para orientar voce sobre pedidos, entregas, trocas e cuidados com as pecas.
          Escolha abaixo o canal mais conveniente para falar com a Tsebi.
        </p>
      </header>

      <div className={styles.contentBox}>
        <div className={styles.grid}>
          <article className={styles.column} id="fale-conosco" aria-label="Fale Conosco">
            <h3 className={styles.columnTitle}>Fale Conosco</h3>
            <p className={styles.columnText}>Nosso atendimento por telefone esta pronto para ajudar em duvidas sobre compras e suporte.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.buttonRow}>
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
            <p className={styles.columnText}>Fale com nossa equipe via WhatsApp para suporte rapido durante o horario de atendimento.</p>
            <ul className={styles.hours}>
              <li>Segunda a Sabado: 09h as 20h</li>
              <li>Domingo: Fechado</li>
              <li>Feriados: Fechado</li>
            </ul>
            <div className={styles.buttonRow}>
              <a className={styles.actionButton} href="https://wa.me/5511918596632" target="_blank" rel="noreferrer">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 21a8.7 8.7 0 0 1-4.3-1.1L4 21l1.2-3.5A8.8 8.8 0 1 1 12 21z"></path>
                  <path d="M9.2 8.8c.2-.4.4-.4.6-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.2.1.4 0 .5l-.4.7c-.1.2-.1.4 0 .6.3.5.8 1.1 1.4 1.6.6.5 1.2.9 1.8 1.1.2.1.4.1.6-.1l.7-.6c.2-.2.4-.2.6-.1l1.7.8c.2.1.4.3.4.5v.5c0 .2 0 .4-.3.6-.4.3-.9.5-1.5.5-.9 0-2-.3-3.2-1-1-.6-1.9-1.4-2.6-2.3-.9-1.1-1.4-2.2-1.4-3.2 0-.6.2-1.2.4-1.5z"></path>
                </svg>
                <span>WhatsApp</span>
              </a>
            </div>
          </article>

          <article className={styles.column} aria-label="Envie um E-mail">
            <h3 className={styles.columnTitle}>Envie um E-mail</h3>
            <p className={styles.columnText}>
              Para solicitacoes detalhadas, envie um e-mail. Nossa equipe responde em ate 24 horas uteis.
            </p>
            <div className={styles.buttonRow}>
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
