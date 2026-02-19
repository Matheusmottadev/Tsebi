const store = window.TsebiUserStore;

const productCatalog = [
  { id: "genesis-bomber", name: "Jaqueta bomber em couro italiano com forro em seda", priceLabel: "R$ 5.900", image: "images/produtos/sug1.jpeg" },
  { id: "genesis-tailored", name: "Calça de alfaiataria em sarja premium estruturada", priceLabel: "R$ 2.200", image: "images/produtos/sug4.jpeg" },
  { id: "origem-shirt", name: "Camisa em algodão croata de trama nobre", priceLabel: "R$ 1.600", image: "images/produtos/sug3.jpeg" },
  { id: "origem-skirt", name: "Saia estruturada em lã fria de acabamento impecável", priceLabel: "R$ 2.450", image: "images/produtos/sug2.jpeg" },
  { id: "atelier-bag", name: "Bolsa em couro natural com ferragens banhadas", priceLabel: "R$ 4.800", image: "images/produtos/sug1.jpeg" },
  { id: "atelier-heels", name: "Scarpin em couro envernizado de salto esculpido", priceLabel: "R$ 3.200", image: "images/produtos/sug2.jpeg" },
  { id: "flux-trench", name: "Trench coat em gabardine com corte arquitetônico", priceLabel: "R$ 3.950", image: "images/produtos/sug3.jpeg" },
  { id: "flux-knit", name: "Malha em lã merino de toque ultrafino", priceLabel: "R$ 1.980", image: "images/produtos/sug4.jpeg" },
  { id: "noir-dress", name: "Vestido coluna em crepe de seda com caimento couture", priceLabel: "R$ 4.200", image: "images/produtos/sug2.jpeg" },
  { id: "noir-sneaker", name: "Tênis em nylon técnico e couro de acabamento premium", priceLabel: "R$ 2.700", image: "images/produtos/sug1.jpeg" },
  { id: "essence-blazer", name: "Blazer em linho premium com alfaiataria de precisão", priceLabel: "R$ 3.350", image: "images/produtos/sug4.jpeg" },
  { id: "essence-trousers", name: "Calça wide leg em linho premium com prega profunda", priceLabel: "R$ 2.250", image: "images/produtos/sug3.jpeg" }
];

const steps = {
  email: document.getElementById("accountStepEmail"),
  login: document.getElementById("accountStepLogin"),
  register: document.getElementById("accountStepRegister"),
  logged: document.getElementById("accountStepLogged")
};

const emailForm = document.getElementById("accountEmailForm");
const loginForm = document.getElementById("accountLoginForm");
const registerForm = document.getElementById("accountRegisterForm");
const emailInput = document.getElementById("accountEmailInput");
const loginPasswordInput = document.getElementById("accountLoginPassword");
const registerFirstNameInput = document.getElementById("accountRegisterFirstName");
const registerLastNameInput = document.getElementById("accountRegisterLastName");
const registerCpfInput = document.getElementById("accountRegisterCpf");
const registerBirthDateInput = document.getElementById("accountRegisterBirthDate");
const registerPasswordInput = document.getElementById("accountRegisterPassword");
const loginEmailText = document.getElementById("accountLoginEmailText");
const registerEmailText = document.getElementById("accountRegisterEmailText");
const loggedTitle = document.getElementById("accountLoggedTitle");
const loggedEmail = document.getElementById("accountLoggedEmail");
const favoritesGrid = document.getElementById("accountFavoritesGrid");
const favoritesEmpty = document.getElementById("accountFavoritesEmpty");
const feedbackEl = document.getElementById("accountFeedback");
const logoutBtn = document.getElementById("accountLogoutBtn");
const backToEmailFromLogin = document.getElementById("accountBackToEmailFromLogin");
const backToEmailFromRegister = document.getElementById("accountBackToEmailFromRegister");
const accountPageBack = document.getElementById("accountPageBack");
const headerCartLink = document.querySelector('a[aria-label="Carrinho"]');

