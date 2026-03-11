"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";

export function NewsletterPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState<{ state: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsOpen(true);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      document.body.classList.remove("newsletter-popup-open");
      return;
    }

    document.body.classList.add("newsletter-popup-open");
    return () => {
      document.body.classList.remove("newsletter-popup-open");
    };
  }, [isOpen]);

  function closePopup(): void {
    setIsOpen(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalized = String(email || "").trim();
    if (!normalized) {
      setFeedback({ state: "error", message: "Informe um e-mail válido." });
      return;
    }

    setFeedback({ state: "success", message: "Cadastro recebido. Obrigada por assinar." });
    setEmail("");
  }

  return (
    <div className={`newsletter-popup ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
      <div className="newsletter-popup-backdrop" onClick={closePopup} />
      <aside className="newsletter-popup-panel" role="dialog" aria-modal="true" aria-labelledby="newsletterPopupTitle">
        <button
          className="newsletter-popup-close"
          type="button"
          onClick={closePopup}
          aria-label="Fechar popup de newsletter"
        >
          &times;
        </button>
        <p className="newsletter-popup-kicker">NOVIDADES TSEBI</p>
        <h2 className="newsletter-popup-title" id="newsletterPopupTitle">
          Inscreva-se na newsletter
        </h2>
        <p className="newsletter-popup-text">Receba novidades e seja a primeira a conhecer cada nova Coleção.</p>

        <form className="newsletter-popup-form" onSubmit={handleSubmit}>
          <div className="newsletter-popup-image-wrap">
            <Image
              className="newsletter-popup-image"
              src="/images/popup.jpg"
              alt="Novidades da Coleção Tsebi"
              width={640}
              height={860}
            />
          </div>
          <label htmlFor="newsletter-popup-email">E-mail</label>
          <input
            id="newsletter-popup-email"
            name="email"
            type="email"
            placeholder="seuemail@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button type="submit">Quero receber novidades</button>
          {feedback ? (
            <p className="newsletter-feedback" data-state={feedback.state === "error" ? "error" : undefined}>
              {feedback.message}
            </p>
          ) : null}
        </form>
      </aside>
    </div>
  );
}

