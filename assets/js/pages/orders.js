import { api } from "../api.js";
import { toast } from "../ui/toast.js";
import { confirmDiff } from "../ui/modalConfirmDiff.js";
import { renderPagination, renderTable } from "../ui/table.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function formatMoneyFromCents(cents, currency = "BRL") {
  const amount = Math.max(0, Number(cents || 0)) / 100;
  return amount.toLocaleString("pt-BR", { style: "currency", currency: String(currency || "BRL").toUpperCase() });
}

const TRACKING_STATUS_OPTIONS = [
  { value: "ORDER_PLACED", label: "Pedido Recebido" },
  { value: "PROCESSING", label: "Pedido Confirmado" },
  { value: "SHIPPED", label: "Em Preparação" },
  { value: "IN_TRANSIT", label: "Em transporte" },
  { value: "OUT_FOR_DELIVERY", label: "Saiu Pra entregar" },
  { value: "DELIVERED", label: "Entregue" }
];

function statusPill(status) {
  const s = String(status || "").toLowerCase();
  if (s === "paid") return `<span class="pill">Pago</span>`;
  if (s === "processing") return `<span class="pill pill-warn">Processando</span>`;
  if (s === "pending_payment") return `<span class="pill pill-warn">Pendente</span>`;
  if (s === "failed") return `<span class="pill pill-danger">Falhou</span>`;
  if (s === "canceled") return `<span class="pill pill-danger">Cancelado</span>`;
  if (s === "refunded") return `<span class="pill pill-danger">Reembolsado</span>`;
  return `<span class="pill">${escapeHtml(status || "—")}</span>`;
}

function buildDiff(before, after, labels) {
  const diffs = [];
  Object.keys(labels).forEach((key) => {
    const left = before?.[key];
    const right = after?.[key];
    if (String(left ?? "") !== String(right ?? "")) {
      diffs.push({ field: labels[key], before: left ?? "", after: right ?? "" });
    }
  });
  return diffs;
}

