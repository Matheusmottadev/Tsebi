(function initPremiumLogin() {
  const form = document.getElementById("loginFormPremium");
  const emailInput = document.getElementById("loginEmailPremium");
  const passwordInput = document.getElementById("loginPasswordPremium");
  const rememberMeInput = document.getElementById("rememberMePremium");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const googleBtn = document.querySelector(".t-login-google");
  const feedback = document.getElementById("loginFeedback");
  const emailError = document.getElementById("loginEmailError");
  const passwordError = document.getElementById("loginPasswordError");

  const REMEMBER_EMAIL_KEY = "tsebi-login-remember-email";
  const GOOGLE_STATE_KEY = "tsebi-google-oauth-state";
  const GOOGLE_NONCE_KEY = "tsebi-google-oauth-nonce";

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("returnUrl") || "").trim();
    if (!raw) return "conta.html";
    if (raw === "/") return "conta.html";
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      const normalized = raw.slice(1);
      if (!normalized || normalized.toLowerCase() === "login.html") return "conta.html";
      return normalized;
    }
    if (!raw.includes("://")) return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin !== window.location.origin) return "conta.html";
      const path = parsed.pathname.replace(/^\//, "");
      if (!path || path.toLowerCase() === "login.html") return "conta.html";
      return `${path}${parsed.search}${parsed.hash}`;
    } catch {
      return "conta.html";
    }
  }

  function showFeedback(message) {
    if (!feedback) return;
    const safe = String(message || "").trim();
    feedback.textContent = safe;
    feedback.hidden = !safe;
  }

  function clearErrors() {
    if (emailError) emailError.textContent = "";
    if (passwordError) passwordError.textContent = "";
    showFeedback("");
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  }

  function setSubmitting(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = Boolean(loading);
    submitBtn.classList.toggle("is-loading", Boolean(loading));
  }

  function setGoogleSubmitting(loading) {
    if (!googleBtn) return;
    googleBtn.disabled = Boolean(loading);
    googleBtn.textContent = loading ? "Conectando..." : "Continuar com Google";
  }

  function randomToken(size = 20) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let value = "";
    for (let i = 0; i < size; i += 1) {
      value += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return value;
  }

  async function fetchGoogleConfig() {
    const response = await fetch("/api/auth/google/config", {
      method: "GET",
      credentials: "same-origin"
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || !data.enabled || !data.clientId) return null;
    return data;
  }

  async function beginGoogleLogin() {
    clearErrors();
    setGoogleSubmitting(true);
    const config = await fetchGoogleConfig();
    setGoogleSubmitting(false);

    if (!config) {
      showFeedback("Login com Google indisponível no momento.");
      return;
    }

    const state = randomToken(24);
    const nonce = randomToken(24);
    try {
      sessionStorage.setItem(GOOGLE_STATE_KEY, state);
      sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
    } catch {}

    const returnUrl = getReturnUrl();
    const callbackUrl = new URL(window.location.origin + window.location.pathname);
    callbackUrl.searchParams.set("google", "1");
    callbackUrl.searchParams.set("returnUrl", returnUrl);

    const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    oauthUrl.searchParams.set("client_id", config.clientId);
    oauthUrl.searchParams.set("redirect_uri", callbackUrl.toString());
    oauthUrl.searchParams.set("response_type", "id_token");
    oauthUrl.searchParams.set("scope", "openid email profile");
    oauthUrl.searchParams.set("prompt", "select_account");
    oauthUrl.searchParams.set("state", state);
    oauthUrl.searchParams.set("nonce", nonce);

    window.location.href = oauthUrl.toString();
  }

  function parseHashParams() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return new URLSearchParams();
    return new URLSearchParams(hash);
  }

  async function completeGoogleLoginFromHash() {
    const hashParams = parseHashParams();
    const idToken = String(hashParams.get("id_token") || "").trim();
    if (!idToken) return false;

    const stateFromHash = String(hashParams.get("state") || "").trim();
    let expectedState = "";
    let expectedNonce = "";
    try {
      expectedState = String(sessionStorage.getItem(GOOGLE_STATE_KEY) || "");
      expectedNonce = String(sessionStorage.getItem(GOOGLE_NONCE_KEY) || "");
      sessionStorage.removeItem(GOOGLE_STATE_KEY);
      sessionStorage.removeItem(GOOGLE_NONCE_KEY);
    } catch {}

    if (!stateFromHash || !expectedState || stateFromHash !== expectedState) {
      showFeedback("Falha ao validar login Google.");
      history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
      return true;
    }

    setGoogleSubmitting(true);
    const response = await fetch("/api/auth/google", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        nonce: expectedNonce
      })
    });
    setGoogleSubmitting(false);

    history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      showFeedback("Não foi possível concluir o login com Google.");
      return true;
    }

    window.location.href = getReturnUrl();
    return true;
  }

  function hydrateRememberedEmail() {
    try {
      const saved = String(localStorage.getItem(REMEMBER_EMAIL_KEY) || "").trim();
      if (!saved || !emailInput) return;
      emailInput.value = saved;
      if (rememberMeInput) rememberMeInput.checked = true;
    } catch {}
  }

  async function submitWithStore(email, password) {
    const store = window.TsebiUserStore;
    if (!store || typeof store.login !== "function") {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      console.log("Integração de login pendente", { email, passwordLength: password.length });
      return { ok: false, error: "Integração de login pendente." };
    }
    return store.login({ email, password });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearErrors();

    const email = String(emailInput?.value || "").trim().toLowerCase();
    const password = String(passwordInput?.value || "");

    let hasError = false;
    if (!isValidEmail(email)) {
      if (emailError) emailError.textContent = "Informe um e-mail válido.";
      hasError = true;
    }
    if (!password) {
      if (passwordError) passwordError.textContent = "Informe sua senha.";
      hasError = true;
    }
    if (hasError) return;

    setSubmitting(true);
    const result = await submitWithStore(email, password);
    setSubmitting(false);

    if (!result?.ok || !result?.user) {
      showFeedback(result?.error || "Email ou senha inválidos.");
      return;
    }

    if (rememberMeInput?.checked) {
      try {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      } catch {}
    } else {
      try {
        localStorage.removeItem(REMEMBER_EMAIL_KEY);
      } catch {}
    }

    window.location.href = getReturnUrl();
  }

  function handleTogglePassword() {
    if (!passwordInput || !togglePasswordBtn) return;
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePasswordBtn.textContent = show ? "Ocultar" : "Mostrar";
    togglePasswordBtn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  }

  togglePasswordBtn?.addEventListener("click", handleTogglePassword);
  googleBtn?.addEventListener("click", beginGoogleLogin);
  form?.addEventListener("submit", handleSubmit);
  hydrateRememberedEmail();
  completeGoogleLoginFromHash();
})();
