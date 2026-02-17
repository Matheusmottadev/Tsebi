const store = window.TsebiUserStore;

const panels = {
  email: document.getElementById("authPanelEmail"),
  login: document.getElementById("authPanelLogin"),
  register: document.getElementById("authPanelRegister")
};

const feedbackEl = document.getElementById("authFeedback");
const emailCheckForm = document.getElementById("emailCheckForm");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const emailCheckInput = document.getElementById("emailCheckInput");
const detectedEmailLogin = document.getElementById("detectedEmailLogin");
const detectedEmailRegister = document.getElementById("detectedEmailRegister");

const loginPasswordInput = document.getElementById("loginPassword");
const loginCodeField = document.getElementById("loginCodeField");
const loginEmailCodeInput = document.getElementById("loginEmailCode");
const resendLoginCodeBtn = document.getElementById("resendLoginCodeBtn");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");

const registerCodeField = document.getElementById("registerCodeField");
const registerEmailCodeInput = document.getElementById("registerEmailCode");
const registerPasswordConfirmInput = document.getElementById("registerPasswordConfirm");
const resendRegisterCodeBtn = document.getElementById("resendRegisterCodeBtn");

const changeEmailFromLogin = document.getElementById("changeEmailFromLogin");
const changeEmailFromRegister = document.getElementById("changeEmailFromRegister");

let selectedEmail = "";
let activeSessionEmail = "";
let loginStage = "password"; // password | login_code | account_verify
let registerStage = "form"; // form | account_verify

function getSafeReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("returnUrl") || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  return raw;
}

const returnUrl = getSafeReturnUrl();

function redirectAfterAuth() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.location.href = "minha-conta.html";
}

function setFeedback(message, isError = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message || "";
  feedbackEl.style.color = isError ? "#991b1b" : "#1d6a2d";
}