function toLocalDatetimeValue(iso) {
  const d = new Date(String(iso || ""));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getShipment(order) {
  return order?.shipment || null;
}

function canBuyShippingLabel(order, shipment = null) {
  const hasServiceCode = Boolean(
    String(order?.shippingSelectedServiceCode || order?.shipping?.shippingServiceCode || "").trim()
  );
  const isPaid = String(order?.status || "").trim().toLowerCase() === "paid";
  const shipmentStatus = String(shipment?.status || "").trim().toUpperCase();
  const hasBoughtLabel =
    shipmentStatus === "ETIQUETA_COMPRADA" ||
    shipmentStatus === "EM_TRANSITO" ||
    shipmentStatus === "ENTREGUE";
  return hasServiceCode && isPaid && !hasBoughtLabel;
}

function canTrackShippingLabel(_order, shipment) {
  const trackingCode = String(shipment?.trackingCode || "").trim();
  return Boolean(trackingCode);
}

function shippingButtonState(order, shipment = null) {
  if (!String(order?.shippingSelectedServiceCode || order?.shipping?.shippingServiceCode || "").trim()) {
    return { label: "Frete incompleto", className: "btn btn-ghost", disabled: true };
  }
  const shipmentStatus = String(shipment?.status || "").trim().toUpperCase();
  if (shipmentStatus === "ETIQUETA_COMPRADA" || shipmentStatus === "EM_TRANSITO" || shipmentStatus === "ENTREGUE") {
    return { label: "Etiqueta expedida", className: "btn btn-ghost", disabled: true };
  }
  if (String(order?.status || "").trim().toLowerCase() === "paid" && canBuyShippingLabel(order, shipment)) {
    return { label: "Expedir etiqueta", className: "btn", disabled: false };
  }
  return { label: "Aguardando pagamento", className: "btn btn-ghost", disabled: true };
}

function pickShippingErrorMessage(error, fallback = "Falha na requisição.") {
  const payload = error?.payload || {};
  const detail = payload?.detail;
  let message = "";

  if (typeof detail === "string" && detail.trim()) {
    message = detail.trim();
  } else if (detail && typeof detail === "object") {
    message =
      String(
        detail?.response?.message ||
          detail?.response?.error ||
          detail?.message ||
          detail?.error ||
          ""
      ).trim();
  }

  const requestId = detail?.response?.request_id || detail?.request_id || "";
  if (message) {
    const normalized = message.toLowerCase();
    if (
      normalized.includes("saldo") ||
      normalized.includes("balance") ||
      normalized.includes("insufficient") ||
      normalized.includes("credit")
    ) {
      return "Sem saldo no Melhor Envio. Adicione saldo e tente novamente.";
    }
    return requestId ? `${message} (request_id: ${requestId})` : message;
  }

  return String(error?.code || error?.message || fallback);
}

export function createOrdersPage({ mount, drawer, getStatusFilter }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 30,
    total: 0,
    rows: []
  };

  async function load() {
    const status = String(getStatusFilter?.() || "").trim();
    const data = await api(
      `/api/admin/orders?query=${encodeURIComponent(state.query)}&status=${encodeURIComponent(status)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data.orders) ? data.orders : [];
    state.total = Number(data.total || 0);
  }

  function render() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        { label: "Data", render: (o) => `<div>${escapeHtml(formatDate(o.createdAt))}</div>` },
        { label: "ID", render: (o) => `<div style="font-family:ui-monospace,Consolas,monospace;font-size:12px;">${escapeHtml(o.id)}</div>` },
        {
          label: "Cliente",
          render: (o) =>
            `<div>
              <div style="font-weight:600">${escapeHtml(o.userName || "—")}</div>
              <div style="color:var(--muted);font-size:12px">${escapeHtml(o.userEmail || "—")}</div>
            </div>`
        },
        {
          label: "Total",
          render: (o) => {
            const total = formatMoneyFromCents(o.amount, o.currency);
            const ship = formatMoneyFromCents(o.shippingPriceCents || o.shippingAmount || 0, o.currency);
            return `<div>${escapeHtml(total)}<div style="color:var(--muted);font-size:12px">Frete: ${escapeHtml(ship)}</div></div>`;
          }
        },
        { label: "Status", render: (o) => statusPill(o.status) },
        {
          label: "Tracking",
          render: (o) => {
            const tracking = String(o.trackingId || o.trackingCode || "").trim();
            return tracking ? `<div>${escapeHtml(tracking)}</div>` : `<div style="color:var(--muted);">—</div>`;
          }
        }
      ],
      rows: state.rows,
      getRowId: (o) => o.id,
      onRowClick: (row) => openDrawer(row.id)
    });

    const pager = renderPagination({
      page: state.page,
      pageSize: state.pageSize,
      total: state.total,
      onChange: async (nextPage) => {
        state.page = nextPage;
        await reload();
      }
    });

    mount.appendChild(table);
    mount.appendChild(pager);
  }

  async function openDrawer(orderId) {
    const data = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`);
    const order = data?.order || null;
    if (!order) {
      toast("Pedido não encontrado.", { tone: "error" });
      return;
    }

    const original = {
      orderStatus: String(order.status || ""),
      trackingCode: String(order.trackingCode || order.trackingId || ""),
      trackingStatus: String(order.trackingStatus || ""),
      carrier: String(order.carrier || ""),
      shippingDeadline: String(order.shippingDeadline || ""),
      adminNotes: String(order.adminNotes || "")
    };

    const isRefunded = original.orderStatus === "refunded";
    const shipment = getShipment(order);
    const buyButtonState = shippingButtonState(order, shipment);
    const canTrack = canTrackShippingLabel(order, shipment);
    const trackingStatusOptions = (() => {
      const current = String(original.trackingStatus || "");
      const known = TRACKING_STATUS_OPTIONS.some((option) => option.value === current);
      const extra = !known && current
        ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)}</option>`
        : "";
      const defaults = TRACKING_STATUS_OPTIONS.map(
        (option) =>
          `<option value="${escapeHtml(option.value)}" ${option.value === current ? "selected" : ""}>${escapeHtml(option.label)}</option>`
      ).join("");
      return `${extra}${defaults}`;
    })();
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="section">
        <h3>Resumo</h3>
        <div style="display:grid;gap:6px;color:var(--muted);font-size:13px;">
          <div><strong style="color:var(--text);">Total:</strong> ${escapeHtml(formatMoneyFromCents(order.amount, order.currency))}</div>
          <div><strong style="color:var(--text);">Serviço:</strong> ${escapeHtml(order.shippingSelectedCarrierName || "—")} • ${escapeHtml(order.shippingSelectedService || "—")}</div>
          <div><strong style="color:var(--text);">Destino:</strong> ${escapeHtml(order.shippingDestinationZip || order.shipping?.cep || "—")}</div>
        </div>
      </div>

      <div class="section">
        <h3>Edição</h3>
        <div class="form-grid">
          <label class="label">
            <span>Status do pedido</span>
            <select class="field" data-key="orderStatus" ${isRefunded ? "disabled" : ""}>
              ${["pending_payment", "processing", "paid", "failed", "canceled", "refunded"]
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === original.orderStatus ? "selected" : ""}>${escapeHtml(s)}</option>`
                )
                .join("")}
            </select>
            <small style="color:var(--muted);font-size:12px;line-height:1.4;">
              ${isRefunded ? "Pedido reembolsado: status bloqueado para evitar cobrança duplicada." : "Ao selecionar Cancelado, o sistema solicita estorno no Stripe."}
            </small>
          </label>
          <label class="label">
            <span>Carrier</span>
            <input class="field" data-key="carrier" type="text" value="${escapeHtml(original.carrier)}" />
          </label>
          <label class="label full">
            <span>Código de rastreio</span>
            <input class="field" data-key="trackingCode" type="text" value="${escapeHtml(original.trackingCode)}" />
          </label>
          <label class="label full">
            <span>Tracking status</span>
            <select class="field" data-key="trackingStatus">
              <option value="">Selecione</option>
              ${trackingStatusOptions}
            </select>
          </label>
          <label class="label full">
            <span>Prazo (deadline)</span>
            <input class="field" data-key="shippingDeadline" type="datetime-local" value="${escapeHtml(toLocalDatetimeValue(original.shippingDeadline))}" />
          </label>
          <label class="label full">
            <span>Notas internas</span>
            <textarea class="field" data-key="adminNotes">${escapeHtml(original.adminNotes)}</textarea>
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="save">Salvar alterações</button>
        </div>
      </div>

      <div class="section">
        <h3>Etiqueta</h3>
        <div class="form-grid">
          <label class="label">
            <span>Status da etiqueta</span>
            <input class="field" data-shipment-field="status" type="text" value="${escapeHtml(shipment?.status || "—")}" readonly />
          </label>
          <label class="label">
            <span>Código de rastreio</span>
            <input class="field" data-shipment-field="trackingCode" type="text" value="${escapeHtml(shipment?.trackingCode || "—")}" readonly />
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-ghost" data-action="shipping-track-label" ${canTrack ? "" : "disabled"}>Rastrear</button>
          <button type="button" class="${escapeHtml(buyButtonState.className)}" data-action="shipping-buy-label" ${buyButtonState.disabled ? "disabled" : ""}>
            ${escapeHtml(buyButtonState.label)}
          </button>
        </div>
      </div>

      <div class="section" style="border:1px solid rgba(255,255,255,0.08);padding:14px;border-radius:12px;">
        <h3 style="color:#f87171;">Zona de risco</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.4;">Excluir remove o pedido, itens e dados de envio. Essa ação é permanente.</p>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-danger" data-action="delete">Excluir pedido</button>
        </div>
      </div>
    `;

    function refreshShippingSection(nextShipment = null) {
      const effectiveShipment = nextShipment || order.shipment || null;
      const statusInput = root.querySelector('[data-shipment-field="status"]');
      const trackingInput = root.querySelector('[data-shipment-field="trackingCode"]');
      if (statusInput instanceof HTMLInputElement) {
        statusInput.value = String(effectiveShipment?.status || "—");
      }
      if (trackingInput instanceof HTMLInputElement) {
        trackingInput.value = String(effectiveShipment?.trackingCode || "—");
      }

      const buyState = shippingButtonState(order, effectiveShipment);
      const buyBtn = root.querySelector('button[data-action="shipping-buy-label"]');
      if (buyBtn instanceof HTMLButtonElement) {
        buyBtn.textContent = buyState.label;
        buyBtn.className = buyState.className;
        buyBtn.disabled = Boolean(buyState.disabled);
      }
      const trackBtn = root.querySelector('button[data-action="shipping-track-label"]');
      if (trackBtn instanceof HTMLButtonElement) {
        trackBtn.disabled = !canTrackShippingLabel(order, effectiveShipment);
      }
    }

    root.addEventListener("input", (event) => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLTextAreaElement)) return;
      const key = String(el.dataset.key || "");
      if (!key) return;
      const value = el.value;
      const before = key === "shippingDeadline" ? toLocalDatetimeValue(original.shippingDeadline) : String(original[key] ?? "");
      el.classList.toggle("dirty", String(value ?? "") !== before);
    });

    async function save() {
      const patch = {};
      root.querySelectorAll("[data-key]").forEach((el) => {
        const key = String(el.dataset.key || "");
        if (!key) return;
        let value = el.value;
        if (key === "shippingDeadline") {
          value = value ? new Date(value).toISOString() : "";
        }
        const before = String(original[key] ?? "");
        if (String(value ?? "") !== before) {
          patch[key] = value;
        }
      });

      if (Object.keys(patch).length === 0) {
        toast("Nenhuma alteração para salvar.", { tone: "info" });
        return;
      }

      const diffs = buildDiff(original, { ...original, ...patch }, {
        orderStatus: "Status do pedido",
        trackingCode: "Código de rastreio",
        trackingStatus: "Tracking status",
        carrier: "Carrier",
        shippingDeadline: "Deadline",
        adminNotes: "Notas internas"
      });
      const ok = await confirmDiff({
        title: "Confirmar alterações",
        message: `Pedido ${orderId}`,
        diffs,
        tone: "ok"
      });
      if (!ok) return;

      await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, { method: "PATCH", json: patch });
      toast("Pedido atualizado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    root.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = String(btn.dataset.action || "");
      try {
        if (action === "save") await save();
        if (action === "cancel") drawer.close();
        if (action === "shipping-track-label") {
          btn.disabled = true;
          btn.textContent = "Rastreando...";
          const data = await api(`/api/admin/orders/${encodeURIComponent(orderId)}/shipping/track`);
          if (data?.data?.shipment) {
            order.shipment = data.data.shipment;
          }
          refreshShippingSection(order.shipment);
          toast("Rastreio atualizado.", { tone: "success" });
        }
        if (action === "shipping-buy-label") {
          btn.disabled = true;
          btn.textContent = "Expedindo...";
          const data = await api(`/api/admin/orders/${encodeURIComponent(orderId)}/shipping/buy-label`, { method: "POST" });
          if (data?.data?.shipment) {
            order.shipment = data.data.shipment;
          }
          refreshShippingSection(order.shipment);
          toast("Etiqueta expedida com sucesso.", { tone: "success" });
        }
        if (action === "delete") {
          const ok = await confirmDiff({
            title: "Excluir pedido",
            message: `Pedido ${orderId}`,
            diffs: [{ field: "Ação", before: "Manter", after: "Excluir permanentemente" }],
            tone: "danger"
          });
          if (!ok) return;
          await api(`/api/admin/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" });
          toast("Pedido excluído.", { tone: "success" });
          drawer.close();
          await reload();
        }
      } catch (error) {
        refreshShippingSection(order.shipment);
        toast(`Falha: ${pickShippingErrorMessage(error, "REQUEST_FAILED")}`, { tone: "error" });
      }
    });

    drawer.open({
      titleText: `Pedido • ${order.id}`,
      content: root
    });
  }

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar pedidos: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar pedidos.</div>`;
    }
  }

  return {
    setQuery: (q) => {
      state.query = String(q || "").trim();
      state.page = 1;
    },
    reload
  };
}