const dataName = document.getElementById("accountDataName");
const dataLastName = document.getElementById("accountDataLastName");
const dataEmail = document.getElementById("accountDataEmail");
const dataCpf = document.getElementById("accountDataCpf");
const dataBirthDate = document.getElementById("accountDataBirthDate");
const accountDataView = document.getElementById("accountDataView");
const accountDataEditForm = document.getElementById("accountDataEditForm");
const accountEditDataBtn = document.getElementById("accountEditDataBtn");
const accountEditCancelBtn = document.getElementById("accountEditCancelBtn");
const accountEditFirstName = document.getElementById("accountEditFirstName");
const accountEditLastName = document.getElementById("accountEditLastName");
const accountEditCpf = document.getElementById("accountEditCpf");
const accountEditBirthDate = document.getElementById("accountEditBirthDate");

const dashboardButtons = Array.from(document.querySelectorAll("[data-account-tab]"));
const dashboardPanels = {
  dados: document.getElementById("accountPanelDados"),
  pedidos: document.getElementById("accountPanelPedidos"),
  favoritos: document.getElementById("accountPanelFavoritos"),
  historico: document.getElementById("accountPanelHistorico")
};

let typedEmail = "";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function buildResetCodeUrl(email, cooldown = 60) {
  const params = new URLSearchParams();
  if (email) params.set("email", normalizeEmail(email));
  const safeCooldown = Math.max(0, Math.min(300, Number(cooldown) || 0));
  if (safeCooldown > 0) params.set("cooldown", String(safeCooldown));
  const query = params.toString();
  return query ? `recuperar-senha-codigo.html?${query}` : "recuperar-senha-codigo.html";
}

function formatBirthDateInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  const part1 = digits.slice(0, 2);
  const part2 = digits.slice(2, 4);
  const part3 = digits.slice(4, 8);

  if (digits.length <= 2) return part1;
  if (digits.length <= 4) return `${part1}/${part2}`;
  return `${part1}/${part2}/${part3}`;
}

function formatCpfDisplay(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length !== 11) return value || "-";
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCpfInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function syncHeaderCartBadge() {
  if (!headerCartLink) return;
  const cartKey = "tsebi-cart-v1";
  let total = 0;
  try {
    const raw = localStorage.getItem(cartKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      total = parsed.reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
    }
  } catch {}

  headerCartLink.classList.add("cart-link");
  if (total > 0) {
    headerCartLink.setAttribute("data-cart-count", String(total));
  } else {
    headerCartLink.removeAttribute("data-cart-count");
  }
}

function setFeedback(message, tone = "") {
  if (!feedbackEl) return;
  feedbackEl.textContent = message;
  feedbackEl.classList.remove("is-error", "is-success");
  if (tone) feedbackEl.classList.add(tone);
}

function showStep(stepName) {
  Object.entries(steps).forEach(([key, section]) => {
    if (!section) return;
    const active = key === stepName;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
}

function showDashboardTab(tabName) {
  dashboardButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.accountTab === tabName);
  });

  Object.entries(dashboardPanels).forEach(([key, panel]) => {
    if (!panel) return;
    const active = key === tabName;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });

  // A tela de dados sempre abre em modo leitura.
  setEditMode(false);
}

function setEditMode(enabled) {
  if (!accountDataView || !accountDataEditForm || !accountEditDataBtn) return;
  accountDataView.hidden = enabled;
  accountDataEditForm.hidden = !enabled;
  accountEditDataBtn.hidden = enabled;
}

function findUserByEmail(email) {
  const users = store?.getUsers?.() || [];
  const normalized = normalizeEmail(email);
  return users.find((user) => normalizeEmail(user.email) === normalized) || null;
}

