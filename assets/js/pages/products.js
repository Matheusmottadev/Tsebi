import { api, getCsrfToken } from "../api.js";
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

function formatMoneyFromCents(cents, currency = "BRL") {
  const amount = Math.max(0, Number(cents || 0)) / 100;
  return amount.toLocaleString("pt-BR", { style: "currency", currency: String(currency || "BRL").toUpperCase() });
}

function formatDate(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
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

function parseOptionsInput(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;]+/)
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
    )
  );
}

function formatOptionsInput(values) {
  return Array.isArray(values) ? values.map((entry) => String(entry || "").trim()).filter(Boolean).join(", ") : "";
}

function parseVariantStockInput(value) {
  const result = {};
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const equalIdx = line.indexOf("=");
    if (equalIdx <= 0) return;
    const pair = line.slice(0, equalIdx).trim();
    const qtyRaw = line.slice(equalIdx + 1).trim();
    const qty = Math.max(0, Math.floor(Number(qtyRaw || 0)));
    if (!pair) return;

    const parts = pair.includes("|") ? pair.split("|") : pair.split("__");
    if (parts.length !== 2) return;
    const color = String(parts[0] || "").trim();
    const size = String(parts[1] || "").trim();
    if (!color || !size) return;

    result[`${color}__${size}`] = qty;
  });

  return result;
}

function formatVariantStockInput(variantStock) {
  const entries =
    variantStock && typeof variantStock === "object" && !Array.isArray(variantStock)
      ? Object.entries(variantStock)
      : [];

  return entries
    .map(([key, qty]) => {
      const parts = String(key || "").split("__");
      if (parts.length !== 2) return "";
      return `${parts[0]}|${parts[1]}=${Math.max(0, Math.floor(Number(qty || 0)))}`;
    })
    .filter(Boolean)
    .join("\n");
}

