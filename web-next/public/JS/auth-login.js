(function initAuthLogin() {
  const stateEmail = document.getElementById("stateEmail");
  const stateCode = document.getElementById("stateCode");
  const statePassword = document.getElementById("statePassword");
  const authError = document.getElementById("authError");

  const emailInput = document.getElementById("emailInput");
  const showPasswordBtnPrimary = document.getElementById("showPasswordBtnPrimary");
  const sendCodeBtn = document.getElementById("sendCodeBtn");

  const emailPreview = document.getElementById("emailPreview");
  const codeInput = document.getElementById("codeInput");
  const verifyCodeBtn = document.getElementById("verifyCodeBtn");
  const resendBtn = document.getElementById("resendBtn");
  const changeEmailBtn = document.getElementById("changeEmailBtn");
  const showPasswordBtn = document.getElementById("showPasswordBtn");

  const emailInput2 = document.getElementById("emailInput2");
  const passwordInput = document.getElementById("passwordInput");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const loginPasswordBtn = document.getElementById("loginPasswordBtn");
  const backToCodeBtn = document.getElementById("backToCodeBtn");

  const googleBtn = document.getElementById("googleBtn");
  const passkeyBtn = document.getElementById("passkeyBtn");

  const GOOGLE_STATE_KEY = "tsebi-google-oauth-state";
  const GOOGLE_NONCE_KEY = "tsebi-google-oauth-nonce";
  const GOOGLE_RETURN_URL_KEY = "tsebi-google-return-url";

  let currentState = "email";
  let activeEmail = "";
  let resendTimerId = null;
  let resendRemaining = 0;
  let googleLoginAvailable = true;
  let passkeyAvailable = true;

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
    if (!raw.includes("://")) {
      if (raw.toLowerCase() === "login.html") return "conta.html";
      return raw;
    }
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

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
  }

  function showError(message) {
    if (!authError) return;
    const text = String(message || "").trim();
    authError.textContent = text;
    authError.hidden = !text;
  }

  function showDevCode(code) {
    const normalized = String(code || "").trim();
    if (!normalized) return;
    showError(`Codigo de teste: ${normalized}`);
  }

  function clearError() {
    showError("");
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent || "";
    }
    button.disabled = Boolean(loading);
    button.textContent = loading ? loadingText : button.dataset.originalText;
  }

  function setState(nextState) {
    currentState = nextState;
    stateEmail.hidden = nextState !== "email";
    stateCode.hidden = nextState !== "code";
    statePassword.hidden = nextState !== "password";

    if (nextState === "email") {
      window.setTimeout(() => emailInput?.focus(), 30);
    }

    if (nextState === "code") {
      const email = activeEmail || normalizeEmail(emailInput?.value || "");
      activeEmail = email;
      if (emailPreview) emailPreview.textContent = email;
      window.setTimeout(() => codeInput?.focus(), 30);
    }

    if (nextState === "password") {
      const email = activeEmail || normalizeEmail(emailInput?.value || "");
      activeEmail = email;
      if (emailInput2) emailInput2.value = email;
      window.setTimeout(() => passwordInput?.focus(), 30);
    }
  }

  function startResendTimer(seconds) {
    if (resendTimerId) {
      window.clearInterval(resendTimerId);
      resendTimerId = null;
    }

    resendRemaining = Number(seconds) || 0;
    if (!resendBtn) return;

    resendBtn.disabled = resendRemaining > 0;
    resendBtn.textContent = resendRemaining > 0 ? `Reenviar código (${resendRemaining}s)` : "Reenviar código";

    if (resendRemaining <= 0) return;

    resendTimerId = window.setInterval(() => {
      resendRemaining -= 1;
      if (resendRemaining <= 0) {
        window.clearInterval(resendTimerId);
        resendTimerId = null;
        resendBtn.disabled = false;
        resendBtn.textContent = "Reenviar código";
        return;
      }
      resendBtn.textContent = `Reenviar código (${resendRemaining}s)`;
    }, 1000);
  }

  function mapAuthError(code) {
    const value = String(code || "").trim();
    if (!value) return "Não foi possível concluir a operação.";
    if (value === "INVALID_INPUT") return "Preencha os campos corretamente.";
    if (value === "INVALID_CREDENTIALS") return "Email, senha ou código inválidos.";
    if (value === "INVALID_OR_EXPIRED_CODE") return "Código inválido ou expirado.";
    if (value === "EMAIL_NOT_FOUND") return "Não encontramos conta com este e-mail.";
    if (value === "EMAIL_NOT_VERIFIED") return "Verifique seu e-mail para continuar.";
    if (value === "AUTH_CODE_ISSUE_FAILED") return "Não foi possível gerar o código agora.";
    if (value === "EMAIL_DELIVERY_FAILED") return "Não foi possível enviar o código. Tente novamente.";
    if (value === "TOO_MANY_ATTEMPTS") return "Muitas tentativas. Aguarde alguns minutos.";
    if (value === "PASSKEY_NOT_FOUND") return "Nenhuma passkey cadastrada para este e-mail.";
    if (value === "PASSKEY_CHALLENGE_NOT_FOUND") return "Sessão de passkey expirada. Tente novamente.";
    if (value === "PASSKEY_NOT_CONFIGURED") return "Passkey indisponível no momento.";
    return value;
  }

  function toBase64Url(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let str = "";
    for (let i = 0; i < bytes.length; i += 1) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function fromBase64Url(value) {
    const input = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = input + "===".slice((input.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function serializeCredential(credential) {
    if (!credential) return null;
    return {
      id: credential.id,
      rawId: toBase64Url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: toBase64Url(credential.response.clientDataJSON),
        authenticatorData: toBase64Url(credential.response.authenticatorData),
        signature: toBase64Url(credential.response.signature),
        userHandle: credential.response.userHandle ? toBase64Url(credential.response.userHandle) : null
      },
      clientExtensionResults: credential.getClientExtensionResults?.() || {},
      authenticatorAttachment: credential.authenticatorAttachment || null
    };
  }

  function decodeAuthenticationOptions(options) {
    const decoded = { ...options };
    decoded.challenge = fromBase64Url(options.challenge);
    decoded.allowCredentials = (Array.isArray(options.allowCredentials) ? options.allowCredentials : []).map((item) => ({
      ...item,
      id: fromBase64Url(item.id)
    }));
    return decoded;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  async function sendCode() {
    clearError();
    const email = normalizeEmail(emailInput?.value || "");
    if (!isValidEmail(email)) {
      showError("Informe um e-mail válido.");
      return;
    }

    setButtonLoading(sendCodeBtn, true, "Enviando...");
    const result = await postJson("/api/auth/email/start", { email });
    setButtonLoading(sendCodeBtn, false, "Enviando...");

    if (!result.ok) {
      showError(mapAuthError(result.data?.error || "EMAIL_DELIVERY_FAILED"));
      return;
    }
    showDevCode(result.data?.devCode);

    activeEmail = email;
    if (emailInput2) emailInput2.value = email;
    setState("code");
    startResendTimer(30);
  }

  async function verifyCode() {
    clearError();
    const email = activeEmail || normalizeEmail(emailInput?.value || emailInput2?.value || "");
    const code = String(codeInput?.value || "").replace(/\D/g, "").slice(0, 6);

    if (!isValidEmail(email)) {
      showError("Informe um e-mail válido.");
      setState("email");
      return;
    }
    if (code.length !== 6) {
      showError("Digite o código de 6 dígitos.");
      return;
    }

    setButtonLoading(verifyCodeBtn, true, "Confirmando...");
    const result = await postJson("/api/auth/email/verify", { email, code });
    setButtonLoading(verifyCodeBtn, false, "Confirmando...");

    if (!result.ok || !result.data?.ok) {
      showError(mapAuthError(result.data?.error || "INVALID_OR_EXPIRED_CODE"));
      return;
    }

    window.location.href = getReturnUrl();
  }

  async function resendCode() {
    if (resendRemaining > 0) return;
    clearError();
    const email = activeEmail || normalizeEmail(emailInput?.value || "");
    if (!isValidEmail(email)) {
      showError("Informe um e-mail válido.");
      setState("email");
      return;
    }

    setButtonLoading(resendBtn, true, "Reenviando...");
    const result = await postJson("/api/auth/email/start", { email });
    setButtonLoading(resendBtn, false, "Reenviando...");

    if (!result.ok) {
      showError(mapAuthError(result.data?.error || "EMAIL_DELIVERY_FAILED"));
      return;
    }
    showDevCode(result.data?.devCode);

    startResendTimer(30);
  }

  async function loginWithPassword() {
    clearError();
    const email = normalizeEmail(emailInput2?.value || activeEmail || "");
    const password = String(passwordInput?.value || "");

    if (!isValidEmail(email)) {
      showError("Informe um e-mail válido.");
      return;
    }
    if (!password) {
      showError("Informe sua senha.");
      return;
    }

    setButtonLoading(loginPasswordBtn, true, "Entrando...");
    const store = window.TsebiUserStore;
    let result = null;
    if (store && typeof store.login === "function") {
      result = await store.login({ email, password });
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      result = { ok: false, error: "Integração de login pendente." };
    }
    setButtonLoading(loginPasswordBtn, false, "Entrando...");

    if (result?.ok && result?.user) {
      window.location.href = getReturnUrl();
      return;
    }

    if (result?.stage === "login_code_required" || result?.stage === "account_verification_required") {
      activeEmail = result?.email ? normalizeEmail(result.email) : email;
      if (emailInput) emailInput.value = activeEmail;
      if (emailInput2) emailInput2.value = activeEmail;
      setState("code");
      startResendTimer(30);
      return;
    }

    showError(mapAuthError(result?.error || "INVALID_CREDENTIALS"));
  }

  function handleTogglePassword() {
    if (!passwordInput || !togglePasswordBtn) return;
    const show = passwordInput.type === "password";
    passwordInput.type = show ? "text" : "password";
    togglePasswordBtn.textContent = show ? "Ocultar" : "Mostrar";
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
    try {
      const response = await fetch("/api/auth/google/config", {
        method: "GET",
        credentials: "same-origin",
        next: { revalidate: 30 }
      });
      if (!response.ok) return { enabled: false, clientId: "" };
      const data = await response.json().catch(() => null);
      if (!data || typeof data !== "object") return { enabled: false, clientId: "" };
      return {
        enabled: Boolean(data.enabled),
        clientId: String(data.clientId || "").trim()
      };
    } catch {
      return { enabled: false, clientId: "" };
    }
  }

  function setSocialButtonAvailability(button, isAvailable) {
    if (!button) return;
    const available = Boolean(isAvailable);
    button.disabled = !available;
    button.classList.toggle("is-disabled", !available);
    button.setAttribute("aria-disabled", available ? "false" : "true");
  }

  async function syncSocialAvailability() {
    const googleConfig = await fetchGoogleConfig();
    googleLoginAvailable = Boolean(googleConfig.enabled && googleConfig.clientId);
    setSocialButtonAvailability(googleBtn, googleLoginAvailable);
    const passkeySupported = Boolean(window.PublicKeyCredential && navigator.credentials);
    passkeyAvailable = passkeySupported;
    setSocialButtonAvailability(passkeyBtn, passkeyAvailable);
  }

  async function beginGoogleLogin() {
    clearError();
    if (!googleLoginAvailable) {
      showError("Login com Google indisponivel no momento.");
      return;
    }
    setButtonLoading(googleBtn, true, "Conectando...");
    const config = await fetchGoogleConfig();
    setButtonLoading(googleBtn, false, "Conectando...");

    if (!config.enabled || !config.clientId) {
      googleLoginAvailable = false;
      setSocialButtonAvailability(googleBtn, false);
      showError("Login com Google indisponivel no momento.");
      return;
    }

    const state = randomToken(24);
    const nonce = randomToken(24);
    const returnUrl = getReturnUrl();
    try {
      sessionStorage.setItem(GOOGLE_STATE_KEY, state);
      sessionStorage.setItem(GOOGLE_NONCE_KEY, nonce);
      sessionStorage.setItem(GOOGLE_RETURN_URL_KEY, returnUrl);
    } catch {}

    const callbackUrl = new URL(window.location.origin + window.location.pathname);
    callbackUrl.searchParams.set("google", "1");

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

  async function loginWithPasskey() {
    clearError();
    const passkeySupported = Boolean(window.PublicKeyCredential && navigator.credentials);
    if (!passkeySupported) {
      showError("Este navegador não suporta Passkey.");
      return;
    }

    const email = normalizeEmail(emailInput?.value || emailInput2?.value || activeEmail || "");
    if (!isValidEmail(email)) {
      showError("Informe seu e-mail para entrar com Passkey.");
      if (currentState !== "email") setState("email");
      return;
    }

    setButtonLoading(passkeyBtn, true, "Conectando...");
    const optionsResult = await postJson("/api/auth/passkey/login/options", { email });
    if (!optionsResult.ok || !optionsResult.data?.ok || !optionsResult.data?.options) {
      setButtonLoading(passkeyBtn, false, "Conectando...");
      showError(mapAuthError(optionsResult.data?.error || "PASSKEY_NOT_FOUND"));
      return;
    }

    let assertion = null;
    try {
      assertion = await navigator.credentials.get({
        publicKey: decodeAuthenticationOptions(optionsResult.data.options)
      });
    } catch (error) {
      setButtonLoading(passkeyBtn, false, "Conectando...");
      showError(error?.name === "NotAllowedError" ? "Autenticação cancelada." : "Falha ao usar Passkey.");
      return;
    }

    const serialized = serializeCredential(assertion);
    const verifyResult = await postJson("/api/auth/passkey/login/verify", {
      email,
      credential: serialized
    });
    setButtonLoading(passkeyBtn, false, "Conectando...");

    if (!verifyResult.ok || !verifyResult.data?.ok) {
      showError(mapAuthError(verifyResult.data?.error || "INVALID_CREDENTIALS"));
      return;
    }

    window.location.href = getReturnUrl();
  }

  function parseHashParams() {
    const hash = String(window.location.hash || "").replace(/^#/, "");
    if (!hash) return new URLSearchParams();
    return new URLSearchParams(hash);
  }

  async function completeGoogleLoginFromHash() {
    const hashParams = parseHashParams();
    const idToken = String(hashParams.get("id_token") || "").trim();
    if (!idToken) return;

    const stateFromHash = String(hashParams.get("state") || "").trim();
    let expectedState = "";
    let expectedNonce = "";
    let storedReturnUrl = "";
    try {
      expectedState = String(sessionStorage.getItem(GOOGLE_STATE_KEY) || "");
      expectedNonce = String(sessionStorage.getItem(GOOGLE_NONCE_KEY) || "");
      storedReturnUrl = String(sessionStorage.getItem(GOOGLE_RETURN_URL_KEY) || "");
      sessionStorage.removeItem(GOOGLE_STATE_KEY);
      sessionStorage.removeItem(GOOGLE_NONCE_KEY);
      sessionStorage.removeItem(GOOGLE_RETURN_URL_KEY);
    } catch {}

    history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);

    if (!stateFromHash || !expectedState || stateFromHash !== expectedState) {
      showError("Falha ao validar login Google.");
      return;
    }

    setButtonLoading(googleBtn, true, "Conectando...");
    const response = await fetch("/api/auth/google", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, nonce: expectedNonce })
    });
    setButtonLoading(googleBtn, false, "Conectando...");

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      showError("Não foi possível concluir o login com Google.");
      return;
    }

    window.location.href = storedReturnUrl || getReturnUrl();
  }

  sendCodeBtn?.addEventListener("click", sendCode);
  verifyCodeBtn?.addEventListener("click", verifyCode);
  resendBtn?.addEventListener("click", resendCode);
  changeEmailBtn?.addEventListener("click", () => setState("email"));
  showPasswordBtnPrimary?.addEventListener("click", () => setState("password"));
  showPasswordBtn?.addEventListener("click", () => setState("password"));
  backToCodeBtn?.addEventListener("click", () => setState("code"));
  loginPasswordBtn?.addEventListener("click", loginWithPassword);
  togglePasswordBtn?.addEventListener("click", handleTogglePassword);

  emailInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendCode();
    }
  });
  codeInput?.addEventListener("input", () => {
    const normalized = String(codeInput.value || "").replace(/\D/g, "").slice(0, 6);
    codeInput.value = normalized;
  });
  codeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      verifyCode();
    }
  });
  passwordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      loginWithPassword();
    }
  });

  googleBtn?.addEventListener("click", beginGoogleLogin);
  passkeyBtn?.addEventListener("click", loginWithPasskey);

  syncSocialAvailability();
  completeGoogleLoginFromHash();
  setState("email");
})();

