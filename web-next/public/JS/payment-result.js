const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 2 * 60 * 1000;
const cartKey = "tsebi-cart-v1";
const CHECKOUT_TRACKING_KEY = "tsebi-checkout-tracking";
const LAST_ORDER_ID_KEY = "tsebi_last_order_id";
const LAST_ORDER_EMAIL_KEY = "tsebi_last_order_email";
const LAST_ORDER_NUMBER_KEY = "tsebi_last_order_number";

const loaderEl = document.getElementById("paymentLoader");
const contentEl = document.getElementById("paymentResultContent");
const kickerEl = document.getElementById("resultKicker");
const titleEl = document.getElementById("resultTitle");
const messageEl = document.getElementById("resultMessage");
const summaryEl = document.getElementById("resultSummary");
const orderIdEl = document.getElementById("resultOrderId");
const orderNumberEl = document.getElementById("resultOrderNumber");
const orderEmailEl = document.getElementById("resultOrderEmail");
const totalEl = document.getElementById("resultOrderTotal");
const itemsEl = document.getElementById("resultItems");
const supportHintEl = document.getElementById("supportHint");
const refreshButton = document.getElementById("refreshStatusButton");
const trackGuestButton = document.getElementById("trackGuestButton");
const ordersButton = document.getElementById("ordersButton");
const storeButton = document.getElementById("storeButton");
const retryButton = document.getElementById("retryButton");
const whatsappButton = document.getElementById("whatsappButton");
const activationWrap = document.getElementById("paymentActivation");
const activationForm = document.getElementById("activationForm");
const activationPassword = document.getElementById("activationPassword");
const activationPasswordConfirm = document.getElementById("activationPasswordConfirm");
const activationSubmit = document.getElementById("activationSubmit");
const activationSkip = document.getElementById("activationSkip");
const activationError = document.getElementById("activationError");

let pollIntervalId = null;
let pollStartedAt = 0;
let currentOrderId = "";
let currentOrderNumber = "";
let currentCheckoutEmail = "";
let isLoggedSession = false;

function formatMoneyFromCents(value, currency = "brl") {
  const amount = Number(value || 0) / 100;
  return amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: String(currency || "brl").toUpperCase()
  });
}

