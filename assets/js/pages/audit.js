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

function shortId(value) {
  const raw = String(value || "");
  return raw.length > 10 ? `${raw.slice(0, 8)}…` : raw || "—";
}

function actionLabel(action) {
  const a = String(action || "").toLowerCase();
  if (a === "revert" || a === "reverse") return "REVERT";
  if (a === "create") return "CREATE";
  if (a === "delete") return "DELETE";
  if (a === "disable_login") return "DISABLE_LOGIN";
  if (a === "temp_password") return "TEMP_PASSWORD";
  if (a === "logout_sessions") return "LOGOUT";
  if (a === "status_change") return "STATUS";
  return (action || "SAVE").toUpperCase();
}

function pillReversible(entry) {
  if (entry?.reversedAt) return `<span class="pill pill-warn">Revertido</span>`;
  if (entry?.reversible) return `<span class="pill">Reversível</span>`;
  return `<span class="pill pill-danger">Expirado</span>`;
}

function prettyJson(value) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function createAuditPage({ mount, drawer, getMode }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 30,
    total: 0,
    rows: [],
    loginPage: 1,
    loginPageSize: 30,
    loginTotal: 0,
    loginRows: []
  };

  async function loadChanges() {
    const data = await api(
      `/api/admin/audit?query=${encodeURIComponent(state.query)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    state.total = Number(data.total || 0);
  }

  async function loadLogins() {
    const data = await api(
      `/api/admin/admin-logins?page=${state.loginPage}&pageSize=${state.loginPageSize}`
    );
    state.loginRows = Array.isArray(data.rows) ? data.rows : [];
    state.loginTotal = Number(data.total || 0);
  }

  async function openAuditDrawer(id) {
    const data = await api(`/api/admin/audit/${encodeURIComponent(id)}`);
    const log = data?.log || null;
    if (!log) {
      toast("Log não encontrado.", { tone: "error" });
      return;
    }

    const root = document.createElement("div");
    root.innerHTML = `
      <div class="section">
        <h3>Resumo</h3>
        <div style="display:grid;gap:6px;color:var(--muted);font-size:13px;">
          <div><strong style="color:var(--text);">Quando:</strong> ${escapeHtml(formatDate(log.createdAt))}</div>
          <div><strong style="color:var(--text);">Admin:</strong> ${escapeHtml(log.actorEmail || "—")}</div>
          <div><strong style="color:var(--text);">Recurso:</strong> ${escapeHtml(log.entityType || "—")} • ${escapeHtml(log.entityId || "—")}</div>
          <div><strong style="color:var(--text);">Ação:</strong> ${escapeHtml(actionLabel(log.action))}</div>
          <div><strong style="color:var(--text);">Campos:</strong> ${escapeHtml((log.changedFields || []).join(", ") || "—")}</div>
          <div><strong style="color:var(--text);">Status:</strong> ${pillReversible(log)}</div>
        </div>
      </div>

      <div class="section">
        <h3>Antes</h3>
        <pre style="margin:0;white-space:pre-wrap;overflow:auto;">${escapeHtml(prettyJson(log.before))}</pre>
      </div>

      <div class="section">
        <h3>Depois</h3>
        <pre style="margin:0;white-space:pre-wrap;overflow:auto;">${escapeHtml(prettyJson(log.after))}</pre>
      </div>

      <div class="section danger-zone">
        <h3>Ações</h3>
        <button type="button" class="btn btn-danger" data-action="revert" ${log.reversible ? "" : "disabled"}>Reverter</button>
      </div>
    `;

    root.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      if (String(btn.dataset.action || "") !== "revert") return;

      const ok = await confirmDiff({
        title: "Reverter alteração",
        message: "A reversão só é permitida dentro da janela de 30 dias (quando aplicável).",
        diffs: [{ field: "Audit ID", before: "—", after: String(log.id || "") }],
        tone: "danger"
      });
      if (!ok) return;

      try {
        await api(`/api/admin/audit/${encodeURIComponent(log.id)}/revert`, { method: "POST", json: {} });
        toast("Reversão aplicada.", { tone: "success" });
        drawer.close();
        await reload();
      } catch (error) {
        toast(`Falha ao reverter: ${error?.code || error?.message || "AUDIT_REVERT_FAILED"}`, { tone: "error" });
      }
    });

    drawer.open({ titleText: `Auditoria • ${shortId(log.id)}`, content: root });
  }

  function renderChanges() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        { label: "Data/Hora", render: (e) => `<div>${escapeHtml(formatDate(e.createdAt))}</div>` },
        { label: "Admin", render: (e) => `<div>${escapeHtml(e.actorEmail || "—")}</div>` },
        { label: "Recurso", render: (e) => `<div>${escapeHtml(e.entityType || "—")}</div>` },
        { label: "ID curto", render: (e) => `<div style="font-family:ui-monospace,Consolas,monospace;font-size:12px;">${escapeHtml(shortId(e.entityId || ""))}</div>` },
        { label: "Ação", render: (e) => `<div>${escapeHtml(actionLabel(e.action))}</div>` },
        {
          label: "Campos alterados",
          render: (e) =>
            `<div style="color:var(--muted);font-size:12px;">${escapeHtml((e.changedFields || []).slice(0, 4).join(", ") || "—")}</div>`
        }
      ],
      rows: state.rows,
      getRowId: (e) => e.id,
      onRowClick: (row) => openAuditDrawer(row.id)
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

  function renderLogins() {
    mount.innerHTML = "";
    const table = renderTable({
      columns: [
        { label: "Data/Hora", render: (e) => `<div>${escapeHtml(formatDate(e.createdAt))}</div>` },
        {
          label: "Admin",
          render: (e) => {
            const label = e.adminNickname ? `${e.adminNickname} • ${e.adminEmail || ""}` : e.adminEmail || e.adminId || "—";
            return `<div>${escapeHtml(label)}</div>`;
          }
        },
        { label: "Resultado", render: (e) => (e.success ? `<span class="pill">OK</span>` : `<span class="pill pill-danger">Falhou</span>`) },
        { label: "IP", render: (e) => `<div>${escapeHtml(e.ip || "—")}</div>` },
        { label: "Dispositivo", render: (e) => `<div style="color:var(--muted);font-size:12px;">${escapeHtml(String(e.userAgent || "—").slice(0, 90))}</div>` },
        { label: "UA/Local", render: (e) => `<div style="color:var(--muted);font-size:12px;">${escapeHtml(String(e.userAgent || "—").slice(90, 180))}</div>` }
      ],
      rows: state.loginRows,
      getRowId: (e) => e.id,
      onRowClick: () => {}
    });

    const pager = renderPagination({
      page: state.loginPage,
      pageSize: state.loginPageSize,
      total: state.loginTotal,
      onChange: async (nextPage) => {
        state.loginPage = nextPage;
        await reload();
      }
    });

    mount.appendChild(table);
    mount.appendChild(pager);
  }

  async function reload() {
    const mode = String(getMode?.() || "changes");
    try {
      if (mode === "logins") {
        await loadLogins();
        renderLogins();
        return;
      }
      await loadChanges();
      renderChanges();
    } catch (error) {
      toast(`Falha ao carregar auditoria: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar auditoria.</div>`;
    }
  }

  return {
    setQuery: (q) => {
      state.query = String(q || "").trim();
      state.page = 1;
      state.loginPage = 1;
    },
    reload
  };
}

