const store = window.TsebiUserStore;

const titleEl = document.getElementById("orderTitle");
const subtitleEl = document.getElementById("orderSubtitle");
const summaryEl = document.getElementById("orderSummary");
const itemsEl = document.getElementById("orderItems");
const shippingEl = document.getElementById("orderShipping");
const actionsEl = document.getElementById("orderActions");
const cancelBtn = document.getElementById("cancelOrderBtn");
const refundBtn = document.getElementById("refundOrderBtn");
const feedbackEl = document.getElementById("orderFeedback");
let currentOrder = null;
const REFUND_WINDOW_MS = 10 * 60 * 1000;

function formatCurrencyFromCents(value, currency = "brl") {
  return (Number(value || 0) / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: String(currency || "brl").toUpperCase()
  });
}

function setFeedback(message, isError = false) {
  if (!feedbackEl) return;
  feedbackEl.textContent = message || "";
  feedbackEl.style.color = isError ? "#991b1b" : "#1d6a2d";
}

function formatStatus(status) {
  const value = String(status || "").toLowerCase();
  if (value === "paid") return "Pago";
  if (value === "failed") return "Falhou";
  if (value === "canceled") return "Cancelado";
  if (value === "refunded") return "Reembolsado";
  if (value === "pending_payment") return "Aguardando pagamento";
  if (value === "processing") return "Processando";
  return status || "N/A";
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

function canRefundByTime(order) {
  if (!order?.paidAt) return false;
  const paidAt = new Date(order.paidAt);
  if (Number.isNaN(paidAt.getTime())) return false;
  return Date.now() - paidAt.getTime() <= REFUND_WINDOW_MS;
}

function renderActions(order) {
  if (!actionsEl || !cancelBtn || !refundBtn) return;
  const status = String(order?.status || "").toLowerCase();
  const canCancel = status === "pending_payment" || status === "processing";
  const canRefund = status === "paid" && canRefundByTime(order);
  actionsEl.hidden = !canCancel && !canRefund;
  cancelBtn.hidden = !canCancel;
  refundBtn.hidden = !canRefund;
}

function renderOrder(order) {
  if (!order) return;
  currentOrder = order;
  if (subtitleEl) subtitleEl.textContent = `Pedido #${formatOrderDisplayId(order)}`;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <p>Status: ${formatStatus(order.status)}</p>
      <p>Total: ${formatCurrencyFromCents(order.amount, order.currency)}</p>
      <p>Criado em: ${new Date(order.createdAt).toLocaleString("pt-BR")}</p>
    `;
  }

  if (itemsEl) {
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
      itemsEl.textContent = "Sem itens.";
    } else {
      itemsEl.innerHTML = items
        .map((item) => {
          const unit = formatCurrencyFromCents(item.unitAmount || 0, order.currency || "brl");
          const qty = Number(item.qty) || 1;
          return `<p>${qty}x ${item.name || item.id} - ${unit}</p>`;
        })
        .join("");
    }
  }

  if (shippingEl) {
    const shipping = order.shipping || null;
    if (!shipping) {
      shippingEl.textContent = "Endereço de entrega não informado.";
    } else {
      shippingEl.innerHTML = `
        <p>${shipping.fullName || ""}</p>
        <p>${shipping.street || ""}, ${shipping.number || ""}</p>
        <p>${shipping.district || ""} - ${shipping.city || ""}/${shipping.state || ""}</p>
        <p>CEP: ${shipping.cep || ""}</p>
        <p>Método: ${shipping.shippingMethod || "-"}</p>
      `;
    }
  }

  renderActions(order);
}

async function handleCancelOrder() {
  if (!currentOrder?.id) return;
  const confirmed = window.confirm("Deseja cancelar este pedido?");
  if (!confirmed) return;
  cancelBtn.disabled = true;
  setFeedback("Cancelando pedido...");
  const result = await store.cancelMyOrder(currentOrder.id);
  cancelBtn.disabled = false;
  if (!result.ok || !result.order) {
    setFeedback(result.error || "Não foi possível cancelar o pedido.", true);
    return;
  }
  renderOrder(result.order);
  setFeedback("Pedido cancelado.");
}

async function handleRefundOrder() {
  if (!currentOrder?.id) return;
  const confirmed = window.confirm("Deseja solicitar reembolso deste pedido?");
  if (!confirmed) return;
  refundBtn.disabled = true;
  setFeedback("Solicitando reembolso...");
  const result = await store.refundMyOrder(currentOrder.id);
  refundBtn.disabled = false;
  if (!result.ok || !result.order) {
    setFeedback(result.error || "Não foi possível solicitar reembolso.", true);
    return;
  }
  renderOrder(result.order);
  setFeedback("Reembolso solicitado com sucesso.");
}

async function boot() {
  if (!store) {
    setFeedback("Serviço de conta indisponível.", true);
    return;
  }

  const me = await store.fetchMe();
  if (!me.ok || !me.user) {
    window.location.href = `login.html?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`;
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("orderId") || "").trim();
  if (!orderId) {
    setFeedback("Pedido não encontrado na URL.", true);
    return;
  }

  const result = await store.fetchMyOrder(orderId);
  if (!result.ok || !result.order) {
    setFeedback(result.error || "Não foi possível carregar o pedido.", true);
    return;
  }

  renderOrder(result.order);
}

cancelBtn?.addEventListener("click", handleCancelOrder);
refundBtn?.addEventListener("click", handleRefundOrder);

boot();