function normalizeOrderIdentifier(value) {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatOrderDisplayId(order) {
  const rawOrderNumber = String(order?.orderNumber || "").trim();
  if (rawOrderNumber) return rawOrderNumber;
  const rawId = String(order?.id || "").trim();
  if (!rawId) return "-";
  const compact = normalizeOrderIdentifier(rawId);
  const shortCode = compact.slice(-8) || compact;
  return `PED-${shortCode}`;
}

function showLoader() {
  if (loaderEl) loaderEl.hidden = false;
  if (contentEl) contentEl.hidden = true;
}

function showContent() {
  if (loaderEl) loaderEl.hidden = true;
  if (contentEl) contentEl.hidden = false;
}

function clearPolling() {
  if (!pollIntervalId) return;
  clearInterval(pollIntervalId);
  pollIntervalId = null;
}

function setActionsVisibility({
  showRefresh = false,
  showTrack = false,
  showOrders = false,
  showStore = true,
  showRetry = false,
  showWhatsapp = false,
  showSupportHint = false
}) {
  if (refreshButton) refreshButton.style.display = showRefresh ? "inline-flex" : "none";
  if (trackGuestButton) trackGuestButton.style.display = showTrack ? "inline-flex" : "none";
  if (ordersButton) ordersButton.style.display = showOrders ? "inline-flex" : "none";
  if (storeButton) storeButton.style.display = showStore ? "inline-flex" : "none";
  if (retryButton) retryButton.style.display = showRetry ? "inline-flex" : "none";
  if (whatsappButton) whatsappButton.style.display = showWhatsapp ? "inline-flex" : "none";
  if (supportHintEl) supportHintEl.hidden = !showSupportHint;
}

function setActivationVisibility(visible) {
  if (!activationWrap) return;
  activationWrap.hidden = !visible;
}

function setActivationError(message) {
  if (!activationError) return;
  activationError.hidden = !message;
  activationError.textContent = message || "";
}

function setActivationLoading(loading) {
  if (!activationSubmit) return;
  activationSubmit.disabled = Boolean(loading);
  activationSubmit.textContent = loading ? "Criando senha..." : "Criar senha e acessar minha conta";
}

function saveTrackingContext(partial = {}) {
  try {
    const sessionCurrent = JSON.parse(sessionStorage.getItem(CHECKOUT_TRACKING_KEY) || "{}");
    const localCurrent = JSON.parse(localStorage.getItem(CHECKOUT_TRACKING_KEY) || "{}");
    const current = {
      ...localCurrent,
      ...sessionCurrent
    };
    const next = {
      ...current,
      ...partial,
      updatedAt: new Date().toISOString()
    };
    sessionStorage.setItem(CHECKOUT_TRACKING_KEY, JSON.stringify(next));
    localStorage.setItem(CHECKOUT_TRACKING_KEY, JSON.stringify(next));
    const normalizedOrderId = String(next.orderId || "").trim();
    const normalizedEmail = String(next.email || "").trim().toLowerCase();
    const normalizedOrderNumber = String(next.orderNumber || "").trim();
    if (normalizedOrderId) {
      sessionStorage.setItem(LAST_ORDER_ID_KEY, normalizedOrderId);
      localStorage.setItem(LAST_ORDER_ID_KEY, normalizedOrderId);
    }
    if (normalizedEmail) sessionStorage.setItem(LAST_ORDER_EMAIL_KEY, normalizedEmail);
    if (normalizedOrderNumber) sessionStorage.setItem(LAST_ORDER_NUMBER_KEY, normalizedOrderNumber);
    if (normalizedEmail) localStorage.setItem(LAST_ORDER_EMAIL_KEY, normalizedEmail);
    if (normalizedOrderNumber) localStorage.setItem(LAST_ORDER_NUMBER_KEY, normalizedOrderNumber);
  } catch {}
}

function readTrackingContext() {
  try {
    const sessionParsed = JSON.parse(sessionStorage.getItem(CHECKOUT_TRACKING_KEY) || "{}");
    const localParsed = JSON.parse(localStorage.getItem(CHECKOUT_TRACKING_KEY) || "{}");
    const parsed = {
      ...localParsed,
      ...sessionParsed
    };
    const fallbackOrderId = String(
      sessionStorage.getItem(LAST_ORDER_ID_KEY) || localStorage.getItem(LAST_ORDER_ID_KEY) || ""
    ).trim();
    const fallbackEmail = String(
      sessionStorage.getItem(LAST_ORDER_EMAIL_KEY) || localStorage.getItem(LAST_ORDER_EMAIL_KEY) || ""
    ).trim().toLowerCase();
    const fallbackOrderNumber = String(
      sessionStorage.getItem(LAST_ORDER_NUMBER_KEY) || localStorage.getItem(LAST_ORDER_NUMBER_KEY) || ""
    ).trim();
    return {
      ...parsed,
      orderId: String(parsed?.orderId || fallbackOrderId || "").trim(),
      email: String(parsed?.email || fallbackEmail || "").trim(),
      orderNumber: String(parsed?.orderNumber || fallbackOrderNumber || "").trim()
    };
  } catch {
    return {
      orderId: String(
        sessionStorage.getItem(LAST_ORDER_ID_KEY) || localStorage.getItem(LAST_ORDER_ID_KEY) || ""
      ).trim(),
      email: String(
        sessionStorage.getItem(LAST_ORDER_EMAIL_KEY) || localStorage.getItem(LAST_ORDER_EMAIL_KEY) || ""
      ).trim().toLowerCase(),
      orderNumber: String(
        sessionStorage.getItem(LAST_ORDER_NUMBER_KEY) || localStorage.getItem(LAST_ORDER_NUMBER_KEY) || ""
      ).trim()
    };
  }
}

function renderSummary(order) {
  if (!summaryEl || !orderIdEl || !totalEl || !itemsEl) return;

  const displayOrder = formatOrderDisplayId(order);
  const orderEmail = String(order?.userEmail || order?.email || currentCheckoutEmail || "").trim();
  const orderNumber = String(order?.orderNumber || currentOrderNumber || "").trim();

  orderIdEl.textContent = displayOrder;
  if (orderNumberEl) orderNumberEl.textContent = orderNumber || "Verifique seu e-mail para detalhes do pedido.";
  if (orderEmailEl) orderEmailEl.textContent = orderEmail || "-";

  if (typeof order?.amount === "number" || typeof order?.amount === "string") {
    totalEl.textContent = formatMoneyFromCents(order.amount, order.currency);
  } else {
    totalEl.textContent = "-";
  }

  itemsEl.innerHTML = "";
  const items = Array.isArray(order?.items) ? order.items : [];
  if (items.length === 0) {
    summaryEl.hidden = false;
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const qty = Number(item.qty) || 1;
    const amount = Number(item.unitAmount || 0);
    const unit = formatMoneyFromCents(amount, item.currency || order.currency || "brl");
    li.textContent = `${qty}x ${item.name || item.id || "Item"} - ${unit}`;
    itemsEl.appendChild(li);
  });

  summaryEl.hidden = false;
}

function clearCart() {
  try {
    localStorage.setItem(cartKey, "[]");
  } catch {}
}

