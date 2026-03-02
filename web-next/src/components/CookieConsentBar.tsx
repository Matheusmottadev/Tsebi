"use client";

import { useEffect, useState } from "react";
import styles from "./CookieConsentBar.module.css";

const CONSENT_KEY = "tsebi_cookie_consent_v1";
const CONSENT_VERSION = "2026-03-02";

type ConsentState = {
  version: string;
  updatedAt: string;
  necessary: true;
  analytics: boolean;
  ads: boolean;
};

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

const DEFAULT_DENIED: ConsentState = {
  version: CONSENT_VERSION,
  updatedAt: "",
  necessary: true,
  analytics: false,
  ads: false
};

function applyGoogleConsent(state: ConsentState) {
  const payload = {
    analytics_storage: state.analytics ? "granted" : "denied",
    ad_storage: state.ads ? "granted" : "denied",
    ad_user_data: state.ads ? "granted" : "denied",
    ad_personalization: state.ads ? "granted" : "denied",
    functionality_storage: "granted",
    personalization_storage: state.analytics ? "granted" : "denied",
    security_storage: "granted"
  } as const;

  if (typeof window.gtag === "function") {
    window.gtag("consent", "update", payload);
  }

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: "cookie_consent_updated",
      consent: payload
    });
  }
}

export function CookieConsentBar() {
  const [visible, setVisible] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [adsEnabled, setAdsEnabled] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(CONSENT_KEY);
      if (!saved) {
        applyGoogleConsent(DEFAULT_DENIED);
        setVisible(true);
        return;
      }

      const parsed = JSON.parse(saved) as Partial<ConsentState>;
      const normalized: ConsentState = {
        version: String(parsed.version || CONSENT_VERSION),
        updatedAt: String(parsed.updatedAt || ""),
        necessary: true,
        analytics: Boolean(parsed.analytics),
        ads: Boolean(parsed.ads)
      };
      applyGoogleConsent(normalized);
    } catch {
      applyGoogleConsent(DEFAULT_DENIED);
      setVisible(true);
    }
  }, []);

  const saveChoice = (state: Omit<ConsentState, "version" | "updatedAt" | "necessary">) => {
    const payload: ConsentState = {
      version: CONSENT_VERSION,
      updatedAt: new Date().toISOString(),
      necessary: true,
      analytics: Boolean(state.analytics),
      ads: Boolean(state.ads)
    };

    try {
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
    } catch {
      // no-op
    }
    applyGoogleConsent(payload);
    setVisible(false);
    setIsCustomizing(false);
  };

  if (!visible) return null;

  return (
    <aside className={styles.bar} role="dialog" aria-live="polite" aria-label="Consentimento de cookies">
      <div className={styles.content}>
        <p className={styles.title}>Preferencias de cookies</p>
        <p className={styles.text}>
          Usamos cookies essenciais para o site funcionar e, com sua permissao, cookies de analise e publicidade.
        </p>
        <a className={styles.policyLink} href="/legacy/pages/cookie-policy.html">
          Ver politica de cookies
        </a>

        {isCustomizing ? (
          <div className={styles.customization}>
            <label className={styles.row}>
              <span>Essenciais (sempre ativos)</span>
              <span className={styles.fixed}>Ativo</span>
            </label>
            <label className={styles.row}>
              <span>Analise de uso</span>
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(event) => setAnalyticsEnabled(event.target.checked)}
              />
            </label>
            <label className={styles.row}>
              <span>Publicidade e remarketing</span>
              <input
                type="checkbox"
                checked={adsEnabled}
                onChange={(event) => setAdsEnabled(event.target.checked)}
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className={styles.actions}>
        {isCustomizing ? (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => saveChoice({ analytics: analyticsEnabled, ads: adsEnabled })}
          >
            Salvar preferencias
          </button>
        ) : (
          <>
            <button type="button" className={styles.secondary} onClick={() => saveChoice({ analytics: false, ads: false })}>
              Somente essenciais
            </button>
            <button type="button" className={styles.secondary} onClick={() => setIsCustomizing(true)}>
              Personalizar
            </button>
            <button type="button" className={styles.primary} onClick={() => saveChoice({ analytics: true, ads: true })}>
              Aceitar todos
            </button>
          </>
        )}
        {isCustomizing ? (
          <button type="button" className={styles.primary} onClick={() => saveChoice({ analytics: true, ads: true })}>
            Aceitar todos
          </button>
        ) : null}
        {isCustomizing ? (
          <button type="button" className={styles.ghost} onClick={() => setIsCustomizing(false)}>
            Voltar
          </button>
        ) : null}
      </div>
      <p className={styles.footnote}>
        Voce pode alterar suas preferencias a qualquer momento na politica de cookies.
      </p>
    </aside>
  );
}
