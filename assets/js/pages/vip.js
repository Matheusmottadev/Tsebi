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

export function createVipPage({ mount, drawer }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 30,
    total: 0,
    rows: []
  };

  async function load() {
    const data = await api(
      `/api/admin/vip?query=${encodeURIComponent(state.query)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
  }

  function render() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        {
          label: "Pessoa",
          render: (v) =>
            `<div>
              <div style="font-weight:600">${escapeHtml(v.name || "—")}</div>
              <div style="color:var(--muted);font-size:12px">${escapeHtml(v.cpf || "")}</div>
            </div>`
        },
        { label: "Email", render: (v) => `<div>${escapeHtml(v.email || "—")}</div>` },
        { label: "Telefone", render: () => `<div style="color:var(--muted);">—</div>` },
        { label: "Inscrito em", render: (v) => `<div>${escapeHtml(formatDate(v.subscribedAt))}</div>` },
        { label: "Origem", render: (v) => `<div>${escapeHtml(v.source || "—")}</div>` },
        {
          label: "Cliente?",
          render: (v) =>
            v.accountCreated ? `<span class="pill">Conta criada</span>` : `<span class="pill pill-warn">Sem conta</span>`
        }
      ],
      rows: state.rows,
      getRowId: (v) => v.id,
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

  async function openDrawer(vipId) {
    const data = await api(`/api/admin/vip/${encodeURIComponent(vipId)}`);
    const subscriber = data?.subscriber || null;
    if (!subscriber) {
      toast("Inscrito VIP não encontrado.", { tone: "error" });
      return;
    }

    const original = {
      name: String(subscriber.name || ""),
      email: String(subscriber.email || ""),
      birthDate: String(subscriber.birthDate || ""),
      cpf: String(subscriber.cpf || ""),
      cep: String(subscriber.cep || ""),
      accountCreated: Boolean(subscriber.accountCreated)
    };

    const root = document.createElement("div");
    root.innerHTML = `
      <div class="section">
        <h3>Dados</h3>
        <div class="form-grid">
          <label class="label full">
            <span>Nome</span>
            <input class="field" data-key="name" type="text" value="${escapeHtml(original.name)}" />
          </label>
          <label class="label full">
            <span>Email</span>
            <input class="field" data-key="email" type="email" value="${escapeHtml(original.email)}" />
          </label>
          <label class="label">
            <span>Nascimento</span>
            <input class="field" data-key="birthDate" type="date" value="${escapeHtml(original.birthDate)}" />
          </label>
          <label class="label">
            <span>CPF</span>
            <input class="field" data-key="cpf" type="text" value="${escapeHtml(original.cpf)}" />
          </label>
          <label class="label">
            <span>CEP</span>
            <input class="field" data-key="cep" type="text" value="${escapeHtml(original.cep)}" />
          </label>
          <label class="label">
            <span>Conta criada</span>
            <select class="field" data-key="accountCreated">
              <option value="true" ${original.accountCreated ? "selected" : ""}>Sim</option>
              <option value="false" ${!original.accountCreated ? "selected" : ""}>Não</option>
            </select>
          </label>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="save">Salvar alterações</button>
        </div>
      </div>

      <div class="section danger-zone">
        <h3>Danger zone</h3>
        <button type="button" class="btn btn-danger" data-action="delete">Excluir inscrito</button>
      </div>
    `;

    root.addEventListener("input", (event) => {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLSelectElement) && !(el instanceof HTMLTextAreaElement)) return;
      const key = String(el.dataset.key || "");
      if (!key) return;
      const value = el.value;
      const before = key === "accountCreated" ? String(Boolean(original.accountCreated)) : String(original[key] ?? "");
      el.classList.toggle("dirty", String(value ?? "") !== before);
    });

    async function save() {
      const patch = {};
      root.querySelectorAll("[data-key]").forEach((el) => {
        const key = String(el.dataset.key || "");
        if (!key) return;
        let value = el.value;
        if (key === "accountCreated") value = value === "true";
        if (String(value ?? "") !== String(key === "accountCreated" ? Boolean(original.accountCreated) : original[key] ?? "")) {
          patch[key] = value;
        }
      });
      if (Object.keys(patch).length === 0) {
        toast("Nenhuma alteração para salvar.", { tone: "info" });
        return;
      }

      const diffs = buildDiff(original, { ...original, ...patch }, {
        name: "Nome",
        email: "Email",
        birthDate: "Nascimento",
        cpf: "CPF",
        cep: "CEP",
        accountCreated: "Conta criada"
      });

      const ok = await confirmDiff({
        title: "Confirmar alterações",
        message: "Revise o diff antes de salvar.",
        diffs,
        tone: "ok"
      });
      if (!ok) return;

      await api(`/api/admin/vip/${encodeURIComponent(vipId)}`, { method: "PATCH", json: patch });
      toast("VIP atualizado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    async function remove() {
      const ok = await confirmDiff({
        title: "Excluir inscrito VIP",
        message: "Essa ação é crítica (pode ser reversível via auditoria).",
        diffs: [{ field: "Ação", before: "—", after: "Excluir inscrito VIP" }],
        tone: "danger"
      });
      if (!ok) return;

      await api(`/api/admin/vip/${encodeURIComponent(vipId)}`, { method: "DELETE" });
      toast("VIP excluído.", { tone: "success" });
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
        if (action === "delete") await remove();
      } catch (error) {
        toast(`Falha: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      }
    });

    drawer.open({
      titleText: `VIP • ${subscriber.email || subscriber.id}`,
      content: root
    });
  }

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar VIP: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar VIP.</div>`;
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
          <h3>Novo inscrito VIP</h3>
          <div class="form-grid">
            <label class="label full"><span>Nome</span><input class="field" data-key="name" type="text" /></label>
            <label class="label full"><span>Email</span><input class="field" data-key="email" type="email" /></label>
            <label class="label"><span>Nascimento</span><input class="field" data-key="birthDate" type="date" /></label>
            <label class="label"><span>CPF</span><input class="field" data-key="cpf" type="text" /></label>
            <label class="label"><span>CEP</span><input class="field" data-key="cep" type="text" /></label>
            <label class="label"><span>Conta criada</span>
              <select class="field" data-key="accountCreated">
                <option value="false" selected>Não</option>
                <option value="true">Sim</option>
              </select>
            </label>
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
          if (key === "accountCreated") value = value === "true";
          payload[key] = value;
        });

        try {
          await api("/api/admin/vip", { method: "POST", json: payload });
          toast("VIP cadastrado.", { tone: "success" });
          drawer.close();
          await reload();
        } catch (error) {
          toast(`Falha ao cadastrar VIP: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
        }
      });

      drawer.open({ titleText: "VIP • cadastrar", content: root });
    }
  };
}

