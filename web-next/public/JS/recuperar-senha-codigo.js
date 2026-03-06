const store = window.TsebiUserStore;

const verifyForm = document.getElementById("resetVerifyForm");
const resetFeedback = document.getElementById("resetFeedback");
const resetCodeFlowNote = document.getElementById("resetCodeFlowNote");

const codeInput = document.getElementById("resetCodeInput");
const passwordInput = document.getElementById("resetPasswordInput");
const passwordConfirmInput = document.getElementById("resetPasswordConfirmInput");
const resendButton = document.getElementById("resendResetCodeBtn");

let selectedEmail = "";
let resendSecondsLeft = 0;
let resendTimer = null;

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

function maskEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const at = normalized.indexOf("@");
  if (at <= 1) return normalized;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${local.slice(0, 2)}***@${domain}`;
}

function getQueryEmail() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("email") || "").trim().toLowerCase();
}

function getQueryCooldown() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get("cooldown") || 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(300, Math.floor(value)));
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
    if (resendSecondsLeft <= 0) stopResendTimer();
  }, 1000);
}

async function handleVerifySubmit(event) {
  event.preventDefault();
  if (!store) return;

  const code = normalizeDigits(codeInput?.value || "", 6);
  const password = String(passwordInput?.value || "");
  const passwordConfirm = String(passwordConfirmInput?.value || "");

  if (!isValidEmail(selectedEmail)) {
    setFeedback("Sessao de recuperacao invalida. Volte e solicite novo codigo.", true);
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
    setFeedback("As senhas não coincidem.", true);
    return;
  }

  setFormLoading(verifyForm, true);
  const result = await store.verifyPasswordResetCode({
    email: selectedEmail,
    code,
    password
  });
  setFormLoading(verifyForm, false);

  if (!result.ok) {
    setFeedback(result.error || "Nao foi possivel redefinir a senha.", true);
    return;
  }

  setFeedback("Senha redefinida com sucesso. Redirecionando para o login.");
  window.setTimeout(() => {
    window.location.href = "conta.html";
  }, 1200);
}

async function handleResendClick() {
  if (!store) return;
  if (resendSecondsLeft > 0) return;

  if (!isValidEmail(selectedEmail)) {
    setFeedback("Sessao de recuperacao invalida. Volte e solicite novo codigo.", true);
    return;
  }

  const sent = await store.requestPasswordReset(selectedEmail);
  if (!sent.ok) {
    setFeedback(sent.error || "Nao foi possivel reenviar codigo.", true);
    return;
  }

  startResendTimer(60);
  setFeedback(`Codigo reenviado para ${selectedEmail}.${codeHint(sent.devCode)}`);
}

function boot() {
  if (!store) {
    setFeedback("Servico de conta indisponivel.", true);
    return;
  }

  selectedEmail = getQueryEmail();
  if (!isValidEmail(selectedEmail)) {
    window.location.href = "recuperar-senha.html";
    return;
  }

  if (resetCodeFlowNote) {
    resetCodeFlowNote.textContent = `Codigo enviado para ${maskEmail(selectedEmail)}. Informe o codigo e sua nova senha.`;
  }

  verifyForm?.addEventListener("submit", handleVerifySubmit);
  resendButton?.addEventListener("click", handleResendClick);

  codeInput?.focus();
  startResendTimer(getQueryCooldown() || 60);
}

boot();
