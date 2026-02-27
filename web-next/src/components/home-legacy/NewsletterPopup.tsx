"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const NEWSLETTER_POPUP_SESSION_KEY = "tsebi-newsletter-popup-shown";

export function NewsletterPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [feedback, setFeedback] = useState("");

  const feedbackState = useMemo(() => {
    if (!feedback) return "";
    return feedback.toLowerCase().includes("erro") ? "error" : "success";
  }, [feedback]);

  useEffect(() => {
    try {
      const alreadyShown = window.sessionStorage.getItem(NEWSLETTER_POPUP_SESSION_KEY) === "1";
      if (alreadyShown) return;
    } catch {
      // Ignore storage availability errors and fallback to in-memory behavior.
    }

    const timeoutId = window.setTimeout(() => {
      setIsOpen(true);
      try {
        window.sessionStorage.setItem(NEWSLETTER_POPUP_SESSION_KEY, "1");
      } catch {
        // Ignore storage availability errors.
      }
    }, 1200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("newsletter-popup-open", isOpen);
    return () => {
      document.body.classList.remove("newsletter-popup-open");
    };
  }, [isOpen]);

  function closePopup() {
    setIsOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!String(email || "").trim()) {
      setFeedback("Erro: informe um e-mail válido.");
      return;
    }
    setFeedback("Cadastro recebido com sucesso.");
    setEmail("");
    setPhone("");
  }

  return (
    <div className={`newsletter-popup ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
      <div className="newsletter-popup-backdrop" onClick={closePopup} />
      <aside className="newsletter-popup-panel" role="dialog" aria-modal="true" aria-labelledby="newsletterPopupTitle">
        <button className="newsletter-popup-close" type="button" onClick={closePopup} aria-label="Fechar popup">
          &times;
        </button>

        <p className="newsletter-popup-kicker">NOVIDADES TSEBI</p>
        <h2 className="newsletter-popup-title" id="newsletterPopupTitle">
          Inscreva-se na newsletter
        </h2>
        <p className="newsletter-popup-text">
          Receba novidades e seja uma das primeiras pessoas a conhecer cada nova Coleção.
        </p>

        <form className="newsletter-popup-form" onSubmit={handleSubmit}>
          <div className="newsletter-popup-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="newsletter-popup-image" src="/images/popup.jpg" alt="Destaque da nova Coleção" />
          </div>

          <label htmlFor="newsletter-popup-email">E-mail</label>
          <input
            id="newsletter-popup-email"
            name="popup-email"
            type="email"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label htmlFor="newsletter-popup-phone">Telefone</label>
          <input
            id="newsletter-popup-phone"
            name="popup-phone"
            type="tel"
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
          />

          <button type="submit">Quero receber novidades</button>
          {feedback ? (
            <p className="newsletter-feedback" data-state={feedbackState === "error" ? "error" : undefined}>
              {feedback}
            </p>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

