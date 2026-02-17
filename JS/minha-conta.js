const store = window.TsebiUserStore;

const titleEl = document.getElementById("myAccountTitle");
const emailEl = document.getElementById("myAccountEmail");
const profileNameInput = document.getElementById("profileName");
const profileBirthDateInput = document.getElementById("profileBirthDate");
const profileCpfInput = document.getElementById("profileCpf");
const profileCepInput = document.getElementById("profileCep");
const profileForm = document.getElementById("profileForm");
const trackOrderForm = document.getElementById("trackOrderForm");
const trackOrderIdInput = document.getElementById("trackOrderId");
const trackOrderResult = document.getElementById("trackOrderResult");
const ordersList = document.getElementById("ordersList");
const ordersEmpty = document.getElementById("ordersEmpty");
const feedbackEl = document.getElementById("accountFeedback");
const logoutBtn = document.getElementById("logoutBtn");

const navButtons = Array.from(document.querySelectorAll(".account-nav-btn"));
const panels = Array.from(document.querySelectorAll(".account-panel"));

const addressForm = document.getElementById("addressForm");
const addressIdInput = document.getElementById("addressId");
const addressLabelInput = document.getElementById("addressLabel");
const addressFullNameInput = document.getElementById("addressFullName");
const addressCepInput = document.getElementById("addressCep");
const addressStreetInput = document.getElementById("addressStreet");
const addressNumberInput = document.getElementById("addressNumber");
const addressComplementInput = document.getElementById("addressComplement");
const addressDistrictInput = document.getElementById("addressDistrict");
const addressCityInput = document.getElementById("addressCity");
const addressStateInput = document.getElementById("addressState");
const cancelAddressEditBtn = document.getElementById("cancelAddressEditBtn");
const addressesList = document.getElementById("addressesList");
const addressesEmpty = document.getElementById("addressesEmpty");

let myOrders = [];
let myAddresses = [];
let defaultAddressId = "";

function formatCurrencyFromCents(value, currency = "brl") {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: String(currency || "brl").toUpperCase()
  });
}

function formatOrderStatus(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return "Pago";
  if (s === "failed") return "Falhou";
  if (s === "canceled") return "Cancelado";
  if (s === "refunded") return "Reembolsado";
  if (s === "pending_payment") return "Aguardando pagamento";
  if (s === "processing") return "Processando";
  return s || "N/A";
}

function formatOrderDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function normalizeOrderIdentifier(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatOrderDisplayId(order) {
  const rawId = String(order?.id || "").trim();
  if (!rawId) return "-";
  const compact = normalizeOrderIdentifier(rawId);
  const shortCode = compact.slice(-8) || compact;
  return `PED-${shortCode}`;
}

function orderMatchesIdentifier(order, input) {
  const search = normalizeOrderIdentifier(input);
  if (!search) return false;
  const full = normalizeOrderIdentifier(order?.id);
  if (!full) return false;
  const shortCode = full.slice(-8);
  return search === full || search === shortCode || search === `PED${shortCode}`;
}

function setFeedback(message, isError = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message || "";
  feedbackEl.style.color = isError ? "#991b1b" : "#1d6a2d";
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

function normalizeBirthDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function activatePanel(name) {
  navButtons.forEach((button) => {
    const active = button.dataset.panel === name;
    button.classList.toggle("is-active", active);
  });

  panels.forEach((panel) => {
    const active = panel.dataset.panel === name;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });
}

function renderUser(user) {
  const name = String(user?.name || "Cliente");
  const firstName = name.split(/\s+/)[0] || "Cliente";
  if (titleEl) titleEl.textContent = `Olá, ${firstName}`;
  if (emailEl) emailEl.textContent = user?.email || "";

  if (profileNameInput) profileNameInput.value = name;

  const birthDate = normalizeBirthDate(user?.birthDate);
  if (profileBirthDateInput) {
    profileBirthDateInput.value = birthDate;
    profileBirthDateInput.readOnly = Boolean(birthDate);
  }

  const cpfValue = formatCpf(String(user?.cpf || ""));
  if (profileCpfInput) {
    profileCpfInput.value = cpfValue;
    profileCpfInput.readOnly = Boolean(cpfValue);
  }
  if (profileCepInput) profileCepInput.value = formatCep(String(user?.cep || ""));
}

function renderOrderCard(order) {
  const article = document.createElement("article");
  article.className = "account-order-item";
  article.innerHTML = `
    <p class="account-order-title">Pedido #${formatOrderDisplayId(order)}</p>
    <p>Status: ${formatOrderStatus(order.status)}</p>
    <p>Total: ${formatCurrencyFromCents(order.amount, order.currency)}</p>
    <p>Data: ${formatOrderDate(order.createdAt)}</p>
    <p><a href="order.html?orderId=${encodeURIComponent(order.id)}">Ver detalhes</a></p>
  `;
  return article;
}

function renderOrders(orders) {
  if (!ordersList || !ordersEmpty) return;
  ordersList.innerHTML = "";

  if (!orders || orders.length === 0) {
    ordersEmpty.hidden = false;
    return;
  }

  ordersEmpty.hidden = true;
  orders.forEach((order) => {
    ordersList.appendChild(renderOrderCard(order));
  });
}

function renderTrackedOrder(order) {
  if (!trackOrderResult) return;
  if (!order) {
    trackOrderResult.hidden = true;
    trackOrderResult.innerHTML = "";
    return;
  }

  trackOrderResult.hidden = false;
  trackOrderResult.innerHTML = "";
  trackOrderResult.appendChild(renderOrderCard(order));
}

function readAddressForm() {
  return {
    label: String(addressLabelInput?.value || "").trim(),
    fullName: String(addressFullNameInput?.value || "").trim(),
    cep: normalizeDigits(addressCepInput?.value || "", 8),
    street: String(addressStreetInput?.value || "").trim(),
    number: String(addressNumberInput?.value || "").trim(),
    complement: String(addressComplementInput?.value || "").trim(),
    district: String(addressDistrictInput?.value || "").trim(),
    city: String(addressCityInput?.value || "").trim(),
    state: String(addressStateInput?.value || "").trim().toUpperCase().slice(0, 2)
  };
}

function isValidAddress(address) {
  return Boolean(
    address.label &&
      address.fullName &&
      /^\d{8}$/.test(address.cep) &&
      address.street &&
      address.number &&
      address.district &&
      address.city &&
      /^[A-Z]{2}$/.test(address.state)
  );
}

function clearAddressForm() {
  if (addressForm) addressForm.reset();
  if (addressIdInput) addressIdInput.value = "";
  if (cancelAddressEditBtn) cancelAddressEditBtn.hidden = true;
}

function fillAddressForm(address) {
  if (!address) return;
  if (addressIdInput) addressIdInput.value = String(address.id || "");
  if (addressLabelInput) addressLabelInput.value = String(address.label || "");
  if (addressFullNameInput) addressFullNameInput.value = String(address.fullName || "");
  if (addressCepInput) addressCepInput.value = formatCep(String(address.cep || ""));
  if (addressStreetInput) addressStreetInput.value = String(address.street || "");
  if (addressNumberInput) addressNumberInput.value = String(address.number || "");
  if (addressComplementInput) addressComplementInput.value = String(address.complement || "");
  if (addressDistrictInput) addressDistrictInput.value = String(address.district || "");
  if (addressCityInput) addressCityInput.value = String(address.city || "");
  if (addressStateInput) addressStateInput.value = String(address.state || "");
  if (cancelAddressEditBtn) cancelAddressEditBtn.hidden = false;
}

function renderAddresses() {
  if (!addressesList || !addressesEmpty) return;
  addressesList.innerHTML = "";

  if (!myAddresses.length) {
    addressesEmpty.hidden = false;
    return;
  }

  addressesEmpty.hidden = true;

  myAddresses.forEach((address) => {
    const article = document.createElement("article");
    article.className = "account-address-item";
    article.innerHTML = `
      <p class="account-order-title">${address.label}</p>
      <p>${address.fullName}</p>
      <p>${address.street}, ${address.number}${address.complement ? ` - ${address.complement}` : ""}</p>
      <p>${address.district} - ${address.city}/${address.state}</p>
      <p>CEP: ${formatCep(address.cep)}</p>
      <div class="account-address-item-actions">
        <button type="button" data-address-action="default" data-address-id="${address.id}" ${address.isDefault ? "disabled" : ""}>${address.isDefault ? "Padrão" : "Definir padrão"}</button>
        <button type="button" data-address-action="edit" data-address-id="${address.id}">Editar</button>
        <button type="button" data-address-action="delete" data-address-id="${address.id}">Excluir</button>
      </div>
    `;
    addressesList.appendChild(article);
  });
}

function applyAddressState(payload) {
  myAddresses = Array.isArray(payload.addresses) ? payload.addresses : [];
  defaultAddressId = String(payload.defaultAddressId || "");
  renderAddresses();
}

async function loadOrders() {
  const result = await store.fetchMyOrders();
  if (!result.ok) {
    myOrders = [];
    renderOrders([]);
    setFeedback(result.error || "Não foi possível carregar seus pedidos.", true);
    return;
  }

  myOrders = Array.isArray(result.orders) ? result.orders : [];
  renderOrders(myOrders);
}

async function loadAddresses() {
  const result = await store.fetchMyAddresses();
  if (!result.ok) {
    myAddresses = [];
    renderAddresses();
    setFeedback(result.error || "Não foi possível carregar endereços.", true);
    return;
  }

  applyAddressState(result);
}

async function handleTrackOrder(event) {
  event.preventDefault();
  const orderId = String(trackOrderIdInput?.value || "").trim();
  if (!orderId) {
    setFeedback("Informe o número do pedido.", true);
    return;
  }

  const fromList = myOrders.find((order) => orderMatchesIdentifier(order, orderId));
  if (fromList) {
    renderTrackedOrder(fromList);
    setFeedback("Pedido encontrado.");
    return;
  }

  const result = await store.fetchMyOrder(orderId);
  if (!result.ok || !result.order) {
    renderTrackedOrder(null);
    setFeedback("Pedido não encontrado na sua conta.", true);
    return;
  }

  renderTrackedOrder(result.order);
  setFeedback("Pedido encontrado.");
}

async function handleProfileUpdate(event) {
  event.preventDefault();

  const name = String(profileNameInput?.value || "").trim();
  const birthDate = normalizeBirthDate(profileBirthDateInput?.value || "");
  const cpf = normalizeDigits(profileCpfInput?.value || "", 11);
  const cep = normalizeDigits(profileCepInput?.value || "", 8);

  if (!name || !birthDate || cpf.length !== 11 || cep.length !== 8) {
    setFeedback("Preencha nome, data de nascimento, CPF e CEP válidos.", true);
    return;
  }

  const result = await store.updateMyProfile({ name, birthDate, cpf, cep });
  if (!result.ok) {
    setFeedback(result.error || "Não foi possível atualizar seu perfil.", true);
    return;
  }

  renderUser(result.user);
  setFeedback("Dados salvos com sucesso.");
}

async function handleAddressSubmit(event) {
  event.preventDefault();

  const payload = readAddressForm();
  if (!isValidAddress(payload)) {
    setFeedback("Preencha todos os campos obrigatórios do endereço.", true);
    return;
  }

  const editingId = String(addressIdInput?.value || "").trim();
  const result = editingId
    ? await store.updateMyAddress(editingId, payload)
    : await store.createMyAddress(payload);

  if (!result.ok) {
    setFeedback(result.error || "Não foi possível salvar endereço.", true);
    return;
  }

  applyAddressState(result);
  clearAddressForm();
  setFeedback(editingId ? "Endereço atualizado." : "Endereço adicionado.");
}

async function handleAddressAction(event) {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const action = target.dataset.addressAction;
  const addressId = String(target.dataset.addressId || "").trim();
  if (!action || !addressId) return;

  if (action === "edit") {
    const address = myAddresses.find((item) => item.id === addressId);
    if (!address) return;
    fillAddressForm(address);
    return;
  }

  if (action === "default") {
    const result = await store.setMyAddressDefault(addressId);
    if (!result.ok) {
      setFeedback(result.error || "Não foi possível definir endereço padrão.", true);
      return;
    }
    applyAddressState(result);
    setFeedback("Endereço padrão atualizado.");
    return;
  }

  if (action === "delete") {
    const confirmDelete = window.confirm("Deseja remover este endereço?");
    if (!confirmDelete) return;

    const result = await store.deleteMyAddress(addressId);
    if (!result.ok) {
      setFeedback(result.error || "Não foi possível remover endereço.", true);
      return;
    }

    applyAddressState(result);
    clearAddressForm();
    setFeedback("Endereço removido.");
  }
}

async function handleLogout() {
  await store.logout();
  window.location.href = "conta.html";
}

async function boot() {
  if (!store) {
    setFeedback("Serviço de conta indisponível.", true);
    return;
  }

  const me = await store.fetchMe();
  if (!me.ok || !me.user) {
    window.location.href = "conta.html";
    return;
  }

  renderUser(me.user);
  await Promise.all([loadOrders(), loadAddresses()]);
  activatePanel("track");
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const panelName = button.dataset.panel || "track";
    activatePanel(panelName);
  });
});

profileForm?.addEventListener("submit", handleProfileUpdate);
trackOrderForm?.addEventListener("submit", handleTrackOrder);
addressForm?.addEventListener("submit", handleAddressSubmit);
addressesList?.addEventListener("click", handleAddressAction);
cancelAddressEditBtn?.addEventListener("click", clearAddressForm);
logoutBtn?.addEventListener("click", handleLogout);

profileCpfInput?.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.value = formatCpf(input.value);
});

profileCepInput?.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.value = formatCep(input.value);
});

addressCepInput?.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.value = formatCep(input.value);
});

addressStateInput?.addEventListener("input", (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  input.value = String(input.value || "").replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 2);
});

boot();
