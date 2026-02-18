function getFocusable(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => el && el.offsetParent !== null);
}

export function createDrawer() {
  const overlay = document.createElement("div");
  overlay.className = "drawer-overlay";
  overlay.hidden = true;

  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.hidden = true;
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");

  const header = document.createElement("div");
  header.className = "drawer-head";

  const title = document.createElement("div");
  title.className = "drawer-title";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn btn-ghost";
  closeBtn.textContent = "Fechar";

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "drawer-body";

  drawer.appendChild(header);
  drawer.appendChild(body);

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  let lastActive = null;
  let onClose = null;

  function close(reason = "close") {
    overlay.hidden = true;
    drawer.hidden = true;
    drawer.classList.remove("is-open");
    document.body.classList.remove("has-drawer");
    if (lastActive && typeof lastActive.focus === "function") {
      lastActive.focus();
    }
    if (typeof onClose === "function") {
      onClose(reason);
    }
  }

  function open({ titleText = "", content = null, onClose: onCloseCb = null } = {}) {
    lastActive = document.activeElement;
    onClose = onCloseCb;

    title.textContent = String(titleText || "");
    body.innerHTML = "";
    if (content instanceof Node) {
      body.appendChild(content);
    } else if (typeof content === "string") {
      body.innerHTML = content;
    }

    overlay.hidden = false;
    drawer.hidden = false;
    document.body.classList.add("has-drawer");
    requestAnimationFrame(() => drawer.classList.add("is-open"));

    const focusables = getFocusable(drawer);
    (focusables[0] || closeBtn).focus();
  }

  function onKeyDown(event) {
    if (drawer.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close("escape");
      return;
    }
    if (event.key !== "Tab") return;

    const focusables = getFocusable(drawer);
    if (focusables.length === 0) {
      event.preventDefault();
      closeBtn.focus();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener("click", () => close("overlay"));
  closeBtn.addEventListener("click", () => close("button"));
  document.addEventListener("keydown", onKeyDown);

  return {
    open,
    close,
    setTitle: (text) => {
      title.textContent = String(text || "");
    },
    setContent: (node) => {
      body.innerHTML = "";
      if (node instanceof Node) body.appendChild(node);
    },
    elements: { overlay, drawer, body, title, closeBtn }
  };
}

