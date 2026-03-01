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
  if (Number.isNaN(date.getTime())) return "—;
  return date.toLocaleString("pt-BR");
}

function initials(nameOrEmail) {
  const raw = String(nameOrEmail || "").trim();
  if (!raw) return "A";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
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

function normalizeTitle(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const allowed = new Set(["sr", "sra", "srta", "nao_informar"]);
  if (!allowed.has(normalized)) return "nao_informar";
  return normalized;
}

function titleField({ key = "title", value = "nao_informar" } = {}) {
  const current = normalizeTitle(value);
  return `
    <label class="label">
      <span>Título</span>
      <select class="field" data-key="${escapeHtml(key)}">
        <option value="sr" ${current === "sr" ? "selected" : ""}>Sr.</option>
        <option value="sra" ${current === "sra" ? "selected" : ""}>Sra.</option>
        <option value="srta" ${current === "srta" ? "selected" : ""}>Srta.</option>
        <option value="nao_informar" ${current === "nao_informar" ? "selected" : ""}>Prefiro não responder</option>
      </select>
    </label>
  `;
}

function titlePrefix(value) {
  const title = normalizeTitle(value);
  if (title === "sr") return "Sr.";
  if (title === "sra") return "Sra.";
  if (title === "srta") return "Srta.";
  return "";
}

export function createUsersPage({ mount, drawer, getStatusFilter }) {
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
      `/api/admin/users?query=${encodeURIComponent(state.query)}&status=${encodeURIComponent(status)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data.users) ? data.users : Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
  }

  function statusPill(status) {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "disabled") return `<span class="pill pill-danger">Desativado</span>`;
    return `<span class="pill">Ativo</span>`;
  }

  function render() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        {
          label: "Usuário",
          render: (u) => {
            const prefix = titlePrefix(u.title);
            const safeName = String(u.name || "—);
            const displayName = prefix ? `${prefix} ${safeName}` : safeName;
            return `<div style="display:flex;align-items:center;gap:10px;">
              <div class="avatar">${escapeHtml(initials(u.name || u.email))}</div>
              <div>
                <div style="font-weight:600">${escapeHtml(displayName)}</div>
                <div style="color:var(--muted);font-size:12px">${escapeHtml(u.cpf || u.cpfMasked || "")}</div>
              </div>
            </div>`;
          }
        },
        { label: "Email", render: (u) => `<div>${escapeHtml(u.email || "—)}</div>` },
        { label: "Telefone", render: (u) => `<div>${escapeHtml(u.phone || "—)}</div>` },
        { label: "Status", render: (u) => statusPill(u.status) },
        { label: "Último login", render: (u) => `<div>${escapeHtml(formatDate(u.lastLoginAt))}</div>` },
        { label: "Criado em", render: (u) => `<div>${escapeHtml(formatDate(u.createdAt))}</div>` }
      ],
      rows: state.rows,
      getRowId: (u) => u.id,
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

  function inputField({ label, key, value = "", type = "text", full = false } = {}) {
    const id = `u_${key}`;
    return `
      <label class="label ${full ? "full" : ""}">
        <span>${escapeHtml(label)}</span>
        <input class="field" id="${escapeHtml(id)}" data-key="${escapeHtml(key)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" />
      </label>
    `;
  }

  function textareaField({ label, key, value = "" } = {}) {
    const id = `u_${key}`;
    return `
      <label class="label full">
        <span>${escapeHtml(label)}</span>
        <textarea class="field" id="${escapeHtml(id)}" data-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>
      </label>
    `;
  }

  function bindDirtyTracking(root, original) {
    function markDirty(event) {
      const el = event.target;
      if (!(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement) && !(el instanceof HTMLSelectElement)) return;
      const key = String(el.dataset.key || "");
      if (!key) return;
      const current = el.value;
      const before = String(original?.[key] ?? "");
      el.classList.toggle("dirty", String(current ?? "") !== before);
    }
    root.addEventListener("input", markDirty);
    root.addEventListener("change", markDirty);
  }

  async function openDrawer(userId) {
    const data = await api(`/api/admin/users/${encodeURIComponent(userId)}`);
    const user = data?.user || null;
    if (!user) {
      toast("Usuário não encontrado.", { tone: "error" });
      return;
    }

    const original = {
      title: normalizeTitle(user.title),
      name: String(user.name || ""),
      email: String(user.email || ""),
      phone: String(user.phone || ""),
      birthDate: String(user.birthDate || ""),
      cpf: String(user.cpf || ""),
      cep: String(user.cep || ""),
      adminNotes: ""
    };

    const root = document.createElement("div");
    root.innerHTML = `
      <div class="section">
        <h3>Dados</h3>
        <div class="form-grid">
          ${titleField({ key: "title", value: original.title })}
          ${inputField({ label: "Nome", key: "name", value: original.name, full: true })}
          ${inputField({ label: "Email", key: "email", value: original.email, type: "email", full: true })}
          ${inputField({ label: "Telefone", key: "phone", value: original.phone, full: true })}
          ${inputField({ label: "Nascimento", key: "birthDate", value: original.birthDate, type: "date" })}
          ${inputField({ label: "CPF", key: "cpf", value: original.cpf })}
          ${inputField({ label: "CEP", key: "cep", value: original.cep })}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
          <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="save">Salvar alterações</button>
        </div>
      </div>

      <div class="section danger-zone">
        <h3>Danger zone</h3>
        <div style="display:grid;gap:10px;">
          <button type="button" class="btn btn-ghost" data-action="logout-sessions">Invalidar sessões</button>
          <button type="button" class="btn btn-ghost" data-action="temp-password">Gerar senha temporária</button>
          <button type="button" class="btn btn-danger" data-action="disable-login">Apagar login (desativar)</button>
          <button type="button" class="btn btn-danger" data-action="delete-user">Excluir usuário</button>
        </div>
        <p style="color:var(--muted);font-size:13px;margin:10px 0 0;">
          Ações críticas exigem confirmação e são auditadas.
        </p>
      </div>
    `;

    bindDirtyTracking(root, original);

    async function handleSave() {
      const patch = {};
      root.querySelectorAll("[data-key]").forEach((el) => {
        const key = String(el.dataset.key || "");
        if (!key) return;
        const value =
          el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
            ? el.value
            : "";
        if (String(value ?? "") !== String(original[key] ?? "")) {
          patch[key] = value;
        }
      });

      if (Object.keys(patch).length === 0) {
        toast("Nenhuma alteração para salvar.", { tone: "info" });
        return;
      }

      const diffs = buildDiff(original, { ...original, ...patch }, {
        title: "Título",
        name: "Nome",
        email: "Email",
        phone: "Telefone",
        birthDate: "Nascimento",
        cpf: "CPF",
        cep: "CEP"
      });

      const ok = await confirmDiff({
        title: "Confirmar alterações",
        message: "Revise o antes/depois antes de salvar.",
        diffs,
        tone: "ok"
      });
      if (!ok) return;

      await api(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "PATCH", json: patch });
      toast("Usuário atualizado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    async function handleLogoutSessions() {
      const ok = await confirmDiff({
        title: "Invalidar sessões",
        message: "Isso vai desconectar o usuário em todos os dispositivos.",
        diffs: [{ field: "Ação", before: "—, after: "Invalidar sessões" }],
        tone: "danger"
      });
      if (!ok) return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}/logout`, { method: "POST", json: {} });
      toast("Sessões invalidadas.", { tone: "success" });
    }

    async function handleTempPassword() {
      const ok = await confirmDiff({
        title: "Senha temporária",
        message: "A senha temporária será mostrada apenas uma vez.",
        diffs: [{ field: "Ação", before: "—, after: "Gerar senha temporária" }],
        tone: "danger"
      });
      if (!ok) return;
      const result = await api(`/api/admin/users/${encodeURIComponent(userId)}/temp-password`, { method: "POST", json: {} });
      const tempPassword = String(result?.tempPassword || "");
      await confirmDiff({
        title: "Senha temporária (mostrar uma vez)",
        message: "Copie e envie ao usuário por um canal seguro.",
        diffs: [{ field: "Senha", before: "—, after: tempPassword }],
        tone: "ok"
      });
      toast("Senha temporária gerada.", { tone: "success" });
    }

    async function handleDisableLogin() {
      const ok = await confirmDiff({
        title: "Apagar login",
        message: "Isso desativa o login e remove as credenciais.",
        diffs: [{ field: "Ação", before: "—, after: "Desativar login" }],
        tone: "danger"
      });
      if (!ok) return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}/login`, { method: "DELETE" });
      toast("Login desativado.", { tone: "success" });
      drawer.close();
      await reload();
    }

    async function handleDeleteUser() {
      const ok = await confirmDiff({
        title: "Excluir usuário",
        message: "Isso remove o usuário do banco. Esta ação pode ser revertida pela auditoria dentro do período permitido.",
        diffs: [{ field: "Ação", before: "—, after: "Excluir usuário" }],
        tone: "danger"
      });
      if (!ok) return;
      await api(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      toast("Usuário excluído.", { tone: "success" });
      drawer.close();
      await reload();
    }

    root.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = String(btn.dataset.action || "");
      try {
        if (action === "save") await handleSave();
        if (action === "cancel") drawer.close();
        if (action === "logout-sessions") await handleLogoutSessions();
        if (action === "temp-password") await handleTempPassword();
        if (action === "disable-login") await handleDisableLogin();
        if (action === "delete-user") await handleDeleteUser();
      } catch (error) {
        toast(`Falha: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      }
    });

    drawer.open({
      titleText: `Usuário • ${user.email || user.id}`,
      content: root
    });
  }

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar usuários: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar usuários.</div>`;
    }
  }

  return {
    setQuery: (q) => {
      state.query = String(q || "").trim();
      state.page = 1;
    },
    setPage: (p) => {
      state.page = Math.max(1, Number(p) || 1);
    },
    reload,
    openCreate: async () => {
      const root = document.createElement("div");
      root.innerHTML = `
        <div class="section">
          <h3>Novo usuário</h3>
          <div class="form-grid">
            ${titleField({ key: "title", value: "nao_informar" })}
            <label class="label full"><span>Nome</span><input class="field" data-key="name" type="text" /></label>
            <label class="label full"><span>Email</span><input class="field" data-key="email" type="email" /></label>
            <label class="label full"><span>Telefone</span><input class="field" data-key="phone" type="text" /></label>
            <label class="label full"><span>Senha temporária</span><input class="field" data-key="password" type="text" /></label>
            <label class="label"><span>Nascimento</span><input class="field" data-key="birthDate" type="date" /></label>
            <label class="label"><span>CPF</span><input class="field" data-key="cpf" type="text" /></label>
            <label class="label"><span>CEP</span><input class="field" data-key="cep" type="text" /></label>
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
          payload[key] = String(el.value || "").trim();
        });
        payload.title = normalizeTitle(payload.title);

        try {
          await api("/api/admin/users", { method: "POST", json: payload });
          toast("Usuário cadastrado.", { tone: "success" });
          drawer.close();
          await reload();
        } catch (error) {
          toast(`Falha ao cadastrar usuário: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
        }
      });

      drawer.open({ titleText: "Usuários • cadastrar", content: root });
    }
  };
}

