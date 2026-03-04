(function initTsebiCookieSettings() {
  const KEY = "tsebi-cookie-preferences-v1";
  const GA_ID = "G-4GHX4VL6DZ";
  const LANG_KEY = "tsebi-site-language";

  function getLang() {
    const saved = localStorage.getItem(LANG_KEY) || "pt";
    return saved === "en" ? "en" : "pt";
  }

  function getCopy() {
    if (getLang() === "en") {
      return {
        title: "Cookie settings",
        close: "Close",
        essentialTitle: "Essential cookies (always active)",
        essentialBody: "Technical cookies for site operation and security. They cannot be disabled.",
        functionalTitle: "Functional cookies",
        functionalBody: "Customize navigation features and on-site experience.",
        analyticsTitle: "Analytics cookies",
        analyticsBody: "Audience and performance measurement (Google Analytics, PostHog).",
        marketingTitle: "Marketing cookies",
        marketingBody: "Support for promotional content personalization and advertising.",
        save: "Save preferences",
        reject: "Reject all",
        accept: "Accept all"
      };
    }

    return {
      title: "Configurações de cookies",
      close: "Fechar",
      essentialTitle: "Cookies essenciais (sempre ativos)",
      essentialBody: "Cookies técnicos para funcionamento do site e segurança. Não podem ser desativados.",
      functionalTitle: "Cookies preferenciais",
      functionalBody: "Personalizam recursos de navegação e experiência no site.",
      analyticsTitle: "Cookies estatísticos",
      analyticsBody: "Medição de audiência e desempenho (Google Analytics, PostHog).",
      marketingTitle: "Cookies de marketing",
      marketingBody: "Suporte a personalização de conteúdo promocional e publicidade.",
      save: "Salvar preferências",
      reject: "Recusar tudo",
      accept: "Aceitar tudo"
    };
  }

  function readPrefs() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return {
        essential: true,
        functional: Boolean(parsed.functional),
        analytics: Boolean(parsed.analytics),
        marketing: Boolean(parsed.marketing)
      };
    } catch {
      return null;
    }
  }

  function writePrefs(prefs) {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          essential: true,
          functional: Boolean(prefs.functional),
          analytics: Boolean(prefs.analytics),
          marketing: Boolean(prefs.marketing),
          updatedAt: new Date().toISOString()
        })
      );
    } catch {}
  }

  function applyGaConsent(prefs) {
    if (typeof window.gtag !== "function") return;
    const granted = "granted";
    const denied = "denied";
    window.gtag("consent", "update", {
      analytics_storage: prefs.analytics ? granted : denied,
      ad_storage: prefs.marketing ? granted : denied,
      ad_user_data: prefs.marketing ? granted : denied,
      ad_personalization: prefs.marketing ? granted : denied,
      functionality_storage: prefs.functional ? granted : denied,
      security_storage: granted
    });

    // Extra hard-stop for GA cookies when analytics consent is denied.
    window[`ga-disable-${GA_ID}`] = !prefs.analytics;
  }

  function applyPosthogConsent(prefs) {
    if (typeof window.tsebiPosthogUpdateConsent !== "function") return;
    window.tsebiPosthogUpdateConsent(prefs);
  }


  function getDefaultPrefs() {
    return {
      essential: true,
      functional: false,
      analytics: false,
      marketing: false
    };
  }

  function ensureModal() {
    let modal = document.getElementById("cookieSettingsModal");
    if (modal) return modal;
    const copy = getCopy();

    modal = document.createElement("div");
    modal.id = "cookieSettingsModal";
    modal.className = "cookie-settings-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="cookie-settings-backdrop" data-cookie-close></div>
      <aside class="cookie-settings-panel" role="dialog" aria-modal="true" aria-labelledby="cookieSettingsTitle">
        <div class="cookie-settings-head">
          <h2 id="cookieSettingsTitle">${copy.title}</h2>
          <button type="button" class="cookie-settings-close" aria-label="${copy.close}" data-cookie-close>&times;</button>
        </div>

        <section class="cookie-settings-group">
          <h3>${copy.essentialTitle}</h3>
          <p>${copy.essentialBody}</p>
        </section>

        <section class="cookie-settings-group cookie-settings-toggle-row">
          <div>
            <h3>${copy.functionalTitle}</h3>
            <p>${copy.functionalBody}</p>
          </div>
          <label class="cookie-switch">
            <input type="checkbox" id="cookiePrefFunctional" />
            <span></span>
          </label>
        </section>

        <section class="cookie-settings-group cookie-settings-toggle-row">
          <div>
            <h3>${copy.analyticsTitle}</h3>
            <p>${copy.analyticsBody}</p>
          </div>
          <label class="cookie-switch">
            <input type="checkbox" id="cookiePrefAnalytics" />
            <span></span>
          </label>
        </section>

        <section class="cookie-settings-group cookie-settings-toggle-row">
          <div>
            <h3>${copy.marketingTitle}</h3>
            <p>${copy.marketingBody}</p>
          </div>
          <label class="cookie-switch">
            <input type="checkbox" id="cookiePrefMarketing" />
            <span></span>
          </label>
        </section>

        <footer class="cookie-settings-actions">
          <button type="button" id="cookieSaveBtn">${copy.save}</button>
          <button type="button" id="cookieRejectBtn">${copy.reject}</button>
          <button type="button" id="cookieAcceptBtn">${copy.accept}</button>
        </footer>
      </aside>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  function openModal() {
    const modal = ensureModal();
    const prefs = readPrefs() || getDefaultPrefs();
    const functional = modal.querySelector("#cookiePrefFunctional");
    const analytics = modal.querySelector("#cookiePrefAnalytics");
    const marketing = modal.querySelector("#cookiePrefMarketing");
    if (functional) functional.checked = prefs.functional;
    if (analytics) analytics.checked = prefs.analytics;
    if (marketing) marketing.checked = prefs.marketing;

    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  function closeModal() {
    const modal = document.getElementById("cookieSettingsModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  function saveFromModal(mode) {
    const modal = document.getElementById("cookieSettingsModal");
    if (!modal) return;

    const functional = modal.querySelector("#cookiePrefFunctional");
    const analytics = modal.querySelector("#cookiePrefAnalytics");
    const marketing = modal.querySelector("#cookiePrefMarketing");

    let prefs = getDefaultPrefs();

    if (mode === "accept-all") {
      prefs = { essential: true, functional: true, analytics: true, marketing: true };
    } else if (mode === "reject-all") {
      prefs = getDefaultPrefs();
    } else {
      prefs = {
        essential: true,
        functional: Boolean(functional?.checked),
        analytics: Boolean(analytics?.checked),
        marketing: Boolean(marketing?.checked)
      };
    }

    writePrefs(prefs);
    applyGaConsent(prefs);
    applyPosthogConsent(prefs);
    closeModal();
  }

  function bindCookieSettingsLinks() {
    const links = Array.from(document.querySelectorAll("a"));
    links.forEach((link) => {
      const text = (link.textContent || "").trim().toLowerCase();
      const looksLikeCookieSettings =
        (text.includes("cookie") && text.includes("config")) ||
        text.includes("configurações de cookies") ||
        text.includes("configuracoes de cookies") ||
        text.includes("cookie settings");
      if (!looksLikeCookieSettings) return;
      if (link.dataset.cookieBound === "true") return;
      link.dataset.cookieBound = "true";
      link.href = "#";
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openModal();
      });
    });
  }

  function bindModalEvents() {
    const modal = ensureModal();
    if (!modal || modal.dataset.cookieEventsBound === "true") return;
    modal.dataset.cookieEventsBound = "true";

    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.matches("[data-cookie-close]")) closeModal();
    });

    const saveBtn = modal.querySelector("#cookieSaveBtn");
    const rejectBtn = modal.querySelector("#cookieRejectBtn");
    const acceptBtn = modal.querySelector("#cookieAcceptBtn");

    saveBtn?.addEventListener("click", () => saveFromModal("save"));
    rejectBtn?.addEventListener("click", () => saveFromModal("reject-all"));
    acceptBtn?.addEventListener("click", () => saveFromModal("accept-all"));

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
    });
  }

  // Apply previously saved preference immediately on page load.
  const initialPrefs = readPrefs() || getDefaultPrefs();
  applyGaConsent(initialPrefs);
  applyPosthogConsent(initialPrefs);
  bindCookieSettingsLinks();
  bindModalEvents();
})();

