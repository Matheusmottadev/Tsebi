const store = window.TsebiUserStore;

const requestForm = document.getElementById("resetRequestForm");
const verifyForm = document.getElementById("resetVerifyForm");
const verifyPanel = document.getElementById("resetVerifyPanel");
const resetFeedback = document.getElementById("resetFeedback");

const emailInput = document.getElementById("resetEmailInput");
const codeInput = document.getElementById("resetCodeInput");
const passwordInput = document.getElementById("resetPasswordInput");
const passwordConfirmInput = document.getElementById("resetPasswordConfirmInput");

const resendButton = document.getElementById("resendResetCodeBtn");
const backToLoginLink = document.getElementById("backToLoginLink");

let selectedEmail = "";
let resendSecondsLeft = 0;
let resendTimer = null;

function getSafeReturnUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get("returnUrl") || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  return raw;
}

const returnUrl = getSafeReturnUrl();

function getQueryEmail() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("email") || "").trim().toLowerCase();
}

function normalizeDigits(value, max) {
  return String(value || "").replace(/\D/g, "").slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());
}

function codeHint(devCode) {
  if (!devCode) return "";
  return ` (dev: ${devCode})`;
}

function setFeedback(message, isError = false) {
  if (!resetFeedback) return;
  resetFeedback.textContent = message || "";
  resetFeedback.style.color = isError ? "#991b1b" : "#1d6a2d";
}

function setFormLoading(form, loading) {
  if (!form) return;
  const submit = form.querySelector('button[type="submit"]');
  if (!(submit instanceof HTMLButtonElement)) return;
  submit.disabled = Boolean(loading);
}

function buildBackToLoginUrl() {
  const params = new URLSearchParams();
  if (returnUrl) params.set("returnUrl", returnUrl);
  const query = params.toString();
  return query ? `conta.html?${query}` : "conta.html";
}

function showVerifyPanel(visible) {
  if (!verifyPanel) return;
  verifyPanel.hidden = !visible;
}

function formatTimer(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutesPart = String(Math.floor(safe / 60)).padStart(2, "0");
  const secondsPart = String(safe % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}`;
}

function updateResendButton() {
  if (!(resendButton instanceof HTMLButtonElement)) return;
  if (resendSecondsLeft > 0) {
    resendButton.disabled = true;
    resendButton.textContent = `Reenviar codigo em ${formatTimer(resendSecondsLeft)}`;
    return;
  }
  resendButton.disabled = false;
  resendButton.textContent = "Reenviar codigo";
}

function stopResendTimer() {
  if (resendTimer) {
    window.clearInterval(resendTimer);
    resendTimer = null;
  }
}

function startResendTimer(seconds = 60) {
  stopResendTimer();
  resendSecondsLeft = Math.max(0, Number(seconds) || 0);
  updateResendButton();

  if (resendSecondsLeft <= 0) return;
  resendTimer = window.setInterval(() => {
    resendSecondsLeft = Math.max(0, resendSecondsLeft - 1);
    updateResendButton();
    if (resendSecondsLeft <= 0) {
      stopResendTimer();
    }
  }, 1000);
}

async function sendResetCode(email) {
  const result = await store.requestPasswordReset(email);
  if (!result.ok) {
    setFeedback(result.error || "Nao foi possivel enviar o codigo.", true);
    return false;
  }
  selectedEmail = email;
  showVerifyPanel(true);
  startResendTimer(60);
  setFeedback(`Enviamos um codigo de redefinicao para ${email}.${codeHint(result.devCode)}`);
  codeInput?.focus();
  return true;
}

async function handleRequestSubmit(event) {
  event.preventDefault();
  if (!store) return;

  const email = String(emailInput?.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    setFeedback("Informe um e-mail valido.", true);
    return;
  }

  setFormLoading(requestForm, true);
  await sendResetCode(email);
  setFormLoading(requestForm, false);
}

async function handleVerifySubmit(event) {
  event.preventDefault();
  if (!store) return;

  const email = selectedEmail || String(emailInput?.value || "").trim().toLowerCase();
  const code = normalizeDigits(codeInput?.value || "", 6);
  const password = String(passwordInput?.value || "");
  const passwordConfirm = String(passwordConfirmInput?.value || "");

  if (!isValidEmail(email)) {
    setFeedback("Informe um e-mail valido.", true);
    return;
  }
  if (code.length !== 6) {
    setFeedback("Informe o codigo de 6 digitos.", true);
    return;
  }
  if (password.length < 8) {
    setFeedback("A nova senha deve ter ao menos 8 caracteres.", true);
    return;
  }
  if (password !== passwordConfirm) {
    setFeedback("As senhas nao coincidem.", true);
    return;
  }

  setFormLoading(verifyForm, true);
  const result = await store.verifyPasswordResetCode({ email, code, password });
  setFormLoading(verifyForm, false);

  if (!result.ok) {
    setFeedback(result.error || "Nao foi possivel redefinir a senha.", true);
    return;
  }

  setFeedback("Senha redefinida com sucesso. Redirecionando para o login.");
  window.setTimeout(() => {
    window.location.href = buildBackToLoginUrl();
  }, 1200);
}

async function handleResendClick() {
  if (!store) return;
  if (resendSecondsLeft > 0) return;

  const email = selectedEmail || String(emailInput?.value || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    setFeedback("Informe um e-mail valido para reenviar.", true);
    return;
  }

  const sent = await sendResetCode(email);
  if (!sent) return;
}

function boot() {
  if (!store) {
    setFeedback("Servico de conta indisponivel.", true);
    return;
  }

  const queryEmail = getQueryEmail();
  if (isValidEmail(queryEmail) && emailInput instanceof HTMLInputElement) {
    emailInput.value = queryEmail;
  }

  if (backToLoginLink instanceof HTMLAnchorElement) {
    backToLoginLink.href = buildBackToLoginUrl();
  }

  requestForm?.addEventListener("submit", handleRequestSubmit);
  verifyForm?.addEventListener("submit", handleVerifySubmit);
  resendButton?.addEventListener("click", handleResendClick);
  showVerifyPanel(false);
  updateResendButton();
}

boot();