function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "paid") return "paid";
  if (value === "canceled") return "canceled";
  if (value === "refunded") return "refunded";
  if (value === "failed") return "failed";
  return "processing";
}

function renderPaid(order) {
  clearPolling();
  clearCart();
  if (kickerEl) kickerEl.textContent = "Pedido confirmado";
  if (titleEl) titleEl.textContent = "Pagamento confirmado";
  if (messageEl) {
    messageEl.textContent =
      "Recebemos seu pagamento com sucesso. Seu cadastro foi aprovado automaticamente para facilitar suas proximas compras.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: false,
    showTrack: true,
    showOrders: isLoggedSession,
    showStore: true,
    showRetry: false,
    showWhatsapp: false,
    showSupportHint: false
  });
  setActivationVisibility(!isLoggedSession && Boolean(currentCheckoutEmail));
}

function renderProcessing(order, didTimeout) {
  if (kickerEl) kickerEl.textContent = "Pedido em análise";
  if (titleEl) titleEl.textContent = "Pagamento em processamento";
  if (messageEl) {
    messageEl.textContent = didTimeout
      ? "Ainda não recebemos a confirmação final. Você pode atualizar o status ou falar com o suporte."
      : "Seu pagamento foi iniciado e pode levar alguns minutos para confirmação automática.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: true,
    showTrack: true,
    showOrders: false,
    showStore: true,
    showRetry: false,
    showWhatsapp: didTimeout,
    showSupportHint: didTimeout
  });
  setActivationVisibility(false);

  if (didTimeout) {
    clearPolling();
  } else if (!pollIntervalId) {
    pollIntervalId = setInterval(() => {
      refreshOrderStatus({ keepLoader: true });
    }, POLL_INTERVAL_MS);
  }
}

function renderFailed(order) {
  clearPolling();
  if (kickerEl) kickerEl.textContent = "Pedido não concluído";
  if (titleEl) titleEl.textContent = "Pagamento não aprovado";
  if (messageEl) {
    messageEl.textContent =
      "Não foi possível confirmar este pagamento. Você pode tentar novamente ou falar com nosso suporte.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: true,
    showTrack: true,
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: true,
    showSupportHint: false
  });
  setActivationVisibility(false);
}

function renderCanceled(order) {
  clearPolling();
  if (kickerEl) kickerEl.textContent = "Pedido cancelado";
  if (titleEl) titleEl.textContent = "Compra cancelada";
  if (messageEl) {
    messageEl.textContent = "Seu pagamento foi cancelado. Se quiser, você pode reiniciar a compra.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: false,
    showTrack: true,
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: false,
    showSupportHint: false
  });
  setActivationVisibility(false);
}

function renderRefunded(order) {
  clearPolling();
  if (kickerEl) kickerEl.textContent = "Pedido reembolsado";
  if (titleEl) titleEl.textContent = "Pagamento reembolsado";
  if (messageEl) {
    messageEl.textContent = "Este pedido foi reembolsado. O estorno segue o prazo do emissor.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: false,
    showTrack: true,
    showOrders: isLoggedSession,
    showStore: true,
    showRetry: false,
    showWhatsapp: false,
    showSupportHint: false
  });
  setActivationVisibility(false);
}

function renderFatal(message) {
  clearPolling();
  if (kickerEl) kickerEl.textContent = "Pedido";
  if (titleEl) titleEl.textContent = "Não foi possível consultar o pagamento";
  if (messageEl) {
    messageEl.textContent =
      message || "Verifique sua conexão e tente atualizar o status em alguns segundos.";
  }
  if (summaryEl) summaryEl.hidden = true;
  setActionsVisibility({
    showRefresh: true,
    showTrack: true,
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: true,
    showSupportHint: false
  });
  setActivationVisibility(false);
}

async function fetchSessionUser() {
  try {
    const response = await fetch("/api/auth/me", { method: "GET", credentials: "same-origin" });
    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    return data?.user || null;
  } catch {
    return null;
  }
}