export function createProductsPage({ mount, drawer, getStatusFilter, getStockFilter }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 30,
    total: 0,
    rows: []
  };

  async function load() {
    const status = String(getStatusFilter?.() || "").trim();
    const stock = String(getStockFilter?.() || "").trim();
    const data = await api(
      `/api/admin/products?query=${encodeURIComponent(state.query)}&status=${encodeURIComponent(status)}&stock=${encodeURIComponent(stock)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data.rows) ? data.rows : Array.isArray(data.products) ? data.products : [];
    state.total = Number(data.total || 0);
  }

  function render() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        {
          label: "Produto",
          render: (p) =>
            `<div style="display:flex;align-items:center;gap:10px;">
              <img src="${escapeHtml(p.image || "")}" alt="" style="width:38px;height:38px;object-fit:cover;border-radius:12px;border:1px solid var(--line);" />
              <div>
                <div style="font-weight:600">${escapeHtml(p.name || "—")}</div>
                <div style="color:var(--muted);font-size:12px">${escapeHtml(p.sku || p.id || "")}</div>
              </div>
            </div>`
        },
        { label: "SKU", render: (p) => `<div>${escapeHtml(p.sku || p.id || "—")}</div>` },
        { label: "Preço", render: (p) => `<div>${escapeHtml(formatMoneyFromCents(p.unitAmount, p.currency))}</div>` },
        { label: "Estoque", render: (p) => `<div>${escapeHtml(p.stock)}</div>` },
        {
          label: "Status",
          render: (p) => {
            const isActive = Boolean(p.active);
            return `
              <label class="switch" data-no-row="1">
                <input type="checkbox" data-action="toggle-active" data-id="${escapeHtml(p.id)}" ${isActive ? "checked" : ""} />
                <span class="switch-track">
                  <span class="switch-thumb"></span>
                </span>
                <span class="switch-label">${isActive ? "Ativo" : "Inativo"}</span>
              </label>
            `;
          }
        },
        { label: "Atualizado", render: (p) => `<div>${escapeHtml(formatDate(p.updatedAt || p.createdAt))}</div>` }
      ],
      rows: state.rows,
      getRowId: (p) => p.id,
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

    table.addEventListener(
      "click",
      (event) => {
        const stop = event.target instanceof Element ? event.target.closest("[data-no-row]") : null;
        if (stop) event.stopPropagation();
      },
      true
    );

    table.addEventListener("change", async (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.dataset.action !== "toggle-active") return;
      const productId = String(input.dataset.id || "");
      if (!productId) return;
      const nextActive = Boolean(input.checked);
      input.disabled = true;
      try {
        await api(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "PATCH", json: { active: nextActive } });
        const row = state.rows.find((p) => String(p.id) === productId);
        if (row) row.active = nextActive;
        const label = input.closest(".switch")?.querySelector(".switch-label");
        if (label) label.textContent = nextActive ? "Ativo" : "Inativo";
        toast(`Produto ${nextActive ? "ativado" : "desativado"}.`, { tone: "success" });
      } catch (error) {
        input.checked = !nextActive;
        toast(`Falha ao atualizar status: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      } finally {
        input.disabled = false;
      }
    });

    mount.appendChild(table);
    mount.appendChild(pager);
  }

  function buildDrawerContent(product) {
    const original = {
      name: String(product.name || ""),
      priceCents: String(Number(product.unitAmount || 0)),
      stockQty: String(Number(product.stock || 0)),
      sizesInput: formatOptionsInput(product.sizes || []),
      colorsInput: formatOptionsInput(product.colors || []),
      variantStockInput: formatVariantStockInput(product.variantStock || {}),
      currency: String(product.currency || "brl"),
      imageUrl: String(product.image || ""),
      active: Boolean(product.active)
    };

    const root = document.createElement("div");
    root.innerHTML = `
      <div class="section">
        <h3>Detalhes</h3>
        <div class="form-grid">
          <label class="label full">
            <span>Nome</span>
            <input class="field" data-key="name" type="text" value="${escapeHtml(original.name)}" />
          </label>
          <label class="label">
            <span>Preço (centavos)</span>
            <input class="field" data-key="priceCents" type="number" min="0" step="1" value="${escapeHtml(original.priceCents)}" />
          </label>
          <label class="label">
            <span>Estoque</span>
            <input class="field" data-key="stockQty" type="number" min="0" step="1" value="${escapeHtml(original.stockQty)}" />
          </label>
          <label class="label full">
            <span>Cores (separadas por vírgula)</span>
            <input class="field" data-key="colorsInput" type="text" value="${escapeHtml(original.colorsInput)}" placeholder="Preto, Branco, Marfim" />
          </label>
          <label class="label full">
            <span>Tamanhos (separados por vírgula)</span>
            <input class="field" data-key="sizesInput" type="text" value="${escapeHtml(original.sizesInput)}" placeholder="P, M, G, GG" />
          </label>
          <label class="label full">
            <span>Estoque por variação (Cor|Tamanho=Qtd)</span>
            <textarea class="field" data-key="variantStockInput" rows="4" placeholder="Preto|M=5&#10;Preto|G=2">${escapeHtml(original.variantStockInput)}</textarea>
          </label>
          <label class="label">
            <span>Moeda</span>
            <input class="field" data-key="currency" type="text" value="${escapeHtml(original.currency)}" />
          </label>
          <label class="label">
            <span>Status</span>
            <label class="switch switch-inline">
              <input type="checkbox" data-key="active" ${original.active ? "checked" : ""} />
              <span class="switch-track">
                <span class="switch-thumb"></span>
              </span>
              <span class="switch-label">${original.active ? "Ativo" : "Inativo"}</span>
            </label>
          </label>
          <label class="label full">
            <span>Imagem</span>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <img src="${escapeHtml(original.imageUrl)}" alt="" style="width:86px;height:86px;object-fit:cover;border-radius:16px;border:1px solid var(--line);" />
              <input class="field" data-key="imageUrl" type="text" value="${escapeHtml(original.imageUrl)}" placeholder="https://..." style="flex:1;min-width:min(320px, 92vw);" />
              <input class="field" data-action="imageFile" type="file" accept="image/*" />
            </div>
            <span style="color:var(--muted);font-size:12px;">Upload envia direto para o Cloudflare R2 (não salva no disco do Railway).</span>
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="save">Salvar alterações</button>
        </div>
      </div>

      <div class="section danger-zone">
        <h3>Danger zone</h3>
        <button type="button" class="btn btn-danger" data-action="archive">Arquivar/ocultar</button>
      </div>
    `;

    root.addEventListener("input", (event) => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLTextAreaElement)) return;
      const key = String(el.dataset.key || "");
      if (!key) return;
      const current = el instanceof HTMLInputElement && el.type === "checkbox" ? String(el.checked) : String(el.value ?? "");
      const before = key === "active" ? String(Boolean(original.active)) : String(original[key] ?? "");
      el.classList.toggle("dirty", current !== before);
      if (el instanceof HTMLInputElement && el.type === "checkbox") {
        const label = el.closest(".switch")?.querySelector(".switch-label");
        if (label) label.textContent = el.checked ? "Ativo" : "Inativo";
      }
    });

    return { root, original };
  }

  async function openDrawer(productId) {
    const data = await api(`/api/admin/products/${encodeURIComponent(productId)}`);
    const product = data?.product || null;
    if (!product) {
      toast("Produto não encontrado.", { tone: "error" });
      return;
    }

    const { root, original } = buildDrawerContent(product);

    async function save() {
      const patch = {};
      root.querySelectorAll("[data-key]").forEach((el) => {
        const key = String(el.dataset.key || "");
        if (!key) return;
        let value = el instanceof HTMLInputElement && el.type === "checkbox" ? el.checked : el.value;
        if (key === "active") value = Boolean(value);
        if (key === "sizesInput") value = parseOptionsInput(value);
        if (key === "colorsInput") value = parseOptionsInput(value);
        if (key === "variantStockInput") value = parseVariantStockInput(value);
        if (String(value ?? "") !== String(key === "active" ? Boolean(original.active) : original[key] ?? "")) {
          const targetKey =
            key === "sizesInput" ? "sizes" : key === "colorsInput" ? "colors" : key === "variantStockInput" ? "variantStock" : key;
          patch[targetKey] = value;
        }
      });

      if (Object.keys(patch).length === 0) {
        toast("Nenhuma alteração para salvar.", { tone: "info" });
        return;
      }

      const preview = {
        ...original,
        ...patch,
        sizesInput: Object.prototype.hasOwnProperty.call(patch, "sizes")
          ? formatOptionsInput(patch.sizes)
          : original.sizesInput,
        colorsInput: Object.prototype.hasOwnProperty.call(patch, "colors")
          ? formatOptionsInput(patch.colors)
          : original.colorsInput,
        variantStockInput: Object.prototype.hasOwnProperty.call(patch, "variantStock")
          ? formatVariantStockInput(patch.variantStock)
          : original.variantStockInput
      };
      const diffs = buildDiff(
        original,
        preview,
        {
          name: "Nome",
          priceCents: "Preço (centavos)",
          stockQty: "Estoque",
          sizesInput: "Tamanhos",
          colorsInput: "Cores",
          variantStockInput: "Estoque por variação",
          currency: "Moeda",
          imageUrl: "Imagem (URL)",
          active: "Status ativo"
        }
      );
      const ok = await confirmDiff({
        title: "Confirmar alterações",
        message: "Revise o diff antes de salvar.",
        diffs,
        tone: "ok"
      });
      if (!ok) return;

      await api(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "PATCH", json: patch });
      toast("Produto atualizado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    async function archive() {
      const ok = await confirmDiff({
        title: "Arquivar produto",
        message: "Isso marca o produto como inativo (oculto).",
        diffs: [{ field: "Ação", before: "—", after: "Arquivar/ocultar" }],
        tone: "danger"
      });
      if (!ok) return;
      await api(`/api/admin/products/${encodeURIComponent(productId)}`, { method: "DELETE" });
      toast("Produto arquivado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    async function uploadImage(file) {
      if (!file) return;
      const ok = await confirmDiff({
        title: "Enviar imagem",
        message: `Enviar "${file.name}" agora?`,
        diffs: [{ field: "Arquivo", before: "—", after: file.name }],
        tone: "ok"
      });
      if (!ok) return;

      const buf = await file.arrayBuffer();
      const res = await fetch(`/api/admin/products/${encodeURIComponent(productId)}/image`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-csrf-token": getCsrfToken() || ""
        },
        body: buf
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(payload?.error || "IMAGE_UPLOAD_FAILED"));
      }
      toast("Imagem enviada.", { tone: "success" });
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
        if (action === "archive") await archive();
      } catch (error) {
        toast(`Falha: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      }
    });

    root.addEventListener("change", async (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (String(input.dataset.action || "") !== "imageFile") return;
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.value = "";
      try {
        await uploadImage(file);
      } catch (error) {
        toast(`Falha ao enviar imagem: ${error?.message || "IMAGE_UPLOAD_FAILED"}`, { tone: "error" });
      }
    });

    drawer.open({
      titleText: `Produto • ${product.sku || product.id}`,
      content: root
    });
  }

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar produtos: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar produtos.</div>`;
    }
  }

  return {
    setQuery: (q) => {
      state.query = String(q || "").trim();
      state.page = 1;
    },
    reload,
    openCreate: async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="section">
          <h3>Novo produto</h3>
          <div class="form-grid">
            <label class="label full"><span>SKU</span><input class="field" data-key="sku" type="text" placeholder="ex: vestido-longo" /></label>
            <label class="label full"><span>Nome</span><input class="field" data-key="name" type="text" /></label>
            <label class="label"><span>Preço (centavos)</span><input class="field" data-key="priceCents" type="number" min="0" step="1" /></label>
            <label class="label"><span>Estoque</span><input class="field" data-key="stockQty" type="number" min="0" step="1" /></label>
            <label class="label full"><span>Cores (separadas por vírgula)</span><input class="field" data-key="colorsInput" type="text" placeholder="Preto, Branco, Marfim" /></label>
            <label class="label full"><span>Tamanhos (separados por vírgula)</span><input class="field" data-key="sizesInput" type="text" placeholder="P, M, G, GG" /></label>
            <label class="label full"><span>Estoque por variação (Cor|Tamanho=Qtd)</span><textarea class="field" data-key="variantStockInput" rows="4" placeholder="Preto|M=5&#10;Preto|G=2"></textarea></label>
            <label class="label"><span>Moeda</span><input class="field" data-key="currency" type="text" value="brl" /></label>
            <label class="label"><span>Status</span>
              <select class="field" data-key="active">
                <option value="true" selected>Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </label>
            <label class="label full"><span>Imagem (URL opcional)</span><input class="field" data-key="imageUrl" type="text" placeholder="https://..." /></label>
          </div>
          <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
            <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
            <button type="button" class="btn" data-action="create">Criar</button>
          </div>
        </div>
      `;

      root.addEventListener("click", async (event) => {
        const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
        if (!(btn instanceof HTMLButtonElement)) return;
        const action = String(btn.dataset.action || "");
        if (action === "cancel") {
          drawer.close();
          return;
        }
        if (action !== "create") return;

        const payload = {};
        root.querySelectorAll("[data-key]").forEach((el) => {
          const key = String(el.dataset.key || "");
          if (!key) return;
          let value = el.value;
          if (key === "active") value = value === "true";
          if (key === "priceCents" || key === "stockQty") value = Number(value || 0);
          if (key === "sizesInput") value = parseOptionsInput(value);
          if (key === "colorsInput") value = parseOptionsInput(value);
          if (key === "variantStockInput") value = parseVariantStockInput(value);
          const targetKey =
            key === "sizesInput" ? "sizes" : key === "colorsInput" ? "colors" : key === "variantStockInput" ? "variantStock" : key;
          payload[targetKey] = value;
        });

        try {
          await api("/api/admin/products", { method: "POST", json: payload });
          toast("Produto criado.", { tone: "success" });
          drawer.close();
          await reload();
        } catch (error) {
          toast(`Falha ao criar produto: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
        }
      });

      drawer.open({ titleText: "Produtos • criar", content: root });
    }
  };
}
