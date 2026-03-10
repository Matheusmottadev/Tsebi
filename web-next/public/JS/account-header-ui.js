(function initAccountHeaderUi() {
  const messages = [
    "Nova ColeÃ§Ã£o Genesis",
    "VocÃª merece vestir algo a sua altura.",
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
  const headerRight = document.querySelector(".home-header .header-right");
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

  let contactTrigger = headerRight?.querySelector(".quick-action-contact") || null;
  if (!contactTrigger && headerRight) {
    contactTrigger = document.createElement("button");
    contactTrigger.type = "button";
    contactTrigger.className = "quick-action-contact";
    contactTrigger.setAttribute("aria-label", "Fale Conosco");
    contactTrigger.textContent = "Fale Conosco";
    const accountLink = headerRight.querySelector('.quick-action:not(.cart-link)');
    if (accountLink) {
      headerRight.insertBefore(contactTrigger, accountLink);
    } else {
      const cartLink = headerRight.querySelector(".cart-link");
      if (cartLink) {
        headerRight.insertBefore(contactTrigger, cartLink);
      } else {
        headerRight.appendChild(contactTrigger);
      }
    }
  }

  let contactBackdrop = document.querySelector(".header-contact-backdrop");
  if (!contactBackdrop) {
    contactBackdrop = document.createElement("button");
    contactBackdrop.type = "button";
    contactBackdrop.className = "header-contact-backdrop";
    contactBackdrop.setAttribute("aria-label", "Fechar Fale Conosco");
    document.body.appendChild(contactBackdrop);
  }

  let contactPanel = document.querySelector(".header-contact-panel");
  if (!contactPanel) {
    contactPanel = document.createElement("aside");
    contactPanel.className = "header-contact-panel";
    contactPanel.setAttribute("aria-hidden", "true");
    contactPanel.innerHTML = `
      <div class="header-contact-panel-inner">
        <div class="header-contact-panel-head">
          <h2>Fale Conosco</h2>
          <button type="button" class="header-contact-panel-close" aria-label="Fechar">&times;</button>
        </div>
        <p class="header-contact-panel-copy">
          A equipe de consultores da Tsebi está à sua disposição. Com atendimento dedicado e discreto, oferecemos orientação na escolha das peças e acesso a informações sobre materiais, coleções e disponibilidade.
        </p>
        <nav class="header-contact-panel-links" aria-label="Canais de atendimento">
          <a href="tel:+5511918596632" class="header-contact-panel-link">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="2.5" width="10" height="19" rx="2"></rect>
              <path d="M11 18.2h2"></path>
            </svg>
            +55 (11) 91859-6632
          </a>
          <a href="mailto:Contato@tsebi.com.br" class="header-contact-panel-link">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="1.5"></rect>
              <path d="M4.5 7.5L12 13l7.5-5.5"></path>
            </svg>
            Envie um email
          </a>
          <a href="https://wa.me/5511918596632" target="_blank" rel="noopener noreferrer" class="header-contact-panel-link">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4.8a7.2 7.2 0 0 0-6.2 10.9"></path>
              <path d="M5.8 15.7L4.9 19l3.2-.9"></path>
              <path d="M8.1 18.1A7.2 7.2 0 1 0 12 4.8"></path>
              <path d="M9.7 9.6c.2-.3.4-.3.6-.3h.4c.2 0 .3.1.4.3l.5 1.3c.1.2.1.3 0 .5l-.4.5c.3.6.8 1.1 1.4 1.4l.5-.4c.1-.1.3-.1.5 0l1.3.5c.2.1.3.2.3.4v.4c0 .3-.1.5-.3.6-.4.2-.9.3-1.5.1-1.6-.5-2.9-1.8-3.4-3.4-.2-.5-.1-1 .1-1.5z"></path>
            </svg>
            WhatsApp
          </a>
          <a href="#" class="header-contact-panel-link" aria-disabled="true">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 14a3 3 0 0 1-3 3H9l-4 3v-3a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"></path>
            </svg>
            Agende um atendimento privativo
          </a>
          <a href="https://www.instagram.com/tsebiofficial/" target="_blank" rel="noopener noreferrer" class="header-contact-panel-link">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="4" ry="4"></rect>
              <circle cx="12" cy="12" r="3.8"></circle>
              <circle cx="17.2" cy="6.8" r="1.1"></circle>
            </svg>
            Direct Instagram
          </a>
        </nav>
        <div class="header-contact-panel-divider"></div>
        <div class="header-contact-panel-help">
          <a href="/faq">Precisa de ajuda?</a>
          <a href="/faq#perguntas-frequentes">Perguntas Frequentes</a>
          <a href="/faq#entrega-e-devolucoes">Entregas e Devoluções</a>
          <a href="/faq#servicos-e-reparos">Serviços e cuidados</a>
        </div>
      </div>
    `;
    document.body.appendChild(contactPanel);
  }

  const contactClose = contactPanel?.querySelector(".header-contact-panel-close");
  const disabledContactLinks = contactPanel?.querySelectorAll('a[aria-disabled="true"]');
  const openContact = () => {
    const panelInner = contactPanel?.querySelector(".header-contact-panel-inner");
    if (panelInner instanceof HTMLElement) panelInner.scrollTop = 0;
    contactBackdrop?.classList.add("is-open");
    contactPanel?.classList.add("is-open");
    contactPanel?.setAttribute("aria-hidden", "false");
  };
  const closeContact = () => {
    contactBackdrop?.classList.remove("is-open");
    contactPanel?.classList.remove("is-open");
    contactPanel?.setAttribute("aria-hidden", "true");
  };

  contactTrigger?.addEventListener("click", (event) => {
    event.preventDefault();
    closeMenu();
    openContact();
  });
  contactBackdrop?.addEventListener("click", closeContact);
  contactClose?.addEventListener("click", closeContact);
  disabledContactLinks?.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
  });
  openMenuBtn?.addEventListener("click", closeContact);
  searchBtn?.addEventListener("click", closeContact);
})();


