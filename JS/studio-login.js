(() => {
  const dom = {
    status: document.getElementById("studioStatus"),
    stepLogin: document.getElementById("stepLogin"),
    stepSetup: document.getElementById("stepSetup"),
    stepVerify: document.getElementById("stepVerify"),
    stepRecovery: document.getElementById("stepRecovery"),
    loginForm: document.getElementById("studioLoginForm"),
    setupVerifyForm: document.getElementById("studioSetupVerifyForm"),
    verifyForm: document.getElementById("studioVerifyForm"),
    continueBtn: document.getElementById("continueToStudioBtn"),
    email: document.getElementById("studioEmail"),
    password: document.getElementById("studioPassword"),
    setupQr: document.getElementById("setupQr"),
    setupSecret: document.getElementById("setupSecret"),
    setupToken: document.getElementById("setupToken"),
    verifyToken: document.getElementById("verifyToken"),
    verifyRecoveryCode: document.getElementById("verifyRecoveryCode"),
    recoveryCodesOutput: document.getElementById("recoveryCodesOutput")
  };

  const steps = {
    login: dom.stepLogin,
    setup: dom.stepSetup,
    verify: dom.stepVerify,
    recovery: dom.stepRecovery
  };
  const studioFlowKey = "tsebi-studio-entry-ok";

  function getSafeReturnTo() {
    const params = new URLSearchParams(window.location.search);
    const raw = String(params.get("returnTo") || "").trim();
    if (!raw) return "studio-portal.html";
    if (raw.startsWith("//")) return "studio-portal.html";
    if (raw.startsWith("/")) return raw;
    if (/^[a-zA-Z0-9._/-]+$/.test(raw)) return raw;
    return "studio-portal.html";
  }

  const returnTo = getSafeReturnTo();

  function setStatus(message, tone = "") {
    if (!dom.status) return;
    dom.status.textContent = String(message || "");
    dom.status.classList.toggle("is-error", tone === "error");
    dom.status.classList.toggle("is-ok", tone === "ok");
  }

  function showStep(stepName) {
    Object.entries(steps).forEach(([key, section]) => {
      if (!section) return;
      section.hidden = key !== stepName;
    });
  }

  function redirectToStudio() {
    try {
      sessionStorage.setItem(studioFlowKey, "1");
    } catch {}
    window.location.href = returnTo;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(String(data?.error || "REQUEST_FAILED"));
      error.code = String(data?.error || "REQUEST_FAILED");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function formatRecoveryCodes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return "";
    return codes.map((code, index) => `${index + 1}. ${String(code || "")}`).join("\n");
  }

  async function openSetupStep() {
    const data = await api("/api/studio-auth/mfa/setup/init", { method: "POST" });
    if (dom.setupQr) dom.setupQr.src = String(data.qrDataUrl || "");
    if (dom.setupSecret) dom.setupSecret.textContent = String(data.secret || "-");
    if (dom.setupToken) dom.setupToken.value = "";
    showStep("setup");
    setStatus("Configure o app autenticador e valide o codigo.", "");
    dom.setupToken?.focus();
  }

  async function handleSessionState() {
    try {
      const data = await api("/api/studio-auth/me");
      if (data?.authenticated) {
        redirectToStudio();
        return;
      }
      if (data?.stage === "mfa_setup_required") {
        await openSetupStep();
        return;
      }
      if (data?.stage === "mfa_required") {
        showStep("verify");
        setStatus("Digite seu codigo MFA ou codigo de recuperacao.", "");
        dom.verifyToken?.focus();
        return;
      }
      showStep("login");
    } catch {
      showStep("login");
      setStatus("");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const payload = {
      email: String(dom.email?.value || "").trim(),
      password: String(dom.password?.value || "")
    };

    try {
      const data = await api("/api/studio-auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (data.stage === "mfa_setup_required") {
        await openSetupStep();
        return;
      }
      if (data.stage === "mfa_required") {
        showStep("verify");
        setStatus("Credenciais validas. Informe o MFA para entrar.", "ok");
        dom.verifyToken?.focus();
        return;
      }
      setStatus("Fluxo de login invalido.", "error");
    } catch (error) {
      setStatus(`Falha no login: ${error.code || error.message}`, "error");
    }
  }

  async function handleSetupVerify(event) {
    event.preventDefault();
    const token = String(dom.setupToken?.value || "").replace(/\D/g, "").slice(0, 6);
    if (!token) {
      setStatus("Digite o codigo de 6 digitos do app.", "error");
      return;
    }

    try {
      const data = await api("/api/studio-auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ token })
      });
      if (Array.isArray(data.recoveryCodes) && data.recoveryCodes.length > 0) {
        if (dom.recoveryCodesOutput) {
          dom.recoveryCodesOutput.textContent = formatRecoveryCodes(data.recoveryCodes);
        }
        showStep("recovery");
        setStatus("MFA ativado. Guarde os codigos de recuperacao abaixo.", "ok");
        return;
      }
      redirectToStudio();
    } catch (error) {
      setStatus(`Falha ao validar MFA: ${error.code || error.message}`, "error");
    }
  }

  async function handleVerify(event) {
    event.preventDefault();
    const token = String(dom.verifyToken?.value || "").replace(/\D/g, "").slice(0, 6);
    const recoveryCode = String(dom.verifyRecoveryCode?.value || "").trim();
    if (!token && !recoveryCode) {
      setStatus("Informe codigo MFA ou codigo de recuperacao.", "error");
      return;
    }

    try {
      await api("/api/studio-auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ token, recoveryCode })
      });
      redirectToStudio();
    } catch (error) {
      setStatus(`Falha ao validar MFA: ${error.code || error.message}`, "error");
    }
  }

  function bindEvents() {
    dom.loginForm?.addEventListener("submit", handleLogin);
    dom.setupVerifyForm?.addEventListener("submit", handleSetupVerify);
    dom.verifyForm?.addEventListener("submit", handleVerify);
    dom.continueBtn?.addEventListener("click", redirectToStudio);
  }

  bindEvents();
  handleSessionState();
})();
