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
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export function createNewsletterPage({ mount }) {
  const state = {
    query: "",
    page: 1,
    pageSize: 30,
    total: 0,
    rows: []
  };

  function getComposerPayload(root, mode = "campaign") {
    const subject = String(root.querySelector('[data-newsletter-key="subject"]')?.value || "").trim();
    const html = String(root.querySelector('[data-newsletter-key="html"]')?.value || "").trim();
    const text = String(root.querySelector('[data-newsletter-key="text"]')?.value || "").trim();
    const source = String(root.querySelector('[data-newsletter-key="source"]')?.value || "").trim();
    const testEmail = mode === "test"
      ? String(root.querySelector('[data-newsletter-key="testEmail"]')?.value || "").trim().toLowerCase()
      : "";

    return { subject, html, text, source, testEmail };
  }

  function renderReport(root, result, isError = false) {
    const panel = root.querySelector('[data-newsletter-report="true"]');
    if (!(panel instanceof HTMLElement)) return;
    if (isError) {
      panel.innerHTML = `<div style="color:#9f1f1f;">${escapeHtml(String(result || "Falha no envio."))}</div>`;
      return;
    }

    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const errorsHtml = errors.length
      ? `<div style="margin-top:8px;">
          <div style="font-weight:600;margin-bottom:4px;">Falhas (amostra):</div>
          <ul style="margin:0;padding-left:18px;">
            ${errors.map((item) => `<li>${escapeHtml(item.email || "-")}: ${escapeHtml(item.error || "EMAIL_DELIVERY_FAILED")}</li>`).join("")}
          </ul>
        </div>`
      : "";

    panel.innerHTML = `
      <div style="color:#1b5e20;">
        Modo: ${escapeHtml(result?.mode || "-")} |
        Alvos: ${escapeHtml(String(result?.totalTargets ?? 0))} |
        Enviados: ${escapeHtml(String(result?.sent ?? 0))} |
        Falhas: ${escapeHtml(String(result?.failed ?? 0))}
      </div>
      ${errorsHtml}
    `;
  }

  function setComposerLoading(root, loading) {
    root.querySelectorAll("[data-newsletter-action]").forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) return;
      btn.disabled = Boolean(loading);
      if (loading) {
        btn.dataset.defaultLabel = btn.dataset.defaultLabel || btn.textContent || "";
        btn.textContent = "Enviando...";
      } else if (btn.dataset.defaultLabel) {
        btn.textContent = btn.dataset.defaultLabel;
      }
    });
  }

  async function load() {
    const data = await api(
      `/api/admin/newsletter?query=${encodeURIComponent(state.query)}&page=${state.page}&pageSize=${state.pageSize}`
    );
    state.rows = Array.isArray(data?.rows) ? data.rows : [];
    state.total = Number(data?.total || 0);
  }

  function render() {
    mount.innerHTML = "";

    const composer = document.createElement("section");
    composer.className = "section";
    composer.innerHTML = `
      <h3>Campanha de Newsletter</h3>
      <div class="form-grid" style="margin-top:10px;">
        <label class="label full">
          <span>Assunto</span>
          <input class="field" type="text" data-newsletter-key="subject" placeholder="Ex: Novidades da semana Tsebi" />
        </label>
        <label class="label full">
          <span>HTML do e-mail</span>
          <textarea class="field" data-newsletter-key="html" style="min-height:180px;" placeholder="<h1>Nova coleção</h1><p>Confira os lançamentos...</p>"></textarea>
        </label>
        <label class="label full">
          <span>Texto alternativo (opcional)</span>
          <textarea class="field" data-newsletter-key="text" style="min-height:90px;" placeholder="Versão texto do e-mail"></textarea>
        </label>
        <label class="label">
          <span>Filtrar por origem (opcional)</span>
          <input class="field" type="text" data-newsletter-key="source" placeholder="footer ou popup" />
        </label>
        <label class="label">
          <span>E-mail para teste</span>
          <input class="field" type="email" data-newsletter-key="testEmail" placeholder="voce@dominio.com" />
        </label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px;">
        <button type="button" class="btn btn-ghost" data-newsletter-action="test">Enviar teste</button>
        <button type="button" class="btn" data-newsletter-action="send">Enviar campanha</button>
      </div>
      <div data-newsletter-report="true" style="margin-top:10px;font-size:13px;color:var(--muted);"></div>
    `;

    composer.addEventListener("click", async (event) => {
      const btn = event.target instanceof Element ? event.target.closest("button[data-newsletter-action]") : null;
      if (!(btn instanceof HTMLButtonElement)) return;
      const action = String(btn.dataset.newsletterAction || "");
      const mode = action === "test" ? "test" : "campaign";

      const payload = getComposerPayload(composer, mode);
      if (!payload.subject || payload.subject.length < 3) {
        renderReport(composer, "Informe um assunto com pelo menos 3 caracteres.", true);
        return;
      }
      if (!payload.html || payload.html.length < 10) {
        renderReport(composer, "Informe o HTML do e-mail com pelo menos 10 caracteres.", true);
        return;
      }
      if (mode === "test" && !payload.testEmail) {
        renderReport(composer, "Informe um e-mail de teste.", true);
        return;
      }

      setComposerLoading(composer, true);
      renderReport(composer, "");
      try {
        const result = await api("/api/admin/newsletter/send", {
          method: "POST",
          json: payload
        });
        renderReport(composer, result, false);
        toast("Envio de newsletter concluído.", { tone: "success" });
      } catch (error) {
        renderReport(composer, `Falha no envio: ${error?.code || error?.message || "REQUEST_FAILED"}`, true);
        toast(`Falha no envio de newsletter: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      } finally {
        setComposerLoading(composer, false);
      }
    });

    mount.appendChild(composer);

    const table = renderTable({
      columns: [
        { label: "E-mail", render: (row) => `<div>${escapeHtml(row.email || "-")}</div>` },
        { label: "Telefone", render: (row) => `<div>${escapeHtml(row.phone || "-")}</div>` },
        { label: "Origem", render: (row) => `<div>${escapeHtml(row.source || "-")}</div>` },
        { label: "Pagina", render: (row) => `<div>${escapeHtml(row.page || "-")}</div>` },
        { label: "Inscrito em", render: (row) => `<div>${escapeHtml(formatDate(row.subscribedAt))}</div>` },
        { label: "Atualizado em", render: (row) => `<div>${escapeHtml(formatDate(row.updatedAt))}</div>` }
      ],
      rows: state.rows,
      getRowId: (row) => row.id
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

  async function reload() {
    try {
      await load();
      render();
    } catch (error) {
      toast(`Falha ao carregar newsletter: ${error?.code || error?.message || "REQUEST_FAILED"}`, { tone: "error" });
      mount.innerHTML = `<div style="padding:14px;color:var(--muted);">Falha ao carregar newsletter.</div>`;
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
