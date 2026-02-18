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
      trackingId: String(order.trackingId || order.trackingCode || ""),
      trackingStatus: String(order.trackingStatus || ""),
      carrier: String(order.carrier || ""),
      shippingDeadline: String(order.shippingDeadline || ""),
      adminNotes: String(order.adminNotes || "")
    };

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
            <select class="field" data-key="orderStatus">
              ${["pending_payment", "processing", "paid", "failed", "canceled", "refunded"]
                .map(
                  (s) =>
                    `<option value="${escapeHtml(s)}" ${s === original.orderStatus ? "selected" : ""}>${escapeHtml(s)}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="label">
            <span>Carrier</span>
            <input class="field" data-key="carrier" type="text" value="${escapeHtml(original.carrier)}" />
          </label>
          <label class="label full">
            <span>Tracking ID</span>
            <input class="field" data-key="trackingId" type="text" value="${escapeHtml(original.trackingId)}" />
          </label>
          <label class="label full">
            <span>Tracking status</span>
            <input class="field" data-key="trackingStatus" type="text" value="${escapeHtml(original.trackingStatus)}" />
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
    `;

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
        trackingId: "Tracking ID",
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
      } catch (error) {
        toast(`Falha: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
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

