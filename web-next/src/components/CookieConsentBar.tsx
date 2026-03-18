"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./CookieConsentBar.module.css";

export const CONSENT_KEY = "tsebi_cookie_consent_v1";
const LEGACY_CONSENT_KEY = "tsebi-cookie-preferences-v1";
export const CONSENT_EVENT = "tsebi:cookie-consent-updated";
export const OPEN_COOKIE_SETTINGS_EVENT = "tsebi:open-cookie-settings";
const CONSENT_VERSION = "2026-03-02";

type ConsentInput = {
  functional: boolean;
  analytics: boolean;
  ads: boolean;
};

export type ConsentState = {
  version: string;
  updatedAt: string;
  necessary: true;
  functional: boolean;
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
  functional: false,
  analytics: false,
  ads: false
};

export function applyGoogleConsent(state: ConsentState) {
  const payload = {
    analytics_storage: state.analytics ? "granted" : "denied",
    ad_storage: state.ads ? "granted" : "denied",
    ad_user_data: state.ads ? "granted" : "denied",
    ad_personalization: state.ads ? "granted" : "denied",
    functionality_storage: state.functional ? "granted" : "denied",
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

function normalizeConsent(parsed: Partial<ConsentState> & Record<string, unknown>): ConsentState {
  const hasLegacyMarketing = typeof parsed.marketing === "boolean";
  const hasLegacyFunctional = typeof parsed.functional === "boolean";

  return {
    version: String(parsed.version || CONSENT_VERSION),
    updatedAt: String(parsed.updatedAt || ""),
    necessary: true,
    functional: hasLegacyFunctional ? Boolean(parsed.functional) : false,
    analytics: Boolean(parsed.analytics),
    ads: hasLegacyMarketing ? Boolean(parsed.marketing) : Boolean(parsed.ads)
  };
}

export function readStoredConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (raw) {
      return normalizeConsent(JSON.parse(raw) as Partial<ConsentState> & Record<string, unknown>);
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_CONSENT_KEY);
    if (!legacyRaw) return null;

    return normalizeConsent(JSON.parse(legacyRaw) as Partial<ConsentState> & Record<string, unknown>);
  } catch {
    return null;
  }
}

function writeConsent(state: ConsentState) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
    window.localStorage.setItem(
      LEGACY_CONSENT_KEY,
      JSON.stringify({
        essential: true,
        functional: state.functional,
        analytics: state.analytics,
        marketing: state.ads,
        updatedAt: state.updatedAt
      })
    );
  } catch {
    // no-op
  }
}

function toState(input: ConsentInput): ConsentState {
  return {
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
    necessary: true,
    functional: Boolean(input.functional),
    analytics: Boolean(input.analytics),
    ads: Boolean(input.ads)
  };
}

