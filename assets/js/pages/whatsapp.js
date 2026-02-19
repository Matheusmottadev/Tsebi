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

function formatDate(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function parseCsvText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = lines[0].toLowerCase();
  const hasHeader = header.includes("phone") || header.includes("telefone") || header.includes("celular");
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => line.split(/[;,]/).map((part) => part.trim()))
    .map(([phone, name]) => ({
      phone: String(phone || "").trim(),
      name: String(name || "").trim()
    }))
    .filter((item) => item.phone);
}

export function createWhatsAppPage({ mount }) {
  const state = {
    contactQuery: "",
    contacts: [],
    vipQuery: "",
    vipPage: 1,
    vipPageSize: 30,
    vipTotal: 0,
    vipRows: [],
    logs: [],
    estimate: null
  };

  async function loadContacts() {
    const data = await api(`/api/admin/whatsapp/contacts?query=${encodeURIComponent(state.contactQuery)}&limit=50`);
    state.contacts = Array.isArray(data.rows) ? data.rows : [];
  }

  async function loadVip() {
    const data = await api(
      `/api/admin/whatsapp/vip?query=${encodeURIComponent(state.vipQuery)}&page=${state.vipPage}&pageSize=${state.vipPageSize}`
    );
    state.vipRows = Array.isArray(data.rows) ? data.rows : [];
    state.vipTotal = Number(data.total || 0);
  }

  async function loadLogs() {
    const data = await api(`/api/admin/whatsapp/logs?limit=80&offset=0`);
    state.logs = Array.isArray(data.rows) ? data.rows : [];
  }

  async function loadEstimate() {
    const data = await api(`/api/admin/whatsapp/vip/estimate`);
    state.estimate = data || null;
  }

  function renderContactsSection() {
    const rows = state.contacts;
    const table = renderTable({
      columns: [
        { label: "Telefone", render: (v) => `<strong>${escapeHtml(v.phone || "—")}</strong>` },
        { label: "Última mensagem", render: (v) => `<div>${escapeHtml(v.lastInboundText || "—")}</div>` },
        { label: "Recebida em", render: (v) => `<div>${escapeHtml(formatDate(v.lastInboundAt))}</div>` },
        {
          label: "Tempo restante",
          render: (v) => {
            if (!v.windowExpiresAt) return `<div>—</div>`;
            const diffMs = new Date(v.windowExpiresAt).getTime() - Date.now();
            if (diffMs <= 0) return `<div>—</div>`;
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return `<div>${hours}h ${minutes}m</div>`;
          }
        },
        {
          label: "Janela 24h",
          render: (v) => {
            const expiresAt = v.windowExpiresAt ? new Date(v.windowExpiresAt).getTime() : 0;
            const active = expiresAt > Date.now();
            return active ? `<span class="pill">Ativa</span>` : `<span class="pill pill-warn">Inativa</span>`;
          }
        }
      ],
      rows,
      getRowId: (v) => v.id
    });

    return table;
  }

  function renderVipSection() {
    const table = renderTable({
      columns: [
        { label: "Telefone", render: (v) => `<strong>${escapeHtml(v.phone || "—")}</strong>` },
        { label: "Nome", render: (v) => `<div>${escapeHtml(v.name || "—")}</div>` },
        { label: "Origem", render: (v) => `<div>${escapeHtml(v.source || "—")}</div>` },
        { label: "Opt-in", render: (v) => `<div>${escapeHtml(formatDate(v.optedInAt))}</div>` },
        {
          label: "Ações",
          render: (v) =>
            `<button class="btn btn-ghost" type="button" data-action="vip-remove" data-id="${escapeHtml(v.id)}">Remover</button>`
        }
      ],
      rows: state.vipRows,
      getRowId: (v) => v.id
    });

    const pager = renderPagination({
      page: state.vipPage,
      pageSize: state.vipPageSize,
      total: state.vipTotal,
      onChange: async (nextPage) => {
        state.vipPage = nextPage;
        await reload();
      }
    });

    const wrap = document.createElement("div");
    wrap.appendChild(table);
    wrap.appendChild(pager);
    return wrap;
  }

  function renderLogsSection() {
    const table = renderTable({
      columns: [
        { label: "Data", render: (v) => `<div>${escapeHtml(formatDate(v.createdAt))}</div>` },
        { label: "Tipo", render: (v) => `<div>${escapeHtml(v.type || "—")}</div>` },
        { label: "Template", render: (v) => `<div>${escapeHtml(v.templateName || "—")}</div>` },
        { label: "Qtde", render: (v) => `<div>${escapeHtml(String(v.quantity || 0))}</div>` },
        {
          label: "Custo estimado",
          render: (v) => `<div>R$ ${(Number(v.costEstimateCents || 0) / 100).toFixed(2)}</div>`
        }
      ],
      rows: state.logs,
      getRowId: (v) => v.id
    });

    return table;
  }

  function render() {
    mount.innerHTML = "";

    const root = document.createElement("div");
    root.className = "whatsapp-grid";
    root.innerHTML = `
      <section class="card">
        <div class="card-head">
          <h3>Atendimento</h3>
          <p>Buscar por telefone e ver janela ativa.</p>
        </div>
        <div class="card-body">
          <div class="form-grid">
            <label class="label full">
              <span>Telefone</span>
              <input id="waContactQuery" class="field" type="text" placeholder="+55..." />
            </label>
          </div>
          <div class="card-actions">
            <button id="waContactSearch" type="button" class="btn btn-ghost">Buscar</button>
          </div>
          <div id="waContactsMount"></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Lista VIP (WhatsApp)</h3>
          <p>Adicionar manualmente ou importar CSV.</p>
        </div>
        <div class="card-body">
          <div class="form-grid">
            <label class="label">
              <span>Telefone</span>
              <input id="waVipPhone" class="field" type="text" placeholder="55..." />
            </label>
            <label class="label">
              <span>Nome</span>
              <input id="waVipName" class="field" type="text" placeholder="Nome (opcional)" />
            </label>
            <label class="label full">
              <span>Importar CSV</span>
              <input id="waVipCsv" class="field" type="file" accept=".csv,text/csv" />
            </label>
          </div>
          <div class="card-actions">
            <button id="waVipAdd" type="button" class="btn">Adicionar</button>
            <button id="waVipImport" type="button" class="btn btn-ghost">Importar CSV</button>
          </div>
          <div id="waVipMount"></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Enviar nova coleção</h3>
          <p>Envio manual para VIP com template de marketing.</p>
        </div>
        <div class="card-body">
          <div class="form-grid">
            <label class="label full">
              <span>Nome da coleção</span>
              <input id="waCollectionName" class="field" type="text" placeholder="Ex.: Coleção Gênesis" />
            </label>
            <label class="label full">
              <span>Mensagem</span>
              <textarea id="waCollectionMessage" class="field" rows="3" placeholder="Mensagem curta do lançamento"></textarea>
            </label>
          </div>
          <div class="card-actions">
            <button id="waEstimateBtn" type="button" class="btn btn-ghost">Calcular custo</button>
            <button id="waSendBtn" type="button" class="btn">Enviar</button>
          </div>
          <div class="wa-estimate" id="waEstimate"></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Logs</h3>
          <p>Envios e custos estimados.</p>
        </div>
        <div class="card-body" id="waLogsMount"></div>
      </section>
    `;

    mount.appendChild(root);

    const contactsMount = root.querySelector("#waContactsMount");
    const vipMount = root.querySelector("#waVipMount");
    const logsMount = root.querySelector("#waLogsMount");

    if (contactsMount) contactsMount.appendChild(renderContactsSection());
    if (vipMount) vipMount.appendChild(renderVipSection());
    if (logsMount) logsMount.appendChild(renderLogsSection());

    vipMount?.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = String(btn.dataset.action || "");
      if (action !== "vip-remove") return;
      const id = String(btn.dataset.id || "").trim();
      if (!id) return;
      await api(`/api/admin/whatsapp/vip/${encodeURIComponent(id)}`, { method: "DELETE" });
      toast("Contato removido.", { tone: "success" });
      await reload();
    });

    root.querySelector("#waContactSearch")?.addEventListener("click", async () => {
      const input = root.querySelector("#waContactQuery");
      state.contactQuery = String(input?.value || "").trim();
      await reload();
    });

    root.querySelector("#waVipAdd")?.addEventListener("click", async () => {
      const phone = String(root.querySelector("#waVipPhone")?.value || "").trim();
      const name = String(root.querySelector("#waVipName")?.value || "").trim();
      if (!phone) {
        toast("Informe o telefone.", { tone: "error" });
        return;
      }
      await api("/api/admin/whatsapp/vip", { method: "POST", json: { phone, name } });
      toast("VIP adicionado.", { tone: "success" });
      await reload();
    });

    root.querySelector("#waVipImport")?.addEventListener("click", async () => {
      const fileInput = root.querySelector("#waVipCsv");
      const file = fileInput?.files?.[0];
      if (!file) {
        toast("Selecione um CSV.", { tone: "error" });
        return;
      }
      const text = await file.text();
      const items = parseCsvText(text);
      if (!items.length) {
        toast("CSV vazio ou inválido.", { tone: "error" });
        return;
      }
      await api("/api/admin/whatsapp/vip/import", { method: "POST", json: { items } });
      toast(`Importados: ${items.length}`, { tone: "success" });
      await reload();
    });

    root.querySelector("#waEstimateBtn")?.addEventListener("click", async () => {
      await loadEstimate();
      const estimate = state.estimate;
      const el = root.querySelector("#waEstimate");
      if (el && estimate) {
        el.textContent = `Contatos: ${estimate.quantity} • Custo estimado: R$ ${(estimate.costEstimateCents / 100).toFixed(2)}`;
      }
    });

    root.querySelector("#waSendBtn")?.addEventListener("click", async () => {
      const collectionName = String(root.querySelector("#waCollectionName")?.value || "").trim();
      const message = String(root.querySelector("#waCollectionMessage")?.value || "").trim();
      if (!collectionName || !message) {
        toast("Preencha nome da coleção e mensagem.", { tone: "error" });
        return;
      }
      const result = await api("/api/admin/whatsapp/vip/send", {
        method: "POST",
        json: { collectionName, message }
      });
      toast(`Enviado para ${result.quantity} contatos.`, { tone: "success" });
      await reload();
    });
  }

  async function reload() {
    try {
      await Promise.all([loadContacts(), loadVip(), loadLogs()]);
      render();
    } catch (error) {
      toast(`Falha WhatsApp: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar WhatsApp.</div>`;
    }
  }

  return {
    reload
  };
}
