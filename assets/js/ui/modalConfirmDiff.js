function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatValue(value) {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  const text = String(value);
  return text.length > 240 ? `${text.slice(0, 240)}…` : text;
}

export function confirmDiff({ title = "Confirmar alterações", message = "", diffs = [], tone = "ok" } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = `modal modal-${tone}`;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  dialog.innerHTML = `
    <div class="modal-head">
      <h3>${escapeHtml(title)}</h3>
      <p class="modal-sub">${escapeHtml(message)}</p>
    </div>
    <div class="modal-body">
      <ul class="diff-list">
        ${diffs
          .map(
            (d) => `
          <li class="diff-item">
            <div class="diff-field">${escapeHtml(d.field || "")}</div>
            <div class="diff-values">
              <span class="diff-before">${escapeHtml(formatValue(d.before))}</span>
              <span class="diff-arrow">→</span>
              <span class="diff-after">${escapeHtml(formatValue(d.after))}</span>
            </div>
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" data-action="cancel">Cancelar</button>
      <button type="button" class="btn ${tone === "danger" ? "btn-danger" : ""}" data-action="confirm">Confirmar</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  document.body.classList.add("has-modal");

  const cancelBtn = dialog.querySelector('button[data-action="cancel"]');
  const confirmBtn = dialog.querySelector('button[data-action="confirm"]');

  function cleanup() {
    document.body.classList.remove("has-modal");
    overlay.remove();
  }

  function trapEscape(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      cleanup();
      resolve(false);
    }
  }

  let resolve = null;
  const promise = new Promise((res) => {
    resolve = res;
  });

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      cleanup();
      resolve(false);
    }
  });
  cancelBtn?.addEventListener("click", () => {
    cleanup();
    resolve(false);
  });
  confirmBtn?.addEventListener("click", () => {
    cleanup();
    resolve(true);
  });

  document.addEventListener("keydown", trapEscape, { once: true });

  requestAnimationFrame(() => {
    (confirmBtn || cancelBtn)?.focus?.();
  });

  return promise;
}