export function CookieConsentBar() {
  const pathname = usePathname();
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || "/";
  const [visible, setVisible] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [functionalEnabled, setFunctionalEnabled] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [adsEnabled, setAdsEnabled] = useState(false);
  const isPasswordRecoveryRoute = normalizedPath.startsWith("/recuperar-senha");

  useEffect(() => {
    const savedConsent = readStoredConsent();
    if (!savedConsent) {
      applyGoogleConsent(DEFAULT_DENIED);
      setVisible(true);
      return;
    }

    setFunctionalEnabled(savedConsent.functional);
    setAnalyticsEnabled(savedConsent.analytics);
    setAdsEnabled(savedConsent.ads);
    applyGoogleConsent(savedConsent);
  }, []);

  useEffect(() => {
    const onOpenSettings = () => {
      const saved = readStoredConsent() || DEFAULT_DENIED;
      setFunctionalEnabled(saved.functional);
      setAnalyticsEnabled(saved.analytics);
      setAdsEnabled(saved.ads);
      setIsModalOpen(true);
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest("[data-cookie-settings-trigger='true']");
      if (!trigger) return;
      event.preventDefault();
      // Se o cookies.js legado já abriu o modal dele, não abrir o React duplicado
      const legacyModal = document.getElementById("cookieSettingsModal");
      if (legacyModal && legacyModal.classList.contains("is-open")) return;
      onOpenSettings();
    };

    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpenSettings);
    document.addEventListener("click", onDocumentClick);

    return () => {
      window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, onOpenSettings);
      document.removeEventListener("click", onDocumentClick);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("no-scroll", isModalOpen);
    document.documentElement.classList.toggle("no-scroll", isModalOpen);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModalOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("no-scroll");
      document.documentElement.classList.remove("no-scroll");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isModalOpen]);

  const saveChoice = (input: ConsentInput) => {
    const payload = toState(input);
    writeConsent(payload);
    applyGoogleConsent(payload);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: payload }));
    setVisible(false);
    setIsModalOpen(false);
  };

  if (isPasswordRecoveryRoute) {
    return null;
  }

  return (
    <>
      {visible ? (
        <aside className={styles.bar} role="dialog" aria-live="polite" aria-label="Consentimento de cookies">
          <div className={styles.content}>
            <p className={styles.title}>Preferencias de cookies</p>
            <p className={styles.text}>
              Usamos cookies essenciais para o site funcionar e, com sua permissão, cookies de análise e publicidade.
            </p>
            <a className={styles.policyLink} href="/legacy/pages/cookie-policy.html">
              Ver política de cookies
            </a>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => saveChoice({ functional: false, analytics: false, ads: false })}>
              Somente essenciais
            </button>
            <button type="button" className={styles.secondary} onClick={() => setIsModalOpen(true)}>
              Configurar
            </button>
            <button type="button" className={styles.primary} onClick={() => saveChoice({ functional: true, analytics: true, ads: true })}>
              Aceitar todos
            </button>
          </div>
          <p className={styles.footnote}>Você pode alterar suas preferencias a qualquer momento.</p>
        </aside>
      ) : null}

      <div className={`cookie-settings-modal${isModalOpen ? " is-open" : ""}`} aria-hidden={isModalOpen ? "false" : "true"}>
        <div className="cookie-settings-backdrop" onClick={() => setIsModalOpen(false)} />
        <aside className="cookie-settings-panel" role="dialog" aria-modal="true" aria-labelledby="cookieSettingsTitle">
          <div className="cookie-settings-head">
            <h2 id="cookieSettingsTitle">Configuracoes de cookies</h2>
            <button type="button" className="cookie-settings-close" aria-label="Fechar" onClick={() => setIsModalOpen(false)}>
              &times;
            </button>
          </div>

          <section className="cookie-settings-group">
            <h3>Cookies essenciais (sempre ativos)</h3>
            <p>Cookies tecnicos para funcionamento do site e seguranca. Nao podem ser desativados.</p>
          </section>

          <section className="cookie-settings-group cookie-settings-toggle-row">
            <div>
              <h3>Cookies preferenciais</h3>
              <p>Personalizam recursos de navegacao e experiencia no site.</p>
            </div>
            <label className="cookie-switch">
              <input type="checkbox" checked={functionalEnabled} onChange={(event) => setFunctionalEnabled(event.target.checked)} />
              <span />
            </label>
          </section>

          <section className="cookie-settings-group cookie-settings-toggle-row">
            <div>
              <h3>Cookies estatisticos</h3>
              <p>Medicao de audiencia e desempenho (Google Analytics).</p>
            </div>
            <label className="cookie-switch">
              <input type="checkbox" checked={analyticsEnabled} onChange={(event) => setAnalyticsEnabled(event.target.checked)} />
              <span />
            </label>
          </section>

          <section className="cookie-settings-group cookie-settings-toggle-row">
            <div>
              <h3>Cookies de marketing</h3>
              <p>Suporte a personalizacao de conteudo promocional e publicidade.</p>
            </div>
            <label className="cookie-switch">
              <input type="checkbox" checked={adsEnabled} onChange={(event) => setAdsEnabled(event.target.checked)} />
              <span />
            </label>
          </section>

          <footer className="cookie-settings-actions">
            <button type="button" id="cookieSaveBtn" onClick={() => saveChoice({ functional: functionalEnabled, analytics: analyticsEnabled, ads: adsEnabled })}>
              Salvar preferencias
            </button>
            <button type="button" id="cookieRejectBtn" onClick={() => saveChoice({ functional: false, analytics: false, ads: false })}>
              Recusar tudo
            </button>
            <button type="button" id="cookieAcceptBtn" onClick={() => saveChoice({ functional: true, analytics: true, ads: true })}>
              Aceitar tudo
            </button>
          </footer>
        </aside>
      </div>
    </>
  );
}
