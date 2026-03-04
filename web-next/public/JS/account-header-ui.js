(function initAccountHeaderUi() {
  const messages = [
    "Nova Colecao Genesis",
    "Voce merece vestir algo a sua altura.",
    "Cadastre-se para receber lancamentos",
    "Exclusividade para quem valoriza o que e unico.",
    "Acesso antecipado a novas colecoes.",
    "Producao em pequena escala. Qualidade em cada detalhe."
  ];

  const messageNode = document.getElementById("topMessage");
  const leftArrow = document.querySelector(".top-wrapper .arrow.left");
  const rightArrow = document.querySelector(".top-wrapper .arrow.right");
  let messageIndex = 0;
  let timerId = null;

  function renderMessage() {
    if (!messageNode) return;
    messageNode.textContent = messages[messageIndex] || messages[0];
  }

  function stepMessage(direction) {
    if (!messages.length) return;
    if (direction === "left") {
      messageIndex = (messageIndex - 1 + messages.length) % messages.length;
    } else {
      messageIndex = (messageIndex + 1) % messages.length;
    }
    renderMessage();
  }

  function startMessageLoop() {
    if (!messageNode || timerId) return;
    timerId = window.setInterval(() => {
      stepMessage("right");
    }, 4000);
  }

  function stopMessageLoop() {
    if (!timerId) return;
    window.clearInterval(timerId);
    timerId = null;
  }

  leftArrow?.addEventListener("click", () => stepMessage("left"));
  rightArrow?.addEventListener("click", () => stepMessage("right"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopMessageLoop();
    } else {
      startMessageLoop();
    }
  });
  renderMessage();
  startMessageLoop();

  const menu = document.getElementById("headerMenu");
  const openMenuBtn = document.getElementById("openHeaderMenu");
  const closeMenuBtn = document.getElementById("closeHeaderMenu");
  const searchBtn = document.querySelector(".header-search-trigger");
  const cartLinks = Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'));

  function readCartCount() {
    const keys = ["tsebi-cart-v1", "tsebi-cart", "cart"];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const items = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : []);
        const total = items.reduce((sum, item) => sum + Math.max(1, Number(item?.qty || item?.quantity || 1)), 0);
        if (total > 0) return total;
      } catch {}
    }
    return 0;
  }

  function syncHeaderCart() {
    const total = readCartCount();
    cartLinks.forEach((link) => {
      link.href = "/checkout";
      link.classList.add("cart-link");
      if (total > 0) {
        link.setAttribute("data-cart-count", String(total));
      } else {
        link.removeAttribute("data-cart-count");
      }
    });
  }

  syncHeaderCart();

  function openMenu() {
    if (!menu) return;
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  }

  openMenuBtn?.addEventListener("click", openMenu);
  closeMenuBtn?.addEventListener("click", closeMenu);
  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeMenu();
  });
  document.addEventListener("click", (event) => {
    if (!menu?.classList.contains("is-open")) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (menu.contains(target) || openMenuBtn?.contains(target)) return;
    closeMenu();
  });

  searchBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.href = "/products";
  });
})();


