(function initAccountOrdersModule() {
  const TRACKING_FLOW = ["RECEIVED", "CONFIRMED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELED"];

  function statusLabel(status) {
    const value = String(status || "").trim().toLowerCase();
    if (value === "paid") return "Pago";
    if (value === "processing") return "Processando";
    if (value === "pending_payment") return "Aguardando pagamento";
    if (value === "canceled") return "Cancelado";
    if (value === "failed") return "Falhou";
    if (value === "refunded") return "Reembolsado";
    return "Em análise";
  }

  function formatCurrencyBRL(amountCents, currency) {
    return (Number(amountCents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: String(currency || "brl").toUpperCase()
    });
  }

  function formatDateBR(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function trackingStepLabel(step) {
    if (step === "RECEIVED") return "Pedido Recebido";
    if (step === "CONFIRMED") return "Pedido Confirmado";
    if (step === "IN_TRANSIT") return "Em transporte";
    if (step === "OUT_FOR_DELIVERY") return "Saiu para entregar";
    if (step === "DELIVERED") return "Entregue";
    if (step === "CANCELED") return "Cancelado";
    return step;
  }

  function resolveTrackingStep(order) {
    const paymentStatus = String(order?.status || "").trim().toLowerCase();
    if (paymentStatus === "canceled" || paymentStatus === "failed" || paymentStatus === "refunded") {
      return "CANCELED";
    }

    const raw = String(order?.currentStatus || order?.trackingStatus || "").trim().toUpperCase();
    if (raw === "DELIVERED") return "DELIVERED";
    if (raw === "OUT_FOR_DELIVERY") return "OUT_FOR_DELIVERY";
    if (raw === "IN_TRANSIT" || raw === "SHIPPED") return "IN_TRANSIT";
    if (raw === "PROCESSING" || raw === "ORDER_CONFIRMED") return "CONFIRMED";

    // Quando o pagamento ja foi aprovado, o pedido deve ficar pelo menos em confirmado.
    if (paymentStatus === "paid" || paymentStatus === "processing") return "CONFIRMED";

    if (raw === "ORDER_PLACED" || raw === "PENDING_PAYMENT") return "RECEIVED";
    if (paymentStatus === "pending_payment") return "RECEIVED";
    return "RECEIVED";
  }

  function timelineMarkup(order) {
    const currentStep = resolveTrackingStep(order);
    const activeIndex = Math.max(0, TRACKING_FLOW.indexOf(currentStep));
    const isCanceled = currentStep === "CANCELED";

    return `
      <ol class="order-timeline">
        ${TRACKING_FLOW.map((step, index) => {
          let stateClass = "is-pending";
          if (isCanceled) {
            stateClass = step === "CANCELED" ? "is-canceled" : "is-pending";
          } else if (index < activeIndex) {
            stateClass = "is-complete";
          } else if (index === activeIndex) {
            stateClass = "is-active";
          }
          const deliveredClass = step === "DELIVERED" && !isCanceled && index <= activeIndex ? "is-delivered" : "";
          return `
            <li class="order-timeline-step ${stateClass} ${deliveredClass}" data-step="${step}">
              <span class="order-timeline-dot" aria-hidden="true"></span>
              <span class="order-timeline-name">${escapeHtml(trackingStepLabel(step))}</span>
            </li>
          `;
        }).join("")}
      </ol>
    `;
  }

  function loadOrders(source) {
    const list = Array.isArray(source) ? source : [];
    return list
      .filter(Boolean)
      .map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        const shippingAmount = Number(order.shippingAmount || order.shipping_amount || 0);
        const itemsAmount = Number(order.itemsAmount || order.items_amount || 0);
        const amount = Number(order.amount || order.total || itemsAmount + shippingAmount || 0);
        const shipping = order.shipping || null;
        const trackingUrl = String(order.trackingUrl || order.tracking_url || "").trim();
        const trackingCode = String(order.trackingCode || order.tracking_code || "").trim();
        return {
          id: String(order.id || order.orderNumber || "").trim(),
          number: String(order.orderNumber || order.id || "").trim(),
          createdAt: order.createdAt || order.created_at || "",
          status: String(order.status || ""),
          currency: String(order.currency || "brl"),
          items,
          amount,
          itemsAmount,
          shippingAmount,
          shipping,
          currentStatus: String(order.currentStatus || order.current_status || "").trim(),
          trackingStatus: String(order.trackingStatus || order.tracking_status || "").trim(),
          shippingDeadline: String(order.shippingDeadline || order.shipping_deadline || "").trim(),
          deliveredAt: String(order.deliveredAt || order.delivered_at || "").trim(),
          trackingUrl,
          trackingCode
        };
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }

  window.initOrdersSection = function initOrdersSection(context) {
    const payload = context && typeof context === "object" ? context : {};
    const orders = loadOrders(payload.orders);

    const listMount = document.getElementById("ordersListMount");
    const loadMoreBtn = document.getElementById("ordersLoadMoreBtn");
    const countEl = document.getElementById("ordersSummaryCount");
    const lastEl = document.getElementById("ordersSummaryLast");
    const statusEl = document.getElementById("ordersSummaryStatus");

    if (!listMount) return;

    if (countEl) countEl.textContent = String(orders.length);
    if (orders.length) {
      const first = orders[0];
      if (lastEl) lastEl.textContent = `#${first.number || "-"} • ${formatDateBR(first.createdAt)}`;
      if (statusEl) statusEl.textContent = statusLabel(first.status);
    } else {
      if (lastEl) lastEl.textContent = "-";
      if (statusEl) statusEl.textContent = "-";
    }

    const pageSize = 5;
    let visibleCount = pageSize;

    function orderItemsLine(items) {
      const preview = items.slice(0, 2);
      if (!preview.length) return "Sem itens detalhados.";
      return preview
        .map((item) => `${String(item.name || "Item").trim()} x${Math.max(1, Number(item.qty || item.quantity || 1))}`)
        .join(" • ");
    }

    function detailHtml(order) {
      const itemsHtml = order.items.length
        ? order.items
            .map((item) => {
              const qty = Math.max(1, Number(item.qty || item.quantity || 1));
              const unit = Number(item.unitAmount || item.unit_amount || item.price || 0);
              return `<div class="order-detail-item"><span>${escapeHtml(String(item.name || "Item"))} x${qty}</span><strong>${escapeHtml(formatCurrencyBRL(unit * qty, order.currency))}</strong></div>`;
            })
            .join("")
        : '<p class="conta-muted">Sem itens detalhados.</p>';

      const shipping = order.shipping || {};
      const addressText =
        shipping && typeof shipping === "object"
          ? [shipping.street, shipping.number, shipping.district, shipping.city, shipping.state, shipping.cep]
              .filter(Boolean)
              .join(" - ")
          : "";

      const trackingBlock = order.trackingUrl
        ? `<a class="btn-outline" href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Abrir rastreio</a>`
        : order.trackingCode
          ? `<p class="conta-muted">Codigo de rastreio: <strong>${escapeHtml(order.trackingCode)}</strong></p>`
          : "";
      const deliveryEstimate = order.shippingDeadline ? formatDateBR(order.shippingDeadline) : "";
      const deliveredAt = order.deliveredAt ? formatDateBR(order.deliveredAt) : "";

      return `
        <div class="order-detail-section">
          <h4>Status do envio</h4>
          ${timelineMarkup(order)}
          ${deliveryEstimate ? `<p class="conta-muted">Previsao de entrega: ${escapeHtml(deliveryEstimate)}</p>` : ""}
          ${deliveredAt ? `<p class="conta-muted">Data de entrega: ${escapeHtml(deliveredAt)}</p>` : ""}
        </div>
        <div class="order-detail-section">
          <h4>Itens</h4>
          <div class="order-detail-list">${itemsHtml}</div>
        </div>
        <div class="order-detail-section">
          <h4>Entrega</h4>
          <p class="conta-muted">${escapeHtml(addressText || "Endereço não informado")}</p>
        </div>
        <div class="order-detail-section">
          <h4>Resumo</h4>
          <div class="order-detail-item"><span>Subtotal</span><strong>${escapeHtml(formatCurrencyBRL(order.itemsAmount || 0, order.currency))}</strong></div>
          <div class="order-detail-item"><span>Frete</span><strong>${escapeHtml(formatCurrencyBRL(order.shippingAmount || 0, order.currency))}</strong></div>
          <div class="order-detail-item"><span>Total</span><strong>${escapeHtml(formatCurrencyBRL(order.amount || 0, order.currency))}</strong></div>
        </div>
        ${trackingBlock ? `<div class="order-detail-section">${trackingBlock}</div>` : ""}
      `;
    }

    function bindOrderAccordions() {
      const cards = Array.from(listMount.querySelectorAll(".order-card"));
      cards.forEach((card) => {
        const toggle = card.querySelector("[data-order-toggle]");
        const details = card.querySelector(".order-card-details");
        if (!toggle || !details) return;
        toggle.addEventListener("click", () => {
          const isOpen = card.classList.contains("is-open");
          cards.forEach((entry) => {
            entry.classList.remove("is-open");
            const panel = entry.querySelector(".order-card-details");
            if (panel) panel.innerHTML = "";
          });
          if (isOpen) return;
          details.innerHTML = detailHtml(orders.find((order) => order.id === card.dataset.orderId) || {});
          card.classList.add("is-open");
        });
      });
    }

    function renderOrders() {
      if (!orders.length) {
        listMount.innerHTML = `
          <div class="orders-empty">
            <p>Você ainda não realizou nenhuma compra.</p>
            <a class="btn-primary" href="/">Comecar a comprar</a>
          </div>
        `;
        if (loadMoreBtn) loadMoreBtn.hidden = true;
        return;
      }

      const visible = orders.slice(0, visibleCount);
      listMount.innerHTML = visible
        .map((order) => {
          const hasTracking = Boolean(order.trackingUrl || order.trackingCode);
          const trackingHref = order.trackingUrl || "#";
          return `
            <article class="order-card" data-order-id="${escapeHtml(order.id)}">
              <div class="order-card-head">
                <h3>Pedido #${escapeHtml(order.number || order.id || "-")}</h3>
                <span class="order-status">${escapeHtml(statusLabel(order.status))}</span>
              </div>
              <p class="order-meta">${escapeHtml(formatDateBR(order.createdAt))} • ${escapeHtml(formatCurrencyBRL(order.amount, order.currency))}</p>
              <p class="order-items-preview">${escapeHtml(orderItemsLine(order.items))}</p>
              <div class="order-card-actions">
                <button type="button" class="btn-primary" data-order-toggle="${escapeHtml(order.id)}">Ver detalhes</button>
                ${hasTracking ? `<a class="btn-outline" href="${escapeHtml(trackingHref)}" ${order.trackingUrl ? 'target="_blank" rel="noopener noreferrer"' : ""}>Acompanhar envio</a>` : ""}
              </div>
              <div class="order-card-details"></div>
            </article>
          `;
        })
        .join("");

      if (loadMoreBtn) {
        loadMoreBtn.hidden = visibleCount >= orders.length;
      }

      bindOrderAccordions();
    }

    if (loadMoreBtn) {
      loadMoreBtn.onclick = () => {
        visibleCount += pageSize;
        renderOrders();
      };
    }

    renderOrders();
  };
})();
