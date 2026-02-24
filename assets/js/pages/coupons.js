import { api } from "../api.js";
import { toast } from "../ui/toast.js";
import { renderPagination, renderTable } from "../ui/table.js";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoneyCents(value) {
  const amount = Math.max(0, Number(value || 0)) / 100;
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

export function createCouponsPage({ mount }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 20,
    total: 0,
    rows: []
  };

  function readFormValues(root) {
    const code = normalizeCode(root.querySelector('[data-coupon-key="code"]')?.value || "");
    const type = String(root.querySelector('[data-coupon-key="type"]')?.value || "percent");
    const percentOff = Math.max(0, Math.min(100, Number(root.querySelector('[data-coupon-key="percentOff"]')?.value || 0)));
    const amountOffCents = Math.max(0, Math.floor((Number(root.querySelector('[data-coupon-key="amountOff"]')?.value || 0)) * 100));
    const minSubtotalCents = Math.max(0, Math.floor((Number(root.querySelector('[data-coupon-key="minSubtotal"]')?.value || 0)) * 100));
    const maxDiscountCents = Math.max(0, Math.floor((Number(root.querySelector('[data-coupon-key="maxDiscount"]')?.value || 0)) * 100));
    const active = Boolean(root.querySelector('[data-coupon-key="active"]')?.checked);
    const startsAt = String(root.querySelector('[data-coupon-key="startsAt"]')?.value || "").trim();
    const expiresAt = String(root.querySelector('[data-coupon-key="expiresAt"]')?.value || "").trim();
    const description = String(root.querySelector('[data-coupon-key="description"]')?.value || "").trim();
    return {
      code,
      type,
      percentOff,
      amountOffCents,
      minSubtotalCents,
      maxDiscountCents,
      active,
      startsAt: startsAt ? new Date(startsAt).toISOString() : "",
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
      description
    };
  }

  function resetForm(root) {
    root.querySelector('[data-coupon-key="code"]').value = "";
    root.querySelector('[data-coupon-key="type"]').value = "percent";
    root.querySelector('[data-coupon-key="percentOff"]').value = "10";
    root.querySelector('[data-coupon-key="amountOff"]').value = "0";
    root.querySelector('[data-coupon-key="minSubtotal"]').value = "0";
    root.querySelector('[data-coupon-key="maxDiscount"]').value = "0";
    root.querySelector('[data-coupon-key="active"]').checked = true;
    root.querySelector('[data-coupon-key="startsAt"]').value = "";
    root.querySelector('[data-coupon-key="expiresAt"]').value = "";
    root.querySelector('[data-coupon-key="description"]').value = "";
  }

  async function load() {
    const data = await api(
      `/api/admin/coupons?query=${encodeURIComponent(state.query)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data?.rows) ? data.rows : [];
    state.total = Number(data?.total || 0);
  }

  function render() {
    mount.innerHTML = "";

    const formSection = document.createElement("section");
    formSection.className = "section";
    formSection.innerHTML = `
      <h3>Novo código de acesso</h3>
      <div class="form-grid" style="margin-top:10px;">
        <label class="label">
          <span>Código</span>
          <input class="field" data-coupon-key="code" type="text" placeholder="EXCLUSIVO10" />
        </label>
        <label class="label">
          <span>Tipo</span>
          <select class="field" data-coupon-key="type">
            <option value="percent">Percentual (%)</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
        </label>
        <label class="label">
          <span>Percentual (%)</span>
          <input class="field" data-coupon-key="percentOff" type="number" min="0" max="100" step="1" value="10" />
        </label>
        <label class="label">
          <span>Valor fixo (R$)</span>
          <input class="field" data-coupon-key="amountOff" type="number" min="0" step="0.01" value="0" />
        </label>
        <label class="label">
          <span>Subtotal mínimo (R$)</span>
          <input class="field" data-coupon-key="minSubtotal" type="number" min="0" step="0.01" value="0" />
        </label>
        <label class="label">
          <span>Teto de desconto (R$)</span>
          <input class="field" data-coupon-key="maxDiscount" type="number" min="0" step="0.01" value="0" />
        </label>
        <label class="label">
          <span>Início (opcional)</span>
          <input class="field" data-coupon-key="startsAt" type="datetime-local" />
        </label>
        <label class="label">
          <span>Fim (opcional)</span>
          <input class="field" data-coupon-key="expiresAt" type="datetime-local" />
        </label>
        <label class="label full">
          <span>Descrição (opcional)</span>
          <input class="field" data-coupon-key="description" type="text" />
        </label>
        <label class="label">
          <span>Ativo</span>
          <input data-coupon-key="active" type="checkbox" checked />
        </label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="btn btn-ghost" data-coupon-action="reset">Limpar</button>
        <button type="button" class="btn" data-coupon-action="save">Salvar código</button>
      </div>
    `;

    formSection.addEventListener("click", async (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-coupon-action]") : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const action = String(button.dataset.couponAction || "");

      if (action === "reset") {
        resetForm(formSection);
        return;
      }

      if (action !== "save") return;
      const payload = readFormValues(formSection);
      if (!payload.code) {
        toast("Informe um código válido.", { tone: "error" });
        return;
      }
      if (payload.type === "percent" && payload.percentOff <= 0) {
        toast("Percentual deve ser maior que zero.", { tone: "error" });
        return;
      }
      if (payload.type === "fixed" && payload.amountOffCents <= 0) {
        toast("Valor fixo deve ser maior que zero.", { tone: "error" });
        return;
      }

      try {
        await api("/api/admin/coupons", { method: "POST", json: payload });
        toast("Código salvo.", { tone: "success" });
        await reload();
      } catch (error) {
        toast(`Falha ao salvar: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      }
    });

    const table = renderTable({
      columns: [
        { label: "Código", render: (row) => `<strong>${escapeHtml(row.code || "-")}</strong>` },
        {
          label: "Regra",
          render: (row) => {
            if (String(row.type || "") === "fixed") {
              return `<div>${escapeHtml(formatMoneyCents(row.amountOffCents || 0))} de desconto</div>`;
            }
            return `<div>${escapeHtml(String(row.percentOff || 0))}% de desconto</div>`;
          }
        },
        { label: "Mínimo", render: (row) => `<div>${escapeHtml(formatMoneyCents(row.minSubtotalCents || 0))}</div>` },
        { label: "Teto", render: (row) => `<div>${escapeHtml(formatMoneyCents(row.maxDiscountCents || 0))}</div>` },
        { label: "Status", render: (row) => (row.active ? `<span class="pill">Ativo</span>` : `<span class="pill pill-danger">Inativo</span>`) },
        { label: "Válido até", render: (row) => `<div>${escapeHtml(formatDate(row.expiresAt))}</div>` },
        {
          label: "Ações",
          render: (row) =>
            `<button type="button" class="btn btn-ghost" data-coupon-delete="${escapeHtml(row.code)}">Remover</button>`
        }
      ],
      rows: state.rows,
      getRowId: (row) => row.code
    });

    table.addEventListener("click", async (event) => {
      const button = event.target instanceof Element ? event.target.closest("[data-coupon-delete]") : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const code = String(button.getAttribute("data-coupon-delete") || "").trim();
      if (!code) return;
      const confirmed = window.confirm(`Remover o código ${code}?`);
      if (!confirmed) return;

      try {
        await api(`/api/admin/coupons/${encodeURIComponent(code)}`, { method: "DELETE", json: {} });
        toast("Código removido.", { tone: "success" });
        await reload();
      } catch (error) {
        toast(`Falha ao remover: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      }
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

    mount.appendChild(formSection);
    mount.appendChild(table);
    mount.appendChild(pager);
  }

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar códigos: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar códigos de acesso.</div>`;
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