function renderFavorites() {
  if (!favoritesGrid || !favoritesEmpty || !store) return;
  const favoriteIds = store.getFavoriteIds();
  const items = favoriteIds
    .map((id) => productCatalog.find((product) => product.id === id))
    .filter(Boolean);

  favoritesGrid.innerHTML = "";

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "account-fav-card";
    card.dataset.productId = item.id;
    card.innerHTML = `
      <div class="account-fav-media">
        <a class="account-fav-link" href="produto.html?id=${encodeURIComponent(item.id)}">
          <img src="${item.image}" alt="${item.name}" loading="lazy" decoding="async" />
        </a>
        <button class="product-favorite-btn is-active account-fav-remove" type="button" data-remove-favorite="${item.id}" aria-label="Remover dos favoritos">♥</button>
      </div>
      <a class="account-fav-link" href="produto.html?id=${encodeURIComponent(item.id)}">
        <h4>${item.name}</h4>
        <p>${item.priceLabel}</p>
      </a>
    `;
    favoritesGrid.appendChild(card);
  });

  favoritesEmpty.hidden = items.length > 0;
}

function fillMyData(user) {
  if (!user) return;
  if (dataName) dataName.textContent = user.firstName || "-";
  if (dataLastName) dataLastName.textContent = user.lastName || "-";
  if (dataEmail) dataEmail.textContent = user.email || "-";
  if (dataCpf) dataCpf.textContent = formatCpfDisplay(user.cpf || "-");
  if (dataBirthDate) dataBirthDate.textContent = user.birthDate || "-";

  if (accountEditFirstName) accountEditFirstName.value = user.firstName || "";
  if (accountEditLastName) accountEditLastName.value = user.lastName || "";
  if (accountEditCpf) accountEditCpf.value = formatCpfDisplay(user.cpf || "");
  if (accountEditBirthDate) accountEditBirthDate.value = user.birthDate || "";
}

function renderLoggedState() {
  const user = store?.getCurrentUser?.();
  if (!user) return false;
  const firstName = String(user.firstName || user.name || "").split(" ")[0] || "Cliente";
  if (loggedTitle) loggedTitle.textContent = `Olá, ${firstName}`;
  if (loggedEmail) loggedEmail.textContent = user.email || "";
  fillMyData(user);
  setEditMode(false);
  renderFavorites();
  showStep("logged");
  showDashboardTab("dados");
  setFeedback("");
  return true;
}

function handleEmailCheck(event) {
  event.preventDefault();
  typedEmail = normalizeEmail(emailInput?.value || "");
  if (!typedEmail || !typedEmail.includes("@")) {
    setFeedback("Insira um e-mail válido.", "is-error");
    return;
  }

  setFeedback("");
  const existingUser = findUserByEmail(typedEmail);
  if (existingUser) {
    if (loginEmailText) loginEmailText.textContent = typedEmail;
    if (loginPasswordInput) loginPasswordInput.value = "";
    showStep("login");
    loginPasswordInput?.focus();
    return;
  }

  if (registerEmailText) registerEmailText.textContent = typedEmail;
  if (registerFirstNameInput) registerFirstNameInput.value = "";
  if (registerLastNameInput) registerLastNameInput.value = "";
  if (registerCpfInput) registerCpfInput.value = "";
  if (registerBirthDateInput) registerBirthDateInput.value = "";
  if (registerPasswordInput) registerPasswordInput.value = "";
  showStep("register");
  registerFirstNameInput?.focus();
}

async function handleLogin(event) {
  event.preventDefault();
  if (!store) return;
  const password = String(loginPasswordInput?.value || "");
  const result = await store.login({ email: typedEmail, password });
  if (!result.ok) {
    setFeedback(result.error || "Não foi possível entrar.", "is-error");
    return;
  }
  if (result.stage === "password_reset_required") {
    setFeedback(`Senha temporária detectada. Enviamos um código para ${typedEmail}.`, "is-error");
    window.setTimeout(() => {
      window.location.href = buildResetCodeUrl(typedEmail, 60);
    }, 600);
    return;
  }
  setFeedback("Login realizado com sucesso.", "is-success");
  renderLoggedState();
}

