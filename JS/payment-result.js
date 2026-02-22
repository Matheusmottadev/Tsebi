const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 2 * 60 * 1000;
const cartKey = "tsebi-cart-v1";

const loaderEl = document.getElementById("paymentLoader");
const contentEl = document.getElementById("paymentResultContent");
const kickerEl = document.getElementById("resultKicker");
const titleEl = document.getElementById("resultTitle");
const messageEl = document.getElementById("resultMessage");
const summaryEl = document.getElementById("resultSummary");
const orderIdEl = document.getElementById("resultOrderId");
const totalEl = document.getElementById("resultOrderTotal");
const itemsEl = document.getElementById("resultItems");
const supportHintEl = document.getElementById("supportHint");
const refreshButton = document.getElementById("refreshStatusButton");
const ordersButton = document.getElementById("ordersButton");
const storeButton = document.getElementById("storeButton");
const retryButton = document.getElementById("retryButton");
const whatsappButton = document.getElementById("whatsappButton");

let pollIntervalId = null;
let pollStartedAt = 0;
let currentOrderId = "";

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
  showOrders = false,
  showStore = true,
  showRetry = false,
  showWhatsapp = false,
  showSupportHint = false
}) {
  if (refreshButton) refreshButton.style.display = showRefresh ? "inline-flex" : "none";
  if (ordersButton) ordersButton.style.display = showOrders ? "inline-flex" : "none";
  if (storeButton) storeButton.style.display = showStore ? "inline-flex" : "none";
  if (retryButton) retryButton.style.display = showRetry ? "inline-flex" : "none";
  if (whatsappButton) whatsappButton.style.display = showWhatsapp ? "inline-flex" : "none";
  if (supportHintEl) supportHintEl.hidden = !showSupportHint;
}

function renderSummary(order) {
  if (!summaryEl || !orderIdEl || !totalEl || !itemsEl) return;
  orderIdEl.textContent = formatOrderDisplayId(order);
  totalEl.textContent = formatMoneyFromCents(order.amount, order.currency);
  itemsEl.innerHTML = "";

  const items = Array.isArray(order.items) ? order.items : [];
  if (items.length === 0) {
    summaryEl.hidden = true;
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const qty = Number(item.qty) || 1;
    const unit = formatMoneyFromCents(item.unitAmount || 0, item.currency || order.currency || "brl");
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
    messageEl.textContent = "Recebemos seu pagamento com sucesso. Seu pedido já está em preparação.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: false,
    showOrders: true,
    showStore: true,
    showRetry: false,
    showWhatsapp: false,
    showSupportHint: false
  });
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
    showOrders: false,
    showStore: true,
    showRetry: false,
    showWhatsapp: didTimeout,
    showSupportHint: didTimeout
  });
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
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: true,
    showSupportHint: false
  });
}

function renderCanceled(order) {
  clearPolling();
  if (kickerEl) kickerEl.textContent = "Pedido cancelado";
  if (titleEl) titleEl.textContent = "Compra cancelada";
  if (messageEl) {
    messageEl.textContent = "Seu pagamento foi cancelado. Se quiser, voce pode reiniciar a compra.";
  }
  renderSummary(order);
  setActionsVisibility({
    showRefresh: false,
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: false,
    showSupportHint: false
  });
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
    showOrders: true,
    showStore: true,
    showRetry: false,
    showWhatsapp: false,
    showSupportHint: false
  });
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
    showOrders: false,
    showStore: true,
    showRetry: true,
    showWhatsapp: true,
    showSupportHint: false
  });
}

async function fetchOrder(orderId) {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
    method: "GET"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Falha ao buscar pedido.");
    error.status = response.status;
    throw error;
  }
  return data;
}

async function refreshOrderStatus({ keepLoader = false } = {}) {
  if (!currentOrderId) return;
  if (!keepLoader) showLoader();

  try {
    const order = await fetchOrder(currentOrderId);
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

    if (timedOut) {
      clearPolling();
    } else if (!pollIntervalId) {
      pollIntervalId = setInterval(() => {
        refreshOrderStatus({ keepLoader: true });
      }, POLL_INTERVAL_MS);
    }
  } catch (error) {
    if (error.status === 401) {
      const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = `login.html?returnUrl=${encodeURIComponent(returnUrl)}`;
      return;
    }
    showContent();
    renderFatal(error.message);
  }
}

function init() {
  const params = new URLSearchParams(window.location.search);
  currentOrderId = params.get("orderId") || "";
  pollStartedAt = Date.now();

  refreshButton?.addEventListener("click", () => {
    refreshOrderStatus({ keepLoader: false });
  });

  if (!currentOrderId) {
    showContent();
    renderFatal("Pedido não encontrado na URL. Volte ao carrinho e tente novamente.");
    return;
  }

  showLoader();
  refreshOrderStatus({ keepLoader: true });
}

window.addEventListener("beforeunload", clearPolling);
init();
