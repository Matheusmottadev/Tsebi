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
const changeEmailFromLogin = document.getElementById("changeEmailFromLogin");
const changeEmailFromRegister = document.getElementById("changeEmailFromRegister");

let selectedEmail = "";
let activeSessionEmail = "";

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

function showPanel(panelName) {
  Object.entries(panels).forEach(([name, panel]) => {
    if (!panel) return;
    const active = name === panelName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
  setFeedback("");

  if (panelName === "email") emailCheckInput?.focus();
  if (panelName === "login") document.getElementById("loginPassword")?.focus();
  if (panelName === "register") document.getElementById("registerName")?.focus();
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
    setFeedback("Sessão anterior encerrada. Continue com o novo e-mail.");
  }

  selectedEmail = email;
  setFormLoading(emailCheckForm, true);

  const result = await store.checkEmail(email);
  setFormLoading(emailCheckForm, false);

  if (!result.ok) {
    if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
    showPanel("login");
    setFeedback("Não foi possível validar automaticamente. Continue com sua senha.", false);
    return;
  }

  if (result.exists) {
    if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
    showPanel("login");
    return;
  }

  if (detectedEmailRegister) detectedEmailRegister.textContent = selectedEmail;
  showPanel("register");
}

async function handleLogin(event) {
  event.preventDefault();
  if (!store) return;

  const password = String(document.getElementById("loginPassword")?.value || "");
  if (!selectedEmail) {
    showPanel("email");
    return;
  }

  setFormLoading(loginForm, true);
  const result = await store.login({ email: selectedEmail, password });
  setFormLoading(loginForm, false);

  if (!result.ok) {
    if (result.code === "INVALID_CREDENTIALS") {
      setFeedback("Senha inválida. Se ainda não tiver conta, use outro e-mail para criar.", true);
      return;
    }
    setFeedback(result.error || "Não foi possível entrar.", true);
    return;
  }

  setFeedback("Login realizado com sucesso.");
  redirectAfterAuth();
}

async function handleRegister(event) {
  event.preventDefault();
  if (!store) return;

  const name = String(document.getElementById("registerName")?.value || "").trim();
  const birthDate = String(document.getElementById("registerBirthDate")?.value || "").trim();
  const cpf = normalizeDigits(document.getElementById("registerCpf")?.value || "", 11);
  const cep = normalizeDigits(document.getElementById("registerCep")?.value || "", 8);
  const password = String(document.getElementById("registerPassword")?.value || "");
  if (!selectedEmail) {
    showPanel("email");
    return;
  }

  if (!birthDate || cpf.length !== 11 || cep.length !== 8) {
    setFeedback("Preencha data de nascimento, CPF e CEP válidos.", true);
    return;
  }

  setFormLoading(registerForm, true);
  const result = await store.register({
    name,
    email: selectedEmail,
    password,
    birthDate,
    cpf,
    cep
  });
  setFormLoading(registerForm, false);

  if (!result.ok) {
    if (result.code === "EMAIL_ALREADY_EXISTS") {
      if (detectedEmailLogin) detectedEmailLogin.textContent = selectedEmail;
      showPanel("login");
      setFeedback("Este e-mail já possui conta. Entre com sua senha.", true);
      return;
    }
    setFeedback(result.error || "Não foi possível criar conta.", true);
    return;
  }

  setFeedback("Conta criada com sucesso.");
  redirectAfterAuth();
}

function resetToEmailStep() {
  selectedEmail = "";
  if (emailCheckInput) emailCheckInput.value = "";
  const loginPassword = document.getElementById("loginPassword");
  const registerName = document.getElementById("registerName");
  const registerBirthDate = document.getElementById("registerBirthDate");
  const registerCpf = document.getElementById("registerCpf");
  const registerCep = document.getElementById("registerCep");
  const registerPassword = document.getElementById("registerPassword");
  if (loginPassword) loginPassword.value = "";
  if (registerName) registerName.value = "";
  if (registerBirthDate) registerBirthDate.value = "";
  if (registerCpf) registerCpf.value = "";
  if (registerCep) registerCep.value = "";
  if (registerPassword) registerPassword.value = "";
  showPanel("email");
}

async function boot() {
  if (!store) {
    setFeedback("Serviço de conta indisponível.", true);
    return;
  }

  const me = await store.fetchMe();
  if (me.ok && me.user) {
    activeSessionEmail = normalizeEmail(me.user.email || "");
    setFeedback(`Você está logado como ${me.user.email}. Para trocar de conta, informe outro e-mail.`);
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
  changeEmailFromLogin?.addEventListener("click", resetToEmailStep);
  changeEmailFromRegister?.addEventListener("click", resetToEmailStep);
  showPanel("email");
}

boot();
