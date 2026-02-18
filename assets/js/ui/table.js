function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTable({
  columns = [],
  rows = [],
  getRowId = (row) => row?.id,
  onRowClick = null
} = {}) {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "table";
  table.innerHTML = `
    <thead>
      <tr>
        ${columns.map((c) => `<th>${escapeHtml(c.label || "")}</th>`).join("")}
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = "table-row";
    const id = String(getRowId(row) ?? "");
    if (id) tr.dataset.rowId = id;
    tr.innerHTML = columns
      .map((c) => {
        const value = typeof c.render === "function" ? c.render(row) : row?.[c.key];
        return `<td>${value == null ? "" : String(value)}</td>`;
      })
      .join("");
    tbody.appendChild(tr);
  });

  if (typeof onRowClick === "function") {
    tbody.addEventListener("click", (event) => {
      const tr = event.target instanceof Element ? event.target.closest("tr[data-row-id]") : null;
      if (!tr) return;
      const rowId = String(tr.dataset.rowId || "");
      const row = rows.find((r) => String(getRowId(r) ?? "") === rowId) || null;
      if (row) onRowClick(row, tr);
    });
  }

  wrap.appendChild(table);
  return wrap;
}

export function renderPagination({ page = 1, pageSize = 50, total = 0, onChange } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 50);
  const safeTotal = Math.max(0, Number(total) || 0);
  const maxPage = Math.max(1, Math.ceil(safeTotal / safePageSize));

  const el = document.createElement("div");
  el.className = "pager";
  el.innerHTML = `
    <button type="button" class="btn btn-ghost" data-action="prev" ${safePage <= 1 ? "disabled" : ""}>Anterior</button>
    <div class="pager-meta">Página ${safePage} de ${maxPage} • ${safeTotal} itens</div>
    <button type="button" class="btn btn-ghost" data-action="next" ${safePage >= maxPage ? "disabled" : ""}>Próxima</button>
  `;

  el.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("button[data-action]") : null;
    if (!(btn instanceof HTMLButtonElement)) return;
    const action = String(btn.dataset.action || "");
    if (action === "prev" && safePage > 1) onChange?.(safePage - 1);
    if (action === "next" && safePage < maxPage) onChange?.(safePage + 1);
  });

  return el;
}

