import Link from "next/link";
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
  return (
    <section className={styles.wrap} aria-label="Conteudo complementar de ajuda">
      <article className={styles.panel} id="cuidados-reparos-faq">
        <h2 className={styles.panelTitle}>CUIDADOS E REPAROS</h2>
        <p className={styles.panelText}>
          A Tsebi oferece suporte especializado para avaliacao de cuidados e reparos das pecas. Cada solicitacao e
          analisada individualmente pelo nosso time para orientar o melhor procedimento, prazos e disponibilidade de
          servico.
        </p>
        <Link className={styles.pillAction} href="/faq#servicos-de-cuidado">
          Servicos de Cuidado
        </Link>
      </article>

      <article className={styles.panel} id="perguntas-frequentes">
        <div className={styles.faqHeaderRow}>
          <h2 className={styles.panelTitle}>PERGUNTAS FREQUENTES</h2>
          <label className={styles.searchWrap} htmlFor="faqSearchInput">
            <span className={styles.searchIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7"></circle>
                <path d="M20 20l-4.2-4.2"></path>
              </svg>
            </span>
            <input
              id="faqSearchInput"
              className={styles.searchInput}
              type="search"
              placeholder="Como podemos ajudar?"
              aria-label="Pesquisar perguntas frequentes"
            />
          </label>
        </div>

        <div className={styles.faqGrid}>
          {FAQ_ITEMS.map((question) => (
            <Link key={question} href="/faq" className={styles.faqLink}>
              {question}
            </Link>
          ))}
        </div>

        <Link className={styles.pillAction} href="/faq">
          Ver todas as perguntas
        </Link>
      </article>
    </section>
  );
}