function handleRegister(event) {
  event.preventDefault();
  if (!store) return;
  const firstName = String(registerFirstNameInput?.value || "").trim();
  const lastName = String(registerLastNameInput?.value || "").trim();
  const cpf = String(registerCpfInput?.value || "").trim();
  const birthDate = String(registerBirthDateInput?.value || "").trim();
  const password = String(registerPasswordInput?.value || "");

  const created = store.createUser({
    firstName,
    lastName,
    cpf,
    birthDate,
    email: typedEmail,
    password
  });

  if (!created.ok) {
    setFeedback(created.error || "Não foi possível criar sua conta.", "is-error");
    return;
  }

  store.login({ email: typedEmail, password });
  setFeedback("Conta criada com sucesso.", "is-success");
  renderLoggedState();
}

function goToEmailStep() {
  setFeedback("");
  showStep("email");
  emailInput?.focus();
}

function getSafeBackTarget() {
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin === window.location.origin && !referrer.pathname.toLowerCase().endsWith("conta.html")) {
      return `${referrer.pathname}${referrer.search}${referrer.hash}`;
    }
  } catch {}
  return "";
}

if (!store) {
  setFeedback("Sistema de conta indisponível.", "is-error");
} else if (!renderLoggedState()) {
  showStep("email");
}

syncHeaderCartBadge();

emailForm?.addEventListener("submit", handleEmailCheck);
loginForm?.addEventListener("submit", handleLogin);
registerForm?.addEventListener("submit", handleRegister);
backToEmailFromLogin?.addEventListener("click", goToEmailStep);
backToEmailFromRegister?.addEventListener("click", goToEmailStep);
registerBirthDateInput?.addEventListener("input", () => {
  registerBirthDateInput.value = formatBirthDateInput(registerBirthDateInput.value);
});
accountEditBirthDate?.addEventListener("input", () => {
  accountEditBirthDate.value = formatBirthDateInput(accountEditBirthDate.value);
});
accountEditCpf?.addEventListener("input", () => {
  accountEditCpf.value = formatCpfInput(accountEditCpf.value);
});

dashboardButtons.forEach((button) => {
  button.addEventListener("click", () => {
    showDashboardTab(button.dataset.accountTab || "dados");
  });
});

favoritesGrid?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const removeBtn = target.closest("[data-remove-favorite]");
  if (!removeBtn) return;
  event.preventDefault();
  event.stopPropagation();
  const productId = removeBtn.getAttribute("data-remove-favorite");
  if (!productId || !store) return;
  store.toggleFavorite(productId);
  renderFavorites();
});

document.querySelectorAll(".account-list-item-clickable").forEach((item) => {
  item.addEventListener("click", () => {
    item.classList.toggle("is-open");
  });
});

accountEditDataBtn?.addEventListener("click", () => {
  setEditMode(true);
  accountEditFirstName?.focus();
});

accountEditCancelBtn?.addEventListener("click", () => {
  const user = store?.getCurrentUser?.();
  fillMyData(user);
  setEditMode(false);
});

accountDataEditForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!store) return;

  const firstName = String(accountEditFirstName?.value || "").trim();
  const lastName = String(accountEditLastName?.value || "").trim();
  const cpf = String(accountEditCpf?.value || "").trim();
  const birthDate = String(accountEditBirthDate?.value || "").trim();

  if (firstName.length < 2 || lastName.length < 2) {
    setFeedback("Nome e sobrenome são obrigatórios.", "is-error");
    return;
  }

  const result = store.updateCurrentUser?.({
    firstName,
    lastName,
    cpf,
    birthDate
  });

  if (!result || !result.ok) {
    setFeedback(result?.error || "Não foi possível salvar seus dados.", "is-error");
    return;
  }

  fillMyData(result.user);
  setEditMode(false);
  renderLoggedState();
  setFeedback("Dados atualizados com sucesso.", "is-success");
});

logoutBtn?.addEventListener("click", () => {
  if (!store) return;
  store.logout();
  typedEmail = "";
  if (emailInput) emailInput.value = "";
  goToEmailStep();
});

accountPageBack?.addEventListener("click", () => {
  const safeBackTarget = getSafeBackTarget();
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  if (safeBackTarget) {
    window.location.href = safeBackTarget;
    return;
  }
  window.location.href = "index.html";
});