function setFormLoading(form, loading) {
  if (!form) return;
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;
  submit.disabled = Boolean(loading);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function normalizeDigits(value, max) {
  return String(value || "").replace(/\D/g, "").slice(0, max);
}

function formatCpf(value) {
  const digits = normalizeDigits(value, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

function formatCep(value) {
  const digits = normalizeDigits(value, 8);
  return digits.replace(/^(\d{5})(\d)/, "$1-$2");
}

function codeHint(devCode) {
  if (!devCode) return "";
  return ` (dev: ${devCode})`;
}

function buildForgotPasswordUrl() {
  const params = new URLSearchParams();
  if (selectedEmail) params.set("email", selectedEmail);
  if (returnUrl) params.set("returnUrl", returnUrl);
  const query = params.toString();
  return query ? `recuperar-senha.html?${query}` : "recuperar-senha.html";
}

function syncForgotPasswordLink() {
  if (!(forgotPasswordBtn instanceof HTMLAnchorElement)) return;
  forgotPasswordBtn.href = buildForgotPasswordUrl();
}

function showPanel(panelName) {
  Object.entries(panels).forEach(([name, panel]) => {
    if (!panel) return;
    const active = name === panelName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  setFeedback("");

  if (panelName === "email") emailCheckInput?.focus();
  if (panelName === "login") {
    if (loginStage === "password") loginPasswordInput?.focus();
    else loginEmailCodeInput?.focus();
  }
  if (panelName === "register") {
    if (registerStage === "form") document.getElementById("registerName")?.focus();
    else registerEmailCodeInput?.focus();
  }
}

function setLoginStage(nextStage) {
  loginStage = nextStage;

  const submit = loginForm?.querySelector('button[type="submit"]');
  const inCodeStage = nextStage === "login_code" || nextStage === "account_verify";
  if (loginCodeField) loginCodeField.hidden = !inCodeStage;
  if (resendLoginCodeBtn) resendLoginCodeBtn.hidden = !inCodeStage;
  if (forgotPasswordBtn) forgotPasswordBtn.hidden = inCodeStage;

  if (loginPasswordInput) {
    loginPasswordInput.disabled = inCodeStage;
    loginPasswordInput.required = !inCodeStage;
  }

  if (loginEmailCodeInput) {
    loginEmailCodeInput.disabled = !inCodeStage;
    loginEmailCodeInput.required = inCodeStage;
    if (!inCodeStage) loginEmailCodeInput.value = "";
  }

  if (submit) {
    if (nextStage === "login_code") submit.textContent = "Verificar codigo e entrar";
    else if (nextStage === "account_verify") submit.textContent = "Verificar e-mail e entrar";
    else submit.textContent = "Entrar";
  }
}

function setRegisterStage(nextStage) {
  registerStage = nextStage;
  const submit = registerForm?.querySelector('button[type="submit"]');
  const inCodeStage = nextStage === "account_verify";

  if (registerCodeField) registerCodeField.hidden = !inCodeStage;
  if (resendRegisterCodeBtn) resendRegisterCodeBtn.hidden = !inCodeStage;

  const inputs = Array.from(registerForm?.querySelectorAll("input") || []);
  inputs.forEach((input) => {
    const id = String(input.id || "");
    if (id === "registerEmailCode") {
      input.disabled = !inCodeStage;
      input.required = inCodeStage;
      if (!inCodeStage) input.value = "";
      return;
    }

    input.disabled = inCodeStage;
    if (inCodeStage) {
      input.removeAttribute("required");
    } else {
      if (
        ["registerName", "registerBirthDate", "registerCpf", "registerCep", "registerPassword", "registerPasswordConfirm"].includes(
          id
        )
      ) {
        input.setAttribute("required", "required");
      }
    }
  });

  if (submit) {
    submit.textContent = inCodeStage ? "Verificar e-mail e entrar" : "Criar conta";
  }
}

function resetToEmailStep() {
  selectedEmail = "";
  setLoginStage("password");
  setRegisterStage("form");

  if (emailCheckInput) emailCheckInput.value = "";
  if (loginPasswordInput) loginPasswordInput.value = "";
  if (loginEmailCodeInput) loginEmailCodeInput.value = "";

  const registerIds = [
    "registerName",
    "registerBirthDate",
    "registerCpf",
    "registerCep",
    "registerPassword",
    "registerPasswordConfirm",
    "registerEmailCode"
  ];
  registerIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input instanceof HTMLInputElement) input.value = "";
  });

  syncForgotPasswordLink();
  showPanel("email");
}

async function handleEmailCheck(event) {
  event.preventDefault();
  if (!store) return;

  const email = normalizeEmail(emailCheckInput?.value || "");
  if (!isValidEmail(email)) {
    setFeedback("Informe um e-mail valido.", true);
    return;
  }

  if (activeSessionEmail && email !== activeSessionEmail) {
    await store.logout();
    activeSessionEmail = "";
  }

  selectedEmail = email;
  setFormLoading(emailCheckForm, true);
  const result = await store.checkEmail(email);
  setFormLoading(emailCheckForm, false);

  if (!result.ok) {
    if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
    setLoginStage("password");
    syncForgotPasswordLink();
    showPanel("login");
    setFeedback("Nao foi possivel validar automaticamente. Continue com sua senha.", false);
    return;
  }

  if (result.exists) {
    if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
    setLoginStage("password");
    syncForgotPasswordLink();
    showPanel("login");
    return;
  }

  if (detectedEmailRegister) detectedEmailRegister.textContent = selectedEmail;
  setRegisterStage("form");
  showPanel("register");
}

async function handleLogin(event) {
  event.preventDefault();
  if (!store) return;
  if (!selectedEmail) return showPanel("email");

  if (loginStage === "password") {
    setFormLoading(loginForm, true);
    const result = await store.login({ email: selectedEmail, password: String(loginPasswordInput?.value || "") });
    setFormLoading(loginForm, false);

    if (!result.ok) {
      setFeedback(result.error || "Nao foi possivel entrar.", true);
      return;
    }

    if (result.user) {
      setFeedback("Login realizado com sucesso.");
      return redirectAfterAuth();
    }

    if (result.stage === "login_code_required") {
      setLoginStage("login_code");
      setFeedback(`Enviamos um codigo para ${selectedEmail}.${codeHint(result.devCode)}`);
      loginEmailCodeInput?.focus();
      return;
    }

    if (result.stage === "account_verification_required") {
      setLoginStage("account_verify");
      setFeedback(`Confirme seu e-mail para concluir o acesso.${codeHint(result.devCode)}`);
      loginEmailCodeInput?.focus();
      return;
    }

    setFeedback("Nao foi possivel iniciar o login.", true);
    return;
  }

  const code = normalizeDigits(loginEmailCodeInput?.value || "", 6);
  if (code.length !== 6) {
    setFeedback("Informe o codigo de 6 digitos.", true);
    return;
  }

  setFormLoading(loginForm, true);
  const verifyResult =
    loginStage === "account_verify"
      ? await store.verifyAccountEmailCode({ email: selectedEmail, code })
      : await store.verifyLoginEmailCode({ email: selectedEmail, code });
  setFormLoading(loginForm, false);

  if (!verifyResult.ok) {
    setFeedback(verifyResult.error || "Codigo invalido.", true);
    return;
  }

  setFeedback("Login realizado com sucesso.");
  redirectAfterAuth();
}

async function handleRegister(event) {
  event.preventDefault();
  if (!store) return;
  if (!selectedEmail) return showPanel("email");

  if (registerStage === "form") {
    const name = String(document.getElementById("registerName")?.value || "").trim();
    const birthDate = String(document.getElementById("registerBirthDate")?.value || "").trim();
    const cpf = normalizeDigits(document.getElementById("registerCpf")?.value || "", 11);
    const cep = normalizeDigits(document.getElementById("registerCep")?.value || "", 8);
    const password = String(document.getElementById("registerPassword")?.value || "");
    const passwordConfirm = String(registerPasswordConfirmInput?.value || "");

    if (!birthDate || cpf.length !== 11 || cep.length !== 8) {
      setFeedback("Preencha data de nascimento, CPF e CEP validos.", true);
      return;
    }

    if (password !== passwordConfirm) {
      setFeedback("As senhas nao coincidem.", true);
      return;
    }

    setFormLoading(registerForm, true);
    const result = await store.register({ name, email: selectedEmail, password, birthDate, cpf, cep });
    setFormLoading(registerForm, false);

    if (!result.ok) {
      if (result.code === "EMAIL_ALREADY_EXISTS") {
        if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
        setLoginStage("password");
        syncForgotPasswordLink();
        showPanel("login");
        setFeedback("Este e-mail ja possui conta. Entre com sua senha.", true);
        return;
      }
      setFeedback(result.error || "Nao foi possivel criar conta.", true);
      return;
    }

    if (result.user) {
      setFeedback("Conta criada com sucesso.");
      return redirectAfterAuth();
    }

    setRegisterStage("account_verify");
    setFeedback(`Conta criada. Verifique o codigo enviado para ${selectedEmail}.${codeHint(result.devCode)}`);
    registerEmailCodeInput?.focus();
    return;
  }

  const code = normalizeDigits(registerEmailCodeInput?.value || "", 6);
  if (code.length !== 6) {
    setFeedback("Informe o codigo de 6 digitos.", true);
    return;
  }

  setFormLoading(registerForm, true);
  const verify = await store.verifyAccountEmailCode({ email: selectedEmail, code });
  setFormLoading(registerForm, false);

  if (!verify.ok) {
    setFeedback(verify.error || "Codigo invalido.", true);
    return;
  }

  setFeedback("Conta verificada com sucesso.");
  redirectAfterAuth();
}

async function handleResendLoginCode() {
  if (!store || !selectedEmail) return;

  if (loginStage === "account_verify") {
    const resent = await store.resendAccountEmailCode(selectedEmail);
    if (!resent.ok) {
      setFeedback(resent.error || "Nao foi possivel reenviar codigo.", true);
      return;
    }
    setFeedback(`Codigo reenviado.${codeHint(resent.devCode)}`);
    return;
  }

  if (loginStage === "login_code") {
    const password = String(loginPasswordInput?.value || "");
    if (!password) {
      setFeedback("Digite sua senha novamente para reenviar o codigo.", true);
      return;
    }

    const resent = await store.login({ email: selectedEmail, password });
    if (!resent.ok) {
      setFeedback(resent.error || "Nao foi possivel reenviar codigo.", true);
      return;
    }

    setFeedback(`Codigo reenviado.${codeHint(resent.devCode)}`);
  }
}

async function boot() {
  if (!store) {
    setFeedback("Servico de conta indisponivel.", true);
    return;
  }

  const me = await store.fetchMe();
  if (me.ok && me.user) {
    activeSessionEmail = normalizeEmail(me.user.email || "");
    setFeedback(`Voce esta logado como ${me.user.email}. Para trocar de conta, informe outro e-mail.`);
  }

  emailCheckForm?.addEventListener("submit", handleEmailCheck);
  loginForm?.addEventListener("submit", handleLogin);
  registerForm?.addEventListener("submit", handleRegister);

  document.getElementById("registerCpf")?.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    input.value = formatCpf(input.value);
  });

  document.getElementById("registerCep")?.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    input.value = formatCep(input.value);
  });

  resendLoginCodeBtn?.addEventListener("click", handleResendLoginCode);
  resendRegisterCodeBtn?.addEventListener("click", async () => {
    if (!store || !selectedEmail) return;
    const resent = await store.resendAccountEmailCode(selectedEmail);
    if (!resent.ok) {
      setFeedback(resent.error || "Nao foi possivel reenviar codigo.", true);
      return;
    }
    setFeedback(`Codigo reenviado.${codeHint(resent.devCode)}`);
  });
  forgotPasswordBtn?.addEventListener("click", () => {
    if (!(forgotPasswordBtn instanceof HTMLAnchorElement)) return;
    forgotPasswordBtn.href = buildForgotPasswordUrl();
  });
  changeEmailFromLogin?.addEventListener("click", resetToEmailStep);
  changeEmailFromRegister?.addEventListener("click", resetToEmailStep);

  setLoginStage("password");
  setRegisterStage("form");
  syncForgotPasswordLink();
  showPanel("email");
}

boot();
