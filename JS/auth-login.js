(function initPremiumLogin() {
  const form = document.getElementById("loginFormPremium");
  const emailInput = document.getElementById("loginEmailPremium");
  const passwordInput = document.getElementById("loginPasswordPremium");
  const rememberMeInput = document.getElementById("rememberMePremium");
  const submitBtn = document.getElementById("loginSubmitBtn");
  const togglePasswordBtn = document.getElementById("togglePasswordBtn");
  const feedback = document.getElementById("loginFeedback");
  const emailError = document.getElementById("loginEmailError");
  const passwordError = document.getElementById("loginPasswordError");

  const REMEMBER_EMAIL_KEY = "tsebi-login-remember-email";

  function getReturnUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("returnUrl") || "").trim();
    if (!raw) return "conta.html";
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw.slice(1);
    if (!raw.includes("://")) return raw;
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.origin !== window.location.origin) return "conta.html";
      return `${parsed.pathname.replace(/^\//, "")}${parsed.search}${parsed.hash}`;
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

    if (!result?.ok) {
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
  form?.addEventListener("submit", handleSubmit);
  hydrateRememberedEmail();
})();
