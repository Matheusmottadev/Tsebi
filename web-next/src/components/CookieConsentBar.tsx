"use client";

import { useEffect, useState } from "react";
import styles from "./CookieConsentBar.module.css";

const CONSENT_KEY = "tsebi_cookie_consent_v1";

export function CookieConsentBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      if (!saved) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const saveChoice = (choice: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      // no-op
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className={styles.bar} role="dialog" aria-live="polite" aria-label="Consentimento de cookies">
      <p className={styles.text}>
        Usamos cookies para melhorar sua experiencia. Voce aceita?
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => saveChoice("rejected")}>
          Recusar
        </button>
        <button type="button" className={styles.primary} onClick={() => saveChoice("accepted")}>
          Aceitar
        </button>
      </div>
    </aside>
  );
}
