let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "toast-host";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

export function toast(message, { tone = "info", timeoutMs = 3200 } = {}) {
  const container = ensureHost();
  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.textContent = String(message || "");
  container.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add("is-in");
  });

  const remove = () => {
    el.classList.remove("is-in");
    el.classList.add("is-out");
    setTimeout(() => {
      el.remove();
    }, 180);
  };

  const timer = setTimeout(remove, Math.max(1200, Number(timeoutMs) || 3200));
  el.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });

  return { remove };
}

