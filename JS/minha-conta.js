const store = window.TsebiUserStore;

const titleEl = document.getElementById("myAccountTitle");
const emailEl = document.getElementById("myAccountEmail");
const profileNameInput = document.getElementById("profileName");
const profileBirthDateInput = document.getElementById("profileBirthDate");
const profileCpfInput = document.getElementById("profileCpf");
const profileCepInput = document.getElementById("profileCep");
const profileForm = document.getElementById("profileForm");
const trackOrderResult = document.getElementById("trackOrderResult");
const trackingPublicSearch = document.getElementById("trackingPublicSearch");
const trackingAccountOrdersWrap = document.getElementById("trackingAccountOrdersWrap");
const trackingOrdersList = document.getElementById("trackingOrdersList");
const trackingLoading = document.getElementById("trackingLoading");
const trackingEmptyState = document.getElementById("trackingEmptyState");
const publicTrackForm = document.getElementById("publicTrackForm");
const publicTrackOrderNumberInput = document.getElementById("publicTrackOrderNumber");
const publicTrackEmailInput = document.getElementById("publicTrackEmail");
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

const ACCOUNT_PANEL_NAMES = new Set(["track", "history", "profile", "addresses", "favorites"]);
const TRACKING_STEPS = [
  "ORDER_PLACED",
  "PROCESSING",
  "SHIPPED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELED"
];

let myOrders = [];
let myAddresses = [];
let trackingOrders = [];
let selectedTrackingOrderKey = "";
let defaultAddressId = "";
let currentUser = null;
let isPublicTrackMode = false;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function formatTrackingStatus(status) {
  const value = String(status || "").toUpperCase();
  if (value === "ORDER_PLACED") return "Pedido Recebido";
  if (value === "PROCESSING") return "Pedido Confirmado";
  if (value === "SHIPPED") return "Em Preparação";
  if (value === "IN_TRANSIT") return "Em transporte";
  if (value === "OUT_FOR_DELIVERY") return "Saiu Pra entregar";
  if (value === "DELIVERED") return "Entregue";
  if (value === "CANCELED") return "Cancelado";
  return "Em transporte";
}

function formatTrackingStepName(step) {
  if (step === "ORDER_PLACED") return "Pedido Recebido";
  if (step === "PROCESSING") return "Pedido Confirmado";
  if (step === "SHIPPED") return "Em Preparação";
  if (step === "IN_TRANSIT") return "Em transporte";
  if (step === "OUT_FOR_DELIVERY") return "Saiu Pra entregar";
  if (step === "DELIVERED") return "Entregue";
  if (step === "CANCELED") return "Cancelado";
  return step;
}

function resolveTimelineStatus(order) {
  const orderStatus = String(order?.status || "").trim().toLowerCase();
  if (orderStatus === "canceled" || orderStatus === "refunded" || orderStatus === "failed") {
    return "CANCELED";
  }
  return String(order?.currentStatus || "").toUpperCase();
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
  const orderNumber = String(order?.orderNumber || "").trim();
  if (orderNumber) return orderNumber;
  const rawId = String(order?.id || "").trim();
  if (!rawId) return "-";
  const compact = normalizeOrderIdentifier(rawId);
  const shortCode = compact.slice(-10) || compact;
  return `PED-${shortCode}`;
}

function normalizePanelName(value) {
  const panelName = String(value || "").trim().toLowerCase();
  return ACCOUNT_PANEL_NAMES.has(panelName) ? panelName : "";
}

function getInitialPanelFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = normalizePanelName(params.get("panel"));
  if (fromQuery) return fromQuery;

  const fromHash = normalizePanelName(String(window.location.hash || "").replace(/^#/, ""));
  if (fromHash) return fromHash;

  return "track";
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

function setTrackingLoading(isLoading) {
  if (!trackingLoading) return;
  trackingLoading.hidden = !isLoading;
}

function setTrackingEmptyState(message = "") {
  if (!trackingEmptyState) return;
  if (!message) {
    trackingEmptyState.hidden = true;
    trackingEmptyState.textContent = "";
    return;
  }

  trackingEmptyState.hidden = false;
  trackingEmptyState.textContent = message;
}

function clearTrackingResult() {
  if (!trackOrderResult) return;
  trackOrderResult.hidden = true;
  trackOrderResult.innerHTML = "";
}

function formatTrackingDate(dateValue) {
  const date = new Date(dateValue || "");
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function buildTimelineMarkup(currentStatus) {
  const status = String(currentStatus || "").toUpperCase();
  const activeIndex = Math.max(0, TRACKING_STEPS.indexOf(status));

  return TRACKING_STEPS.map((step, index) => {
    let stateClass = "is-pending";
    if (index < activeIndex) stateClass = "is-complete";
    if (index === activeIndex) stateClass = "is-active";

    return `
      <li class="tracking-step ${stateClass}">
        <span class="tracking-step-dot" aria-hidden="true"></span>
        <span class="tracking-step-name">${escapeHtml(formatTrackingStepName(step))}</span>
      </li>
    `;
  }).join("");
}

function renderTrackingOrder(order) {
  if (!trackOrderResult) return;
  if (!order) {
    clearTrackingResult();
    return;
  }

  const orderNumber = formatOrderDisplayId(order);
  const timelineStatus = resolveTimelineStatus(order);
  const statusLabel = formatTrackingStatus(timelineStatus);
  const items = Array.isArray(order.items) ? order.items : [];

  const itemsMarkup = items.length
    ? items
        .map((item) => {
          const image = String(item.image || "images/produtos/sug1.jpeg").trim() || "images/produtos/sug1.jpeg";
          return `
            <article class="tracking-item">
              <img class="tracking-item-image" src="${escapeHtml(image)}" alt="${escapeHtml(item.name || "Item")}" loading="lazy" />
              <p class="tracking-item-name">${escapeHtml(item.name || item.id || "Item")}</p>
              <p class="tracking-item-qty">QTY ${escapeHtml(String(item.qty || 1))}</p>
            </article>
          `;
        })
        .join("")
    : `<p class="tracking-event-description">Nenhum item encontrado.</p>`;

  trackOrderResult.hidden = false;
  trackOrderResult.innerHTML = `
    <section class="tracking-order-main">
      <div class="tracking-order-main-grid">
        <article class="tracking-main-field">
          <span>Número do pedido</span>
          <strong>${escapeHtml(orderNumber)}</strong>
        </article>
        <article class="tracking-main-field">
          <span>Data da compra</span>
          <em>${escapeHtml(formatTrackingDate(order.purchaseDate))}</em>
        </article>
        <article class="tracking-main-field">
          <span>Status atual</span>
          <span class="tracking-status-badge">${escapeHtml(statusLabel)}</span>
        </article>
        <article class="tracking-main-field">
          <span>Transportadora</span>
          <em>${escapeHtml(order.carrier || "Melhor Envio")}</em>
        </article>
        <article class="tracking-main-field">
          <span>Código de rastreio</span>
          <em>${escapeHtml(order.trackingCode || "Aguardando")}</em>
        </article>
        <article class="tracking-main-field">
          <span>Última atualização</span>
          <em>${escapeHtml(formatTrackingDate(order.lastTrackingUpdate || order.updatedAt || order.purchaseDate))}</em>
        </article>
      </div>
    </section>

    <section class="tracking-timeline-card">
      <h3 class="tracking-section-title">Timeline</h3>
      <ol class="tracking-timeline">
        ${buildTimelineMarkup(timelineStatus)}
      </ol>
    </section>

    <section class="tracking-items-card">
      <h3 class="tracking-section-title">Itens do pedido</h3>
      <div class="tracking-items-list">
        ${itemsMarkup}
      </div>
    </section>
  `;
}

function renderTrackingOrderChips(orders) {
  if (!trackingOrdersList) return;
  trackingOrdersList.innerHTML = "";

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const key = String(order.orderNumber || order.id || "").trim();
    if (!key) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "tracking-order-chip";
    button.setAttribute("data-order-key", key);
    button.textContent = formatOrderDisplayId(order);
    button.classList.toggle("is-active", key === selectedTrackingOrderKey);
    button.addEventListener("click", () => {
      const email = String(order.email || currentUser?.email || "").trim();
      if (!email) return;
      loadTrackingOrderByLookup(key, email);
    });

    trackingOrdersList.appendChild(button);
  });
}

function markActiveTrackingChip(orderKey) {
  const key = String(orderKey || "").trim();
  Array.from(trackingOrdersList?.querySelectorAll(".tracking-order-chip") || []).forEach((node) => {
    const active = String(node.getAttribute("data-order-key") || "") === key;
    node.classList.toggle("is-active", active);
  });
}

async function loadTrackingOrderByLookup(orderNumber, email) {
  setFeedback("");
  setTrackingEmptyState("");
  clearTrackingResult();
  setTrackingLoading(true);

  const result = await store.fetchTrackOrderByNumberAndEmail(orderNumber, email);

  setTrackingLoading(false);

  if (!result.ok || !result.order) {
    setTrackingEmptyState("Não foi possível localizar este pedido.");
    setFeedback(result.error || "Pedido não encontrado.", true);
    return;
  }

  selectedTrackingOrderKey = String(result.order.orderNumber || result.order.id || orderNumber || "").trim();
  markActiveTrackingChip(selectedTrackingOrderKey);
  renderTrackingOrder(result.order);
  setFeedback("Rastreio atualizado.");
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
    <p class="account-order-title">Pedido #${escapeHtml(formatOrderDisplayId(order))}</p>
    <p>Status: ${escapeHtml(formatOrderStatus(order.status))}</p>
    <p>Total: ${escapeHtml(formatCurrencyFromCents(order.amount, order.currency))}</p>
    <p>Data: ${escapeHtml(formatOrderDate(order.createdAt))}</p>
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
      <p class="account-order-title">${escapeHtml(address.label)}</p>
      <p>${escapeHtml(address.fullName)}</p>
      <p>${escapeHtml(address.street)}, ${escapeHtml(address.number)}${address.complement ? ` - ${escapeHtml(address.complement)}` : ""}</p>
      <p>${escapeHtml(address.district)} - ${escapeHtml(address.city)}/${escapeHtml(address.state)}</p>
      <p>CEP: ${escapeHtml(formatCep(address.cep))}</p>
      <div class="account-address-item-actions">
        <button type="button" data-address-action="default" data-address-id="${escapeHtml(address.id)}" ${address.isDefault ? "disabled" : ""}>${address.isDefault ? "Padrão" : "Definir padrão"}</button>
        <button type="button" data-address-action="edit" data-address-id="${escapeHtml(address.id)}">Editar</button>
        <button type="button" data-address-action="delete" data-address-id="${escapeHtml(address.id)}">Excluir</button>
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

async function loadTrackingOrdersForAccount() {
  const result = await store.fetchTrackingOrders();
  if (!result.ok) {
    trackingOrders = [];
    renderTrackingOrderChips([]);
    setTrackingEmptyState("Não foi possível carregar seus pedidos para rastreamento.");
    setFeedback(result.error || "Não foi possível carregar o rastreio.", true);
    return;
  }

  trackingOrders = Array.isArray(result.orders) ? result.orders : [];
  if (!trackingOrders.length) {
    renderTrackingOrderChips([]);
    setTrackingEmptyState("Você ainda não possui pedidos com rastreamento disponível.");
    clearTrackingResult();
    return;
  }

  if (trackingAccountOrdersWrap) trackingAccountOrdersWrap.hidden = false;
  renderTrackingOrderChips(trackingOrders);

  const selected =
    trackingOrders.find((order) => String(order.orderNumber || order.id || "") === selectedTrackingOrderKey) ||
    trackingOrders[0];

  selectedTrackingOrderKey = String(selected.orderNumber || selected.id || "");
  markActiveTrackingChip(selectedTrackingOrderKey);
  await loadTrackingOrderByLookup(selectedTrackingOrderKey, String(selected.email || currentUser?.email || ""));
}

async function handlePublicTrackSubmit(event) {
  event.preventDefault();
  const orderNumber = String(publicTrackOrderNumberInput?.value || "").trim();
  const email = String(publicTrackEmailInput?.value || "").trim();

  if (!orderNumber || !email) {
    setFeedback("Informe o número do pedido e o e-mail.", true);
    return;
  }

  await loadTrackingOrderByLookup(orderNumber, email);
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

function enterPublicTrackMode() {
  isPublicTrackMode = true;
  document.body.classList.add("is-public-track-mode");
  activatePanel("track");

  navButtons.forEach((button) => {
    button.hidden = button.dataset.panel !== "track";
  });

  if (trackingPublicSearch) trackingPublicSearch.hidden = false;
  if (trackingAccountOrdersWrap) trackingAccountOrdersWrap.hidden = true;
  if (logoutBtn) logoutBtn.hidden = true;
  if (titleEl) titleEl.textContent = "Acompanhar pedido";
  if (emailEl) emailEl.textContent = "Consulte seu pedido sem login";

  const params = new URLSearchParams(window.location.search);
  const orderNumber = String(params.get("orderNumber") || "").trim();
  const email = String(params.get("email") || "").trim();
  if (orderNumber && publicTrackOrderNumberInput) publicTrackOrderNumberInput.value = orderNumber;
  if (email && publicTrackEmailInput) publicTrackEmailInput.value = email;
}

async function boot() {
  if (!store) {
    setFeedback("Serviço de conta indisponível.", true);
    return;
  }

  const initialPanel = getInitialPanelFromLocation();
  activatePanel(initialPanel);

  const me = await store.fetchMe();
  const isAuthenticated = Boolean(me.ok && me.user);

  if (!isAuthenticated) {
    if (initialPanel !== "track") {
      window.location.href = "conta.html";
      return;
    }

    enterPublicTrackMode();
    return;
  }

  currentUser = me.user;
  renderUser(me.user);
  await Promise.all([loadOrders(), loadAddresses()]);

  if (trackingPublicSearch) trackingPublicSearch.hidden = true;
  if (trackingAccountOrdersWrap) trackingAccountOrdersWrap.hidden = false;

  if (initialPanel === "track") {
    await loadTrackingOrdersForAccount();
  }
}

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const panelName = button.dataset.panel || "track";
    if (isPublicTrackMode && panelName !== "track") return;
    activatePanel(panelName);
    if (!isPublicTrackMode && panelName === "track") {
      loadTrackingOrdersForAccount();
    }
  });
});

profileForm?.addEventListener("submit", handleProfileUpdate);
publicTrackForm?.addEventListener("submit", handlePublicTrackSubmit);
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