async function fetchOrderById(orderId, email) {
  const qs = new URLSearchParams();
  if (email) qs.set("email", email);
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}${qs.toString() ? `?${qs.toString()}` : ""}`, {
    method: "GET",
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Falha ao buscar pedido.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fetchOrderByTrack(orderNumber, email) {
  const qs = new URLSearchParams({
    orderNumber: String(orderNumber || ""),
    email: String(email || "")
  });
  const response = await fetch(`/api/orders/track?${qs.toString()}`, {
    method: "GET",
    credentials: "same-origin"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Falha ao rastrear pedido.");
    error.status = response.status;
    throw error;
  }
  return data?.order || null;
}

function normalizeFetchedOrder(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: raw.id || currentOrderId || "",
    orderNumber: String(raw.orderNumber || currentOrderNumber || "").trim(),
    userEmail: String(raw.userEmail || raw.email || currentCheckoutEmail || "").trim(),
    email: String(raw.email || raw.userEmail || currentCheckoutEmail || "").trim(),
    status: String(raw.status || "").trim().toLowerCase() || "processing",
    amount: typeof raw.amount === "number" ? raw.amount : Number(raw.amount || 0),
    currency: raw.currency || "brl",
    items: Array.isArray(raw.items) ? raw.items : []
  };
}

async function refreshOrderStatus({ keepLoader = false } = {}) {
  if (!currentOrderId && !currentOrderNumber) {
    showContent();
    renderFatal("Pedido não encontrado na URL. Volte ao carrinho e tente novamente.");
    return;
  }
  if (!keepLoader) showLoader();

  try {
    let order = null;

    if (currentOrderId) {
      try {
        const orderById = await fetchOrderById(currentOrderId, currentCheckoutEmail);
        order = normalizeFetchedOrder(orderById);
      } catch (error) {
        if (Number(error.status || 0) !== 401) throw error;
      }
    }

    if (!order && currentOrderNumber && currentCheckoutEmail) {
      const tracked = await fetchOrderByTrack(currentOrderNumber, currentCheckoutEmail);
      order = normalizeFetchedOrder(tracked);
    }

    if (!order) {
      throw new Error("Não foi possível localizar o pedido.");
    }

    currentOrderId = String(order.id || currentOrderId || "").trim();
    currentOrderNumber = String(order.orderNumber || currentOrderNumber || "").trim();
    currentCheckoutEmail = String(order.userEmail || order.email || currentCheckoutEmail || "").trim();
    saveTrackingContext({
      orderId: currentOrderId,
      orderNumber: currentOrderNumber,
      email: currentCheckoutEmail
    });

    showContent();
    const normalizedStatus = normalizeStatus(order.status);
    if (normalizedStatus === "paid") {
      renderPaid(order);
      return;
    }
    if (normalizedStatus === "failed") {
      renderFailed(order);
      return;
    }
    if (normalizedStatus === "canceled") {
      renderCanceled(order);
      return;
    }
    if (normalizedStatus === "refunded") {
      renderRefunded(order);
      return;
    }

    const elapsed = Date.now() - pollStartedAt;
    const timedOut = elapsed >= MAX_POLL_DURATION_MS;
    renderProcessing(order, timedOut);
  } catch (error) {
    showContent();
    renderFatal(error.message);
  }
}

function parseInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const cached = readTrackingContext();
  currentOrderId = String(params.get("orderId") || cached.orderId || "").trim();
  currentOrderNumber = String(params.get("orderNumber") || cached.orderNumber || "").trim();
  currentCheckoutEmail = String(params.get("email") || cached.email || "").trim();
}

function openTrackPage() {
  if (!currentOrderNumber || !currentCheckoutEmail) return;
  const qs = new URLSearchParams({
    orderNumber: currentOrderNumber,
    email: currentCheckoutEmail
  });
  window.location.href = `minha-conta.html?${qs.toString()}`;
}

async function handleActivateSubmit(event) {
  event.preventDefault();
  setActivationError("");
  const password = String(activationPassword?.value || "");
  const confirmPassword = String(activationPasswordConfirm?.value || "");

  if (password.length < 8) {
    setActivationError("A senha deve ter pelo menos 8 caracteres.");
    return;
  }
  if (password !== confirmPassword) {
    setActivationError("As senhas nao conferem.");
    return;
  }
  if (!currentCheckoutEmail) {
    setActivationError("Nao foi possivel identificar o email do pedido.");
    return;
  }

  setActivationLoading(true);
  try {
    const response = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: currentCheckoutEmail,
        password,
        confirmPassword,
        orderNumber: currentOrderNumber || ""
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Nao foi possivel criar a senha agora.");
    }
    window.location.href = "conta.html#overview";
  } catch (error) {
    setActivationError(String(error.message || "Nao foi possivel criar a senha agora."));
  } finally {
    setActivationLoading(false);
  }
}

function bindEvents() {
  refreshButton?.addEventListener("click", () => {
    refreshOrderStatus({ keepLoader: false });
  });

  trackGuestButton?.addEventListener("click", () => {
    openTrackPage();
  });

  activationForm?.addEventListener("submit", handleActivateSubmit);
  activationSkip?.addEventListener("click", () => {
    setActivationVisibility(false);
  });
}

async function init() {
  parseInitialParams();
  bindEvents();
  pollStartedAt = Date.now();
  isLoggedSession = Boolean(await fetchSessionUser());
  showLoader();
  refreshOrderStatus({ keepLoader: true });
}

window.addEventListener("beforeunload", clearPolling);
init();


