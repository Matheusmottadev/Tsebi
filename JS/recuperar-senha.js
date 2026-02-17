const store = window.TsebiUserStore;

const requestForm = document.getElementById("resetRequestForm");
const resetFeedback = document.getElementById("resetFeedback");
const emailInput = document.getElementById("resetEmailInput");

function getQueryEmail() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("email") || "").trim().toLowerCase();
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

function buildVerifyStepUrl(email) {
  const params = new URLSearchParams();
  params.set("email", String(email || "").trim().toLowerCase());
  params.set("cooldown", "60");
  return `recuperar-senha-codigo.html?${params.toString()}`;
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
  const result = await store.requestPasswordReset(email);
  setFormLoading(requestForm, false);

  if (!result.ok) {
    setFeedback(result.error || "Nao foi possivel enviar o codigo.", true);
    return;
  }

  setFeedback(`Enviamos um codigo de redefinicao para ${email}.${codeHint(result.devCode)}`);
  window.location.href = buildVerifyStepUrl(email);
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

  requestForm?.addEventListener("submit", handleRequestSubmit);
}

boot();
