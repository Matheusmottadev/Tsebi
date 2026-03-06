import Link from "next/link";

type LegacyFooterProps = {
  variant?: "dark" | "light";
  language?: "pt" | "en";
  onLanguageChange?: (language: "pt" | "en") => void;
};

export function LegacyFooter({ variant = "dark", language = "pt", onLanguageChange }: LegacyFooterProps) {
  const footerClassName = variant === "light" ? "site-footer site-footer--light" : "site-footer";
  return (
    <footer className={footerClassName}>
      <div className="footer-grid">
        <section className="footer-newsletter">
          <h3>ASSINE NOSSA NEWSLETTER</h3>
          <form className="newsletter-form" action="/" method="get">
            <label htmlFor="legacyFooterNewsletterEmail">Insira seu e-mail *</label>
            <div className="newsletter-input-row">
              <input id="legacyFooterNewsletterEmail" name="email" type="email" required />
              <button type="submit" aria-label="Assinar newsletter">
                &rarr;
              </button>
            </div>
          </form>
          <p className="newsletter-legal">
            Ao clicar em &quot;Assinar&quot;, Você confirma que leu e entendeu nossa{" "}
            <Link href="/politica-privacidade">Política de Privacidade</Link> e que deseja receber a newsletter e outras
            comunicações de marketing, conforme nela estabelecido.
          </p>
          <div className="footer-socials">
            <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 8H16V5h-2.2C11.6 5 10 6.5 10 8.8V11H8v3h2v5h3v-5h2.2l.3-3H13V9.1c0-.8.2-1.1 1.5-1.1z"></path>
              </svg>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 4l6.4 8.6L4.5 20h2.1l4.8-5.8L15.7 20H20l-6.7-9 5.5-7h-2.1l-4.4 5.4L8.2 4H4z"></path>
              </svg>
            </a>
            <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="4" width="16" height="16" rx="4" ry="4"></rect>
                <circle cx="12" cy="12" r="3.8"></circle>
                <circle cx="17.2" cy="6.8" r="1.1"></circle>
              </svg>
            </a>
            <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="6.5" width="18" height="11" rx="3"></rect>
                <path d="M10 9.5l5 2.5-5 2.5z"></path>
              </svg>
            </a>
            <a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer" aria-label="Spotify">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M8.2 10.4c2.4-.7 5.3-.5 7.6.6"></path>
                <path d="M8.8 13.1c2-.5 4.2-.3 6 .6"></path>
                <path d="M9.4 15.5c1.5-.3 3-.1 4.2.5"></path>
              </svg>
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" aria-label="Discord">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8.2 8.1A13 13 0 0 1 12 7c1.3 0 2.6.2 3.8.7"></path>
                <path d="M7 9.4c-1 1.5-1.5 3.2-1.6 4.9 1.5 1.1 3.1 1.7 4.8 1.9l.8-1.1"></path>
                <path d="M17 9.4c1 1.5 1.5 3.2 1.6 4.9-1.5 1.1-3.1 1.7-4.8 1.9l-.8-1.1"></path>
                <circle cx="10" cy="12.4" r=".9"></circle>
                <circle cx="14" cy="12.4" r=".9"></circle>
              </svg>
            </a>
            <a href="https://www.tiktok.com" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14 5.2v8.1a3.8 3.8 0 1 1-3.8-3.8"></path>
                <path d="M14 5.2c.8 1.4 2.1 2.2 3.9 2.2"></path>
              </svg>
            </a>
          </div>
        </section>

        <section className="footer-column">
          <h3>PRECISA DE AJUDA?</h3>
          <a href="tel:+5511934618004">Fale conosco pelo telefone (11) 93461-8004</a>
          <Link href="/faq">FAQ</Link>
          <Link href="/">Mapa do site</Link>
        </section>

        <section className="footer-column">
          <h3>SERVICOS EXCLUSIVOS</h3>
          <Link href="/processos">Servicos Tsebi</Link>
          <Link href="/order" data-link-key="track-order">
            Acompanhe seu pedido
          </Link>
          <Link href="/faq">Devolucoes</Link>
        </section>

        <section className="footer-column">
          <h3>EMPRESA</h3>
          <Link href="/nossa-historia">A Tsebi</Link>
          <Link href="/processos">Processos</Link>
          <Link href="/processos">Sustentabilidade</Link>
          <Link href="/loading-careers">Trabalhe conosco</Link>
        </section>

        <section className="footer-column">
          <h3>TERMOS E CONDIÇÕES LEGAIS</h3>
          <Link href="/aviso-legal">Aviso legal</Link>
          <Link href="/politica-privacidade">Política de Privacidade</Link>
          <Link href="/cookie-policy">Política de cookies</Link>
          <a href="#" data-cookie-settings-trigger="true">Configuracoes de cookies</a>
          <Link href="/aviso-legal">Termos de venda</Link>
        </section>
      </div>
      {onLanguageChange ? (
        <div className="site-language-switcher" aria-label="Language switcher">
          <button
            type="button"
            className={`lang-btn ${language === "pt" ? "is-active" : ""}`}
            onClick={() => onLanguageChange("pt")}
          >
            PT
          </button>
          <span className="lang-divider">|</span>
          <button
            type="button"
            className={`lang-btn ${language === "en" ? "is-active" : ""}`}
            onClick={() => onLanguageChange("en")}
          >
            EN
          </button>
        </div>
      ) : null}
      <p className="footer-cnpj">CNPJ: 65.164.000/0001-72</p>
    </footer>
  );
}


