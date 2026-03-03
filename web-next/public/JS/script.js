const messages = [
  "Nova Coleção Gênesis",
  "Você merece vestir algo à sua altura.",
  "Cadastre-se para receber lançamentos",
  "Exclusividade para quem valoriza o que é único.",
  "Acesso antecipado a novas coleções.",
  "Produção em pequena escala. Qualidade em cada detalhe."
];
const searchTopPieces = [
  { id: "origem-skirt", href: "produto.html?id=origem-skirt", src: "images/placeholderreal.webp", alt: "Sabrina charmosa", tag: "NOVO", name: "Sabrina charmosa" },
  { id: "origem-shirt", href: "produto.html?id=origem-shirt", src: "images/placeholderreal.webp", alt: "Sabrina linda", tag: "NOVO", name: "Sabrina linda" },
  { id: "genesis-tailored", href: "produto.html?id=genesis-tailored", src: "images/placeholderreal.webp", alt: "Sabrina maravilhosa", tag: "NOVO", name: "Sabrina maravilhosa" },
  { id: "genesis-bomber", href: "produto.html?id=genesis-bomber", src: "images/placeholderreal.webp", alt: "Sabrina incrível", tag: "NOVO", name: "Sabrina incrível" }
];
const prelaunchActionCards = [
  {
    tag: "VIP",
    name: "Entrar na lista VIP",
    description: "Receba acesso antecipado ao lançamento da Tsebi.",
    href: "lancamento.html#vip"
  },
  {
    tag: "EMAIL",
    name: "Novidades por e-mail",
    description: "Seja avisado(a) quando as primeiras peças estiverem disponíveis.",
    href: "lancamento.html#newsletter"
  },
  {
    tag: "ORIGEM",
    name: "Conhecer a marca",
    description: "Descubra nossa origem, materiais e processo de qualidade.",
    href: "lancamento.html#origem"
  },
  {
    tag: "ALICERCE",
    name: "Coleção Alicerce em breve",
    description: "Conheça a proposta da primeira coleção da Tsebi.",
    href: "lancamento.html#alicerce"
  }
];

const userStore = window.TsebiUserStore;
const currentLang = localStorage.getItem("tsebi-site-language") || "pt";
const isEnglish = currentLang === "en";
const isPrelaunchMode = window.TSEBI_PRELAUNCH_MODE === true;

function tSearchLabel(text) {
  if (!isEnglish) return text;
  const map = {
    "RESULTADOS": "RESULTS",
    "Limpar filtros": "Clear filters",
    "Coleções em rotação contínua. Encontre a peça ideal pelo estilo e composição.": "Collections in continuous rotation. Find your ideal piece by style and composition.",
    "Nenhum produto encontrado para os filtros selecionados.": "No products found for the selected filters.",
    "Coleção": "Collection",
    "Tamanho": "Size",
    "Cor": "Color",
    "Material": "Material",
    "Categoria": "Category",
    "Gênero": "Gender",
    "Ordenar": "Sort",
    "Todos": "All",
    "Relevância": "Relevance",
    "Menor preço": "Lowest price",
    "Maior preço": "Highest price",
    "Nome A-Z": "Name A-Z",
    "Feminino": "Women",
    "Masculino": "Men",
    "Unissex": "Unisex",
    "Bolsas": "Bags",
    "Vestidos": "Dresses",
    "Jaquetas": "Jackets",
    "Calçados": "Footwear",
    "Calças": "Trousers",
    "Camisas": "Shirts",
    "Saias": "Skirts",
    "Casacos": "Coats",
    "Malhas": "Knitwear",
    "Blazers": "Blazers",
    "Lã fria": "Cool wool",
    "Lã merino": "Merino wool",
    "Crepe de seda": "Silk crepe",
    "Linho premium": "Premium linen",
    "Nylon técnico": "Technical nylon",
    "Couro envernizado": "Patent leather",
    "Couro natural": "Natural leather",
    "Gabardine": "Gabardine",
    "Sarja premium": "Premium twill",
    "Algodão egípcio": "Egyptian cotton",
    "Couro e lã": "Leather and wool",
    "Branco": "White",
    "Azul": "Blue",
    "Preto": "Black",
    "Grafite": "Graphite",
    "Marfim": "Ivory",
    "Caramelo": "Caramel",
    "Vinho": "Wine",
    "Areia": "Sand",
    "Vermelho": "Red",
    "Oliva": "Olive",
    "Cinza": "Gray",
    "Off white": "Off-white",
    "Gênesis": "Genesis",
    "PRÉ-LANÇAMENTO": "PRE-LAUNCH",
    "EDITORIAL": "EDITORIAL",
    "Estamos em pré-lançamento. Cadastre-se para acesso antecipado.": "We are in pre-launch. Join for early access.",
    "Ainda sem peças disponíveis para compra. Lançamento em breve.": "No pieces available for purchase yet. Launching soon.",
    "Entrar na lista VIP": "Join VIP list",
    "Conhecer a marca": "Discover the brand",
    "Coleção Alicerce em breve": "Alicerce collection soon",
    "Novidades por e-mail": "Email updates"
  };
  return map[text] || text;
}

function isFavoriteProduct(productId) {
  return Boolean(userStore?.isFavorite(productId));
}

function updateFavoriteButtonUI(button) {
  const productId = button?.dataset.productId || "";
  const active = isFavoriteProduct(productId);
  button.classList.toggle("is-active", active);
  button.textContent = active ? "â™¥" : "â™¡";
  button.setAttribute("aria-label", active ? "Remover dos favoritos" : "Adicionar aos favoritos");
}

function attachFavoriteHandlers(container) {
  if (!container || container.dataset.favoriteBound === "true") return;
  container.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest(".product-favorite-btn");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (!userStore) return;
    userStore.toggleFavorite(button.dataset.productId || "");
    updateFavoriteButtonUI(button);
  });
  container.dataset.favoriteBound = "true";
}

function ensureSearchTopPieces(searchOverlay) {
  const searchPanel = searchOverlay.querySelector(".search-panel");
  if (!searchPanel) return;

  let section = searchPanel.querySelector(".search-section.search-top-pieces");
  let grid = null;

  if (!section) {
    grid = searchPanel.querySelector(".top-grid");
    section = grid?.closest(".search-section") ?? null;
    if (section) section.classList.add("search-top-pieces");
  }

  if (!section) {
    section = document.createElement("section");
    section.className = "search-section search-top-pieces";

    const title = document.createElement("h3");
    title.textContent = "PRINCIPAIS PEÇAS";
    section.appendChild(title);

    grid = document.createElement("div");
    grid.className = "top-grid";
    section.appendChild(grid);
    searchPanel.appendChild(section);
  } else if (!grid) {
    grid = section.querySelector(".top-grid");
  }

  if (!grid) return;

  grid.innerHTML = "";

  if (isPrelaunchMode) {
    prelaunchActionCards.forEach((item) => {
      const card = document.createElement("a");
      card.className = "top-card prelaunch-action-card";
      card.href = item.href;
      card.innerHTML = `
        <div class="top-media prelaunch-action-content">
          <span class="tag">${item.tag}</span>
          <span class="name">${item.name}</span>
          <p class="prelaunch-action-desc">${item.description}</p>
        </div>
      `;
      grid.appendChild(card);
    });
    return;
  }

  searchTopPieces.forEach((item) => {
    const card = document.createElement("a");
    card.className = "top-card";
    card.href = item.href;
    card.dataset.productId = item.id;

    const media = document.createElement("div");
    media.className = "top-media";

    const img = document.createElement("img");
    img.className = "top-img";
    img.loading = "lazy";
    img.decoding = "async";
    img.src = item.src;
    img.alt = item.alt;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "product-favorite-btn";
    favoriteButton.dataset.productId = item.id;
    updateFavoriteButtonUI(favoriteButton);

    const meta = document.createElement("div");
    meta.className = "top-meta";

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = item.tag;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name;

    media.append(img, favoriteButton);
    meta.append(tag, name);
    card.append(media, meta);
    grid.appendChild(card);
  });

  attachFavoriteHandlers(grid);
}

function applyPrelaunchSearchMode(searchOverlay, searchInput) {
  if (!isPrelaunchMode || !searchOverlay) return;

  if (searchInput) {
    searchInput.placeholder = tSearchLabel("Estamos em pré-lançamento. Cadastre-se para acesso antecipado.");
  }

  const suggestionTitle = searchOverlay.querySelector(".search-section h3");
  if (suggestionTitle) suggestionTitle.textContent = tSearchLabel("PRÉ-LANÇAMENTO");

  const chipLabels = [
    { label: "Entrar na lista VIP", href: "lancamento.html#vip" },
    { label: "Conhecer a marca", href: "lancamento.html#origem" },
    { label: "Coleção Alicerce em breve", href: "lancamento.html#alicerce" },
    { label: "Novidades por e-mail", href: "lancamento.html#newsletter" }
  ];
  const chipsWrap = searchOverlay.querySelector(".chips");
  if (chipsWrap) {
    chipsWrap.innerHTML = "";
    chipLabels.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.href = item.href;
      chip.textContent = tSearchLabel(item.label);
      chipsWrap.appendChild(chip);
    });
  }

  const topPiecesTitle = searchOverlay.querySelector(".search-top-pieces h3");
  if (topPiecesTitle) topPiecesTitle.textContent = tSearchLabel("EDITORIAL");
}

function initLaunchCtaRouting() {
  const heroCta = document.querySelector(".hero-cta-btn");
  if (!heroCta) return;
  heroCta.href = isPrelaunchMode ? "lancamento.html" : "genesis.html";
}
let productsCatalog = [];

async function loadProductsCatalog() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) return [];
    const parsed = await response.json();
    const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.products) ? parsed.products : []);
    return list.map((product) => ({
      ...product,
      sku: String(product?.sku || product?.id || ""),
      stock: Number(product?.stock ?? product?.stock_qty ?? 0)
    }));
  } catch {}

  return [];
}

async function bootstrap() {
  productsCatalog = await loadProductsCatalog();
  if (!Array.isArray(productsCatalog)) productsCatalog = [];

  initLaunchCtaRouting();
  initTopBar();
  initSearchOverlay();
  initCategorySwitch();
  initNewsCarousel();
  initHomeHeaderScrollState();
  initHeaderMenu();
  initHeroVideoLoop();
  initCartEntryPoints();
  initAccountEntryPoints();
  initTrackOrderEntryPoints();
  initNewsletterForms();
  initNewsletterPopup();
}

bootstrap();

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function mapSearchQueryToCatalogTerms(rawQuery) {
  let mapped = normalizeSearchText(rawQuery);

  const dictionary = [
    ["women", "feminino"],
    ["woman", "feminino"],
    ["female", "feminino"],
    ["men", "masculino"],
    ["man", "masculino"],
    ["male", "masculino"],
    ["bags", "bolsas"],
    ["bag", "bolsa"],
    ["dress", "vestido"],
    ["dresses", "vestidos"],
    ["jacket", "jaqueta"],
    ["jackets", "jaquetas"],
    ["sneaker", "tenis"],
    ["sneakers", "tenis"],
    ["accessory", "acessorio"],
    ["accessories", "acessorios"],
    ["shirt", "camisa"],
    ["skirt", "saia"],
    ["pants", "calca"],
    ["trousers", "calca"],
    ["coat", "casaco"],
    ["knit", "malha"],
    ["black", "preto"],
    ["white", "branco"],
    ["blue", "azul"],
    ["red", "vermelho"],
    ["gray", "cinza"],
    ["grey", "cinza"],
    ["ivory", "marfim"],
    ["sand", "areia"],
    ["olive", "oliva"],
    ["wine", "vinho"],
    ["leather", "couro"],
    ["linen", "linho"],
    ["wool", "la"],
    ["silk", "seda"],
    ["cotton", "algodao"],
    ["genesis", "genesis"],
    ["foundation", "alicerce"]
  ];

  dictionary.forEach(([from, to]) => {
    mapped = mapped.replace(new RegExp(`\\b${from}\\b`, "g"), to);
  });

  return mapped;
}

function getSearchPresetFromLabel(label) {
  const normalized = normalizeSearchText(label);
  const availableCollections = uniqueSorted(productsCatalog.map((item) => item.collection));
  const matchedCollection = availableCollections.find((collection) =>
    normalized.includes(normalizeSearchText(collection))
  );

  if (normalized.includes("novidade para homens") || normalized.includes("new for men")) {
    return { query: "masculino", filters: { gender: "Masculino" } };
  }
  if (normalized.includes("novidade para mulheres") || normalized.includes("new for women")) {
    return { query: "feminino", filters: { gender: "Feminino" } };
  }
  if (normalized.includes("bolsa") || normalized.includes("bag")) {
    return { query: "bolsa", filters: { category: "Bolsas" } };
  }
  if (normalized.includes("vestido") || normalized.includes("dress")) {
    return { query: "vestido", filters: { category: "Vestidos" } };
  }
  if (normalized.includes("jaqueta") || normalized.includes("jacket")) {
    return { query: "jaqueta", filters: { category: "Jaquetas" } };
  }
  if (normalized.includes("tenis") || normalized.includes("sneaker")) {
    return { query: "tenis", filters: { category: "Calçados" } };
  }
  if (normalized.includes("acessorio") || normalized.includes("accessor")) {
    return { query: "bolsa", filters: { category: "Bolsas" } };
  }
  if (matchedCollection) {
    return { query: matchedCollection, filters: { collection: matchedCollection } };
  }

  return { query: label.trim(), filters: {} };
}

function createSearchSelect(filterName, label, options) {
  const wrap = document.createElement("label");
  wrap.className = "search-filter";
  wrap.setAttribute("for", `searchFilter-${filterName}`);

  const text = document.createElement("span");
  text.textContent = tSearchLabel(label);

  const select = document.createElement("select");
  select.id = `searchFilter-${filterName}`;
  select.dataset.filter = filterName;

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = tSearchLabel("Todos");
  select.appendChild(defaultOption);

  options.forEach((optionValue) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = tSearchLabel(optionValue);
    select.appendChild(option);
  });

  wrap.append(text, select);
  return wrap;
}

function ensureSearchExperience(searchOverlay, searchInput) {
  const searchPanel = searchOverlay.querySelector(".search-panel");
  if (!searchPanel) return;

  let shell = searchPanel.querySelector(".search-results-shell");
  if (!shell) {
    shell = document.createElement("section");
    shell.className = "search-section search-results-shell";
    shell.innerHTML = `
      <div class="search-results-head">
        <h3>${tSearchLabel("RESULTADOS")}</h3>
        <button class="search-clear" type="button">${tSearchLabel("Limpar filtros")}</button>
      </div>
      <p class="search-results-count">0 produtos</p>
      <p class="search-results-note">${tSearchLabel("Coleções em rotação contínua. Encontre a peça ideal pelo estilo e composição.")}</p>
      <div class="search-filters"></div>
      <div class="search-results-grid"></div>
      <p class="search-empty" hidden>${tSearchLabel("Nenhum produto encontrado para os filtros selecionados.")}</p>
    `;
    searchPanel.appendChild(shell);
  }

  const filtersContainer = shell.querySelector(".search-filters");
  const resultsGrid = shell.querySelector(".search-results-grid");
  const countEl = shell.querySelector(".search-results-count");
  const clearBtn = shell.querySelector(".search-clear");
  const emptyEl = shell.querySelector(".search-empty");
  const topPiecesSection = searchPanel.querySelector(".search-top-pieces");

  if (!filtersContainer || !resultsGrid || !countEl || !clearBtn || !emptyEl) return;
  attachFavoriteHandlers(resultsGrid);

  const SEARCH_CART_KEY = "tsebi-cart-v1";
  const SEARCH_CART_LEGACY_KEYS = ["tsebi-cart", "cart"];

  function normalizeSearchCartItems(items) {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const rawKey = String(item.key || "").trim();
        const idFromKey = rawKey.includes("::") ? rawKey.split("::")[0] : rawKey;
        const id = String(item.id || item.productId || idFromKey || "").trim();
        if (!id) return null;
        return {
          ...item,
          key: String(item.key || id),
          id,
          qty: Math.max(1, Number(item.qty || item.quantity || 1))
        };
      })
      .filter(Boolean);
  }

  function parseSearchCart(rawValue) {
    if (!rawValue) return [];
    try {
      const parsed = JSON.parse(rawValue);
      if (Array.isArray(parsed)) return normalizeSearchCartItems(parsed);
      if (parsed && Array.isArray(parsed.items)) return normalizeSearchCartItems(parsed.items);
    } catch {}
    return [];
  }

  function readSearchCart() {
    const current = parseSearchCart(localStorage.getItem(SEARCH_CART_KEY));
    if (current.length > 0) return current;

    for (const legacyKey of SEARCH_CART_LEGACY_KEYS) {
      const legacy = parseSearchCart(localStorage.getItem(legacyKey));
      if (legacy.length > 0) {
        localStorage.setItem(SEARCH_CART_KEY, JSON.stringify(legacy));
        return legacy;
      }
    }

    return [];
  }

  function saveSearchCart(items) {
    try {
      localStorage.setItem(SEARCH_CART_KEY, JSON.stringify(items));
    } catch {}
  }

  function getProductStock(product) {
    return Math.max(0, Number(product?.stock ?? product?.stock_qty ?? 0));
  }

  function syncSearchHeaderCartBadge(cartItems) {
    const links = Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'));
    if (!links.length) return;
    const totalItems = (Array.isArray(cartItems) ? cartItems : [])
      .filter((item) => item && item.id)
      .reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);

    links.forEach((link) => {
      link.classList.add("cart-link");
      if (totalItems > 0) {
        link.setAttribute("data-cart-count", String(totalItems));
      } else {
        link.removeAttribute("data-cart-count");
      }
    });
  }

  function getCartQtyByProductId(cartItems, productId) {
    const safeId = String(productId || "").trim();
    if (!safeId) return 0;
    return (Array.isArray(cartItems) ? cartItems : [])
      .filter((item) => String(item?.id || "").trim() === safeId)
      .reduce((sum, item) => sum + Math.max(1, Number(item?.qty) || 1), 0);
  }

  function addProductFromSearchToCart(product) {
    const safeProduct = product && typeof product === "object" ? product : null;
    const productId = String(safeProduct?.id || "").trim();
    if (!productId) return false;

    const cartItems = readSearchCart();
    const stock = getProductStock(safeProduct);
    const currentQty = getCartQtyByProductId(cartItems, productId);
    if (stock <= 0 || currentQty >= stock) return false;

    const plainEntry = cartItems.find((item) => {
      if (String(item?.id || "").trim() !== productId) return false;
      const key = String(item?.key || "").trim();
      return !key || key === productId;
    });

    if (plainEntry) {
      plainEntry.qty = Math.min(stock, Math.max(1, Number(plainEntry.qty) || 1) + 1);
      plainEntry.maxStock = stock;
      plainEntry.priceLabel = safeProduct.priceLabel || plainEntry.priceLabel || "R$ 0,00";
      plainEntry.name = safeProduct.name || plainEntry.name || productId;
      plainEntry.image = safeProduct.image || plainEntry.image || "images/placeholderreal.webp";
    } else {
      cartItems.push({
        key: productId,
        id: productId,
        name: safeProduct.name || productId,
        priceLabel: safeProduct.priceLabel || "R$ 0,00",
        image: safeProduct.image || "images/placeholderreal.webp",
        color: "-",
        size: "-",
        maxStock: stock,
        qty: 1
      });
    }

    saveSearchCart(cartItems);
    syncSearchHeaderCartBadge(cartItems);
    return true;
  }

  const collectionOptions = uniqueSorted(productsCatalog.map((item) => item.collection));
  const sizeOptions = uniqueSorted(productsCatalog.flatMap((item) => item.sizes));
  const colorOptions = uniqueSorted(productsCatalog.flatMap((item) => item.colors));
  const materialOptions = uniqueSorted(productsCatalog.map((item) => item.material));
  const categoryOptions = uniqueSorted(productsCatalog.map((item) => item.category));
  const genderOptions = uniqueSorted(productsCatalog.map((item) => item.gender));

  if (!filtersContainer.children.length) {
    filtersContainer.append(
      createSearchSelect("collection", "Coleção", collectionOptions),
      createSearchSelect("size", "Tamanho", sizeOptions),
      createSearchSelect("color", "Cor", colorOptions),
      createSearchSelect("material", "Material", materialOptions),
      createSearchSelect("category", "Categoria", categoryOptions),
      createSearchSelect("gender", "Gênero", genderOptions),
      createSearchSelect("sort", "Ordenar", ["Relevância", "Menor preço", "Maior preço", "Nome A-Z"])
    );
  }

  const selects = Array.from(filtersContainer.querySelectorAll("select[data-filter]"));
  const selectByFilter = {
    collection: selects.find((s) => s.dataset.filter === "collection") || null,
    size: selects.find((s) => s.dataset.filter === "size") || null,
    color: selects.find((s) => s.dataset.filter === "color") || null,
    material: selects.find((s) => s.dataset.filter === "material") || null,
    category: selects.find((s) => s.dataset.filter === "category") || null,
    gender: selects.find((s) => s.dataset.filter === "gender") || null,
    sort: selects.find((s) => s.dataset.filter === "sort") || null
  };

  function resetFilters(keepSort = true) {
    selects.forEach((select) => {
      if (keepSort && select.dataset.filter === "sort") return;
      select.value = "";
    });
  }

  function getSelectedFilters() {
    return {
      collection: selects.find((s) => s.dataset.filter === "collection")?.value || "",
      size: selects.find((s) => s.dataset.filter === "size")?.value || "",
      color: selects.find((s) => s.dataset.filter === "color")?.value || "",
      material: selects.find((s) => s.dataset.filter === "material")?.value || "",
      category: selects.find((s) => s.dataset.filter === "category")?.value || "",
      gender: selects.find((s) => s.dataset.filter === "gender")?.value || "",
      sort: selects.find((s) => s.dataset.filter === "sort")?.value || "Relevância"
    };
  }

  function sortResults(items, sortType) {
    const sorted = [...items];
    if (sortType === "Menor preço") sorted.sort((a, b) => a.priceValue - b.priceValue);
    if (sortType === "Maior preço") sorted.sort((a, b) => b.priceValue - a.priceValue);
    if (sortType === "Nome A-Z") sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return sorted;
  }

  function bindProductPreview(card) {
    const isTouchDevice = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!isTouchDevice) return;

    let timerId = null;

    function clearPreview() {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      card.classList.remove("is-preview");
    }

    function startPreviewTimer() {
      clearPreview();
      timerId = window.setTimeout(() => {
        card.classList.add("is-preview");
      }, 3000);
    }

    card.addEventListener("focusin", startPreviewTimer);
    card.addEventListener("focusout", clearPreview);
    card.addEventListener("touchstart", startPreviewTimer, { passive: true });
    card.addEventListener("touchend", clearPreview, { passive: true });
    card.addEventListener("touchcancel", clearPreview, { passive: true });
  }

  function renderResults() {
    if (isPrelaunchMode) {
      shell.classList.add("is-active");
      resultsGrid.innerHTML = "";
      countEl.textContent = isEnglish ? "Launch soon" : "Lançamento em breve";
      emptyEl.hidden = false;
      emptyEl.textContent = tSearchLabel("Ainda sem peças disponíveis para compra. Lançamento em breve.");
      if (topPiecesSection) topPiecesSection.hidden = false;
      return;
    }

    const query = mapSearchQueryToCatalogTerms(searchInput?.value || "");
    const filters = getSelectedFilters();
    const hasQuery = query.length > 0;

    if (!hasQuery) {
      shell.classList.remove("is-active");
      resultsGrid.innerHTML = "";
      countEl.textContent = isEnglish ? "0 products" : "0 produtos";
      emptyEl.hidden = true;
      if (topPiecesSection) topPiecesSection.hidden = false;
      return;
    }

    const filtered = productsCatalog.filter((product) => {
      const haystack = normalizeSearchText([
        product.name,
        product.collection,
        product.category,
        product.material,
        product.gender,
        product.colors.join(" "),
        product.sizes.join(" ")
      ].join(" "));

      if (query && !haystack.includes(query)) return false;
      if (filters.collection && product.collection !== filters.collection) return false;
      if (filters.size && !product.sizes.includes(filters.size)) return false;
      if (filters.color && !product.colors.includes(filters.color)) return false;
      if (filters.material && product.material !== filters.material) return false;
      if (filters.category && product.category !== filters.category) return false;
      if (filters.gender && product.gender !== filters.gender) return false;
      return true;
    });

    const sortedResults = sortResults(filtered, filters.sort);
    shell.classList.add("is-active");
    resultsGrid.innerHTML = "";
    const cartItems = readSearchCart();

    sortedResults.forEach((product, index) => {
      const fallbackSecondary = sortedResults[(index + 1) % sortedResults.length]?.image || product.image;
      const stock = getProductStock(product);
      const qtyInCart = getCartQtyByProductId(cartItems, product.id);
      const soldOut = stock <= 0 || qtyInCart >= stock;
      const card = document.createElement("a");
      card.className = "search-result-card";
      card.href = product.href;
      card.innerHTML = `
        <div class="search-result-media">
          <img class="search-result-image search-result-image-primary" src="${product.image}" alt="${product.name}" loading="lazy" decoding="async" />
          <img class="search-result-image search-result-image-secondary" src="${fallbackSecondary}" alt="${product.name} - outro ângulo" loading="lazy" decoding="async" />
          <button class="product-favorite-btn ${isFavoriteProduct(product.id) ? "is-active" : ""}" type="button" data-product-id="${product.id}" aria-label="${isFavoriteProduct(product.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}">${isFavoriteProduct(product.id) ? "â™¥" : "â™¡"}</button>
        </div>
        <div class="search-result-meta">
          <h4 class="search-result-name">${product.name}</h4>
          <p class="search-result-price">${product.priceLabel}</p>
          <button
            class="search-result-cart-btn ${soldOut ? "is-disabled" : ""}"
            type="button"
            data-product-id="${product.id}"
            ${soldOut ? 'disabled aria-disabled="true"' : ""}
          >${soldOut ? (isEnglish ? "Sold out" : "Esgotado") : (isEnglish ? "Add to cart" : "Adicionar ao carrinho")}</button>
        </div>
      `;
      bindProductPreview(card);
      resultsGrid.appendChild(card);
    });

    countEl.textContent = `${sortedResults.length} ${sortedResults.length === 1 ? (isEnglish ? "product" : "produto") : (isEnglish ? "products" : "produtos")}`;
    emptyEl.hidden = sortedResults.length > 0;

    if (topPiecesSection) topPiecesSection.hidden = true;
  }

  selects.forEach((select) => {
    select.addEventListener("change", renderResults);
  });

  searchInput?.addEventListener("input", renderResults);
  resultsGrid.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const addButton = target.closest(".search-result-cart-btn");
    if (!addButton) return;

    event.preventDefault();
    event.stopPropagation();

    const productId = String(addButton.getAttribute("data-product-id") || "").trim();
    if (!productId) return;

    const product = productsCatalog.find((entry) => String(entry?.id || "").trim() === productId);
    if (!product) return;

    const added = addProductFromSearchToCart(product);
    if (!added) {
      addButton.disabled = true;
      addButton.classList.add("is-disabled");
      addButton.textContent = isEnglish ? "Sold out" : "Esgotado";
      return;
    }

    renderResults();
  });

  const chips = Array.from(searchOverlay.querySelectorAll(".chip"));
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (isPrelaunchMode) {
        const href = chip.dataset.href;
        if (href) window.location.href = href;
        return;
      }
      if (!searchInput) return;
      const preset = getSearchPresetFromLabel(chip.textContent || "");
      resetFilters(true);
      if (selectByFilter.collection && preset.filters.collection) selectByFilter.collection.value = preset.filters.collection;
      if (selectByFilter.gender && preset.filters.gender) selectByFilter.gender.value = preset.filters.gender;
      if (selectByFilter.category && preset.filters.category) selectByFilter.category.value = preset.filters.category;
      searchInput.value = preset.query;
      renderResults();
      searchInput.focus();
    });
  });

  clearBtn.addEventListener("click", () => {
    resetFilters(false);
    if (selectByFilter.sort) selectByFilter.sort.value = "Relevância";
    if (searchInput) searchInput.value = "";
    renderResults();
    searchInput?.focus();
  });

  renderResults();

  return {
    applyFromLabel(label) {
      if (!searchInput) return;
      const preset = getSearchPresetFromLabel(label);
      resetFilters(true);
      if (selectByFilter.collection && preset.filters.collection) selectByFilter.collection.value = preset.filters.collection;
      if (selectByFilter.gender && preset.filters.gender) selectByFilter.gender.value = preset.filters.gender;
      if (selectByFilter.category && preset.filters.category) selectByFilter.category.value = preset.filters.category;
      searchInput.value = preset.query;
      renderResults();
      searchInput.focus();
    }
  };
}

function initTopBar() {
  const messageEl = document.getElementById("topMessage");
  const leftBtn = document.querySelector(".arrow.left");
  const rightBtn = document.querySelector(".arrow.right");

  if (!messageEl || !leftBtn || !rightBtn || messages.length === 0) return;

  let index = 0;
  let timer = null;

  function animateText(direction) {
    messageEl.classList.remove("slide-right", "slide-left");

    requestAnimationFrame(() => {
      messageEl.classList.add(direction === "left" ? "slide-left" : "slide-right");
    });
  }

  function slideArrow(direction) {
    const btn = direction === "right" ? rightBtn : leftBtn;
    const dist = direction === "right" ? 14 : -14;

    btn.getAnimations().forEach((animation) => animation.cancel());

    btn.animate(
      [
        { transform: "translateX(0)" },
        { transform: `translateX(${dist}px)` },
        { transform: "translateX(0)" }
      ],
      {
        duration: 520,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  }

  function showMessage(nextIndex, direction = "right") {
    index = (nextIndex + messages.length) % messages.length;
    messageEl.textContent = messages[index];
    animateText(direction);
    slideArrow(direction);
  }

  function startAuto() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => showMessage(index + 1, "right"), 4000);
  }

  function stopAuto() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  rightBtn.addEventListener("click", (event) => {
    event.preventDefault();
    showMessage(index + 1, "right");
    startAuto();
  });

  leftBtn.addEventListener("click", (event) => {
    event.preventDefault();
    showMessage(index - 1, "left");
    startAuto();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAuto();
    } else {
      startAuto();
    }
  });

  showMessage(0, "right");
  startAuto();
}

function initSearchOverlay() {
  const openSearch = document.getElementById("openSearch");
  const closeSearch = document.getElementById("closeSearch");
  const searchOverlay = document.getElementById("searchOverlay");
  const searchInput = document.getElementById("searchInput");

  if (!searchOverlay) return;
  applyPrelaunchSearchMode(searchOverlay, searchInput);
  ensureSearchTopPieces(searchOverlay);
  const searchExperience = ensureSearchExperience(searchOverlay, searchInput);

  function openSearchOverlay() {
    searchOverlay.classList.add("is-open");
    document.body.classList.add("no-scroll");
    document.documentElement.classList.add("no-scroll");
    searchOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => searchInput?.focus(), 50);
  }

  function closeSearchOverlay() {
    searchOverlay.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    document.documentElement.classList.remove("no-scroll");
    searchOverlay.setAttribute("aria-hidden", "true");
  }

  openSearch?.addEventListener("click", openSearchOverlay);
  closeSearch?.addEventListener("click", closeSearchOverlay);

  const menuLinks = Array.from(document.querySelectorAll(".header-menu a"));
  menuLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const rawText = link.textContent?.trim() || "";
      const href = link.getAttribute("href") || "";
      if (!rawText) return;
      if (href && href !== "#") return;

      event.preventDefault();
      const headerMenu = document.getElementById("headerMenu");
      if (headerMenu?.classList.contains("is-open")) {
        headerMenu.classList.remove("is-open");
        headerMenu.setAttribute("aria-hidden", "true");
        document.body.classList.remove("menu-open");
      }
      openSearchOverlay();
      searchExperience?.applyFromLabel(rawText);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && searchOverlay.classList.contains("is-open")) {
      closeSearchOverlay();
    }
  });

  searchOverlay.addEventListener("click", (event) => {
    if (event.target === searchOverlay) closeSearchOverlay();
  });
}

function initCategorySwitch() {
  const sections = Array.from(document.querySelectorAll(".category-switch"));
  if (sections.length === 0) return;

  const contentEn = {
    featured: {
      feminino: [
        { src: "images/placeholderreal.webp", alt: "Structured cool wool skirt", title: "Structured cool wool skirt", href: "produto.html?id=origem-skirt" },
        { src: "images/placeholderreal.webp", alt: "Premium tailored trousers", title: "Premium tailored trousers", href: "produto.html?id=genesis-tailored" },
        { src: "images/placeholderreal.webp", alt: "Patent leather pumps", title: "Patent leather pumps", href: "produto.html?id=atelier-heels" },
        { src: "images/placeholderreal.webp", alt: "Premium linen blazer", title: "Premium linen blazer", href: "produto.html?id=essence-blazer" }
      ],
      masculino: [
        { src: "images/placeholderreal.webp", alt: "Croatian cotton shirt", title: "Croatian cotton shirt", href: "produto.html?id=origem-shirt" },
        { src: "images/placeholderreal.webp", alt: "Italian leather bomber jacket", title: "Italian leather bomber jacket", href: "produto.html?id=genesis-bomber" },
        { src: "images/placeholderreal.webp", alt: "Premium technical sneaker", title: "Premium technical sneaker", href: "produto.html?id=noir-sneaker" },
        { src: "images/placeholderreal.webp", alt: "Gabardine trench coat", title: "Gabardine trench coat", href: "produto.html?id=flux-trench" }
      ]
    },
    popular: {
      feminino: [
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 1", title: "", href: "produto.html?id=origem-skirt" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 2", title: "", href: "produto.html?id=genesis-tailored" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 3", title: "", href: "produto.html?id=atelier-heels" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 4", title: "", href: "produto.html?id=essence-blazer" }
      ],
      masculino: [
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 1", title: "", href: "produto.html?id=origem-shirt" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 2", title: "", href: "produto.html?id=genesis-bomber" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 3", title: "", href: "produto.html?id=noir-sneaker" },
        { src: "images/placeholderreal.webp", alt: "Most clicked piece 4", title: "", href: "produto.html?id=flux-trench" }
      ]
    }
  };

  const contentPt = {
    featured: {
      feminino: [
        { src: "images/placeholderreal.webp", alt: "Saia estruturada em lã fria", title: "Saia estruturada em lã fria", href: "produto.html?id=origem-skirt" },
        { src: "images/placeholderreal.webp", alt: "Calça de alfaiataria em sarja premium", title: "Calça de alfaiataria premium", href: "produto.html?id=genesis-tailored" },
        { src: "images/placeholderreal.webp", alt: "Scarpin em couro envernizado", title: "Scarpin em couro envernizado", href: "produto.html?id=atelier-heels" },
        { src: "images/placeholderreal.webp", alt: "Blazer em linho premium", title: "Blazer em linho premium", href: "produto.html?id=essence-blazer" }
      ],
      masculino: [
        { src: "images/placeholderreal.webp", alt: "Camisa em algodão croata", title: "Camisa em algodão croata", href: "produto.html?id=origem-shirt" },
        { src: "images/placeholderreal.webp", alt: "Jaqueta bomber em couro italiano", title: "Jaqueta bomber em couro italiano", href: "produto.html?id=genesis-bomber" },
        { src: "images/placeholderreal.webp", alt: "Tênis em nylon técnico e couro", title: "Tênis em nylon técnico premium", href: "produto.html?id=noir-sneaker" },
        { src: "images/placeholderreal.webp", alt: "Trench coat em gabardine", title: "Trench coat em gabardine", href: "produto.html?id=flux-trench" }
      ]
    },
    popular: {
      feminino: [
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 1", title: "", href: "produto.html?id=origem-skirt" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 2", title: "", href: "produto.html?id=genesis-tailored" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 3", title: "", href: "produto.html?id=atelier-heels" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 4", title: "", href: "produto.html?id=essence-blazer" }
      ],
      masculino: [
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 1", title: "", href: "produto.html?id=origem-shirt" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 2", title: "", href: "produto.html?id=genesis-bomber" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 3", title: "", href: "produto.html?id=noir-sneaker" },
        { src: "images/placeholderreal.webp", alt: "Peça mais clicada 4", title: "", href: "produto.html?id=flux-trench" }
      ]
    }
  };

  const content = isEnglish ? contentEn : contentPt;

  sections.forEach((section) => {
    const categoryGrid = section.querySelector(".category-grid");
    const categoryTabs = Array.from(section.querySelectorAll(".category-tab"));
    const categoryCards = Array.from(section.querySelectorAll(".category-card"));
    if (!categoryGrid || categoryTabs.length === 0 || categoryCards.length === 0) return;

    const variant = String(section.dataset.categorySwitch || "featured");
    const categoryContent = content[variant] || content.featured;

    let currentCategory = "feminino";
    let switchTimer = null;

    function getCardHref(card) {
      const mediaLink = card?.querySelector(".category-media");
      const href = String(mediaLink?.getAttribute("href") || "").trim();
      return href && href !== "#" ? href : "";
    }

    function navigateCard(card) {
      const href = getCardHref(card);
      if (!href) return;
      window.location.href = href;
    }

    categoryCards.forEach((card) => {
      const title = card.querySelector("h3");
      if (title instanceof HTMLElement) {
        title.style.cursor = "pointer";
        title.setAttribute("role", "link");
        title.setAttribute("tabindex", "0");
        title.addEventListener("click", () => navigateCard(card));
        title.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          navigateCard(card);
        });
      }

      card.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (target.closest("a, button")) return;
        navigateCard(card);
      });
    });

    function applyCategoryContent(category) {
      const items = categoryContent[category];
      if (!items) return;

      categoryCards.forEach((card, i) => {
        const img = card.querySelector("img");
        const title = card.querySelector("h3");
        const mediaLink = card.querySelector(".category-media");
        const item = items[i];
        if (!img || !item) return;

        img.src = item.src;
        img.alt = item.alt;
        if (title) title.textContent = item.title || "";
        if (mediaLink) mediaLink.href = item.href || "#";
      });

      categoryTabs.forEach((tab) => {
        const isCurrent = tab.dataset.category === category;
        tab.classList.toggle("is-active", isCurrent);
        tab.setAttribute("aria-selected", isCurrent ? "true" : "false");
      });
    }

    function renderCategory(category, withAnimation = true) {
      if (!categoryContent[category]) return;
      if (category === currentCategory && !switchTimer) return;

      if (!withAnimation) {
        applyCategoryContent(category);
        currentCategory = category;
        return;
      }

      if (switchTimer) clearTimeout(switchTimer);

      categoryGrid.classList.add("is-switching");

      switchTimer = setTimeout(() => {
        applyCategoryContent(category);
        currentCategory = category;
        categoryGrid.classList.remove("is-switching");
        switchTimer = null;
      }, 180);
    }

    categoryTabs.forEach((tab) => {
      tab.addEventListener("click", () => renderCategory(tab.dataset.category, true));
    });

    applyCategoryContent("feminino");
  });
}

function initNewsCarousel() {
  const newsGrid = document.getElementById("newsGrid");
  if (!newsGrid) return;

  const prevBtn = document.getElementById("newsPrevBtn");
  const nextBtn = document.getElementById("newsNextBtn");
  const cards = Array.from(newsGrid.querySelectorAll(".news-card"));

  if (cards.length === 0) return;

  function getGap() {
    const styles = window.getComputedStyle(newsGrid);
    const rawGap = styles.columnGap || styles.gap || "0";
    const parsed = Number.parseFloat(rawGap);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getStepSize() {
    const firstCard = cards[0];
    const width = firstCard ? firstCard.getBoundingClientRect().width : 320;
    return width + getGap();
  }

  function updateNavState() {
    const maxScrollLeft = Math.max(0, newsGrid.scrollWidth - newsGrid.clientWidth - 1);
    const current = newsGrid.scrollLeft;

    if (prevBtn) {
      const disabled = current <= 1;
      prevBtn.disabled = disabled;
      prevBtn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    if (nextBtn) {
      const disabled = current >= maxScrollLeft;
      nextBtn.disabled = disabled;
      nextBtn.setAttribute("aria-disabled", disabled ? "true" : "false");
    }
  }

  function scrollByStep(direction) {
    newsGrid.scrollBy({
      left: getStepSize() * direction,
      behavior: "smooth"
    });
  }

  prevBtn?.addEventListener("click", () => scrollByStep(-1));
  nextBtn?.addEventListener("click", () => scrollByStep(1));

  newsGrid.addEventListener("scroll", updateNavState, { passive: true });
  window.addEventListener("resize", updateNavState);
  updateNavState();
}

function initHomeHeaderScrollState() {
  const homeHeader = document.querySelector(".home-header");
  if (!homeHeader) return;
  if (document.body.classList.contains("processos-page")) return;

  let logoCycleTimer = null;

  function startLogoCycle() {
    if (logoCycleTimer) return;
    logoCycleTimer = setInterval(() => {
      homeHeader.classList.toggle("logo-cycle-image");
    }, 2400);
  }

  function stopLogoCycle() {
    if (!logoCycleTimer) return;
    clearInterval(logoCycleTimer);
    logoCycleTimer = null;
    homeHeader.classList.remove("logo-cycle-image");
  }

  function syncHeaderState() {
    const rootStyles = getComputedStyle(document.documentElement);
    const headerHeight = Number.parseInt(rootStyles.getPropertyValue("--header-height"), 10) || 84;
    const threshold = Math.max(24, Math.round(headerHeight * 0.75));
    const isScrolled = window.scrollY > threshold;
    homeHeader.classList.toggle("is-scrolled", isScrolled);

    if (isScrolled) {
      startLogoCycle();
    } else {
      stopLogoCycle();
    }
  }

  syncHeaderState();
  window.addEventListener("scroll", syncHeaderState, { passive: true });
}

function initHeaderMenu() {
  const menu = document.getElementById("headerMenu");
  const openBtn = document.getElementById("openHeaderMenu");
  const closeBtn = document.getElementById("closeHeaderMenu");

  if (!menu || !openBtn) return;
  let prelaunchNoticeTimer = null;

  function openMenu() {
    menu.classList.add("is-open");
    menu.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  }

  function ensurePrelaunchMenuNotice() {
    let notice = document.getElementById("prelaunchMenuNotice");
    if (notice) return notice;

    notice = document.createElement("div");
    notice.id = "prelaunchMenuNotice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    notice.style.position = "fixed";
    notice.style.left = "50%";
    notice.style.bottom = "20px";
    notice.style.transform = "translate(-50%, 18px)";
    notice.style.opacity = "0";
    notice.style.pointerEvents = "none";
    notice.style.transition = "opacity 0.2s ease, transform 0.2s ease";
    notice.style.background = "#101010";
    notice.style.color = "#f7f7f7";
    notice.style.border = "1px solid rgba(255,255,255,0.24)";
    notice.style.padding = "12px 14px";
    notice.style.zIndex = "2200";
    notice.style.display = "flex";
    notice.style.alignItems = "center";
    notice.style.gap = "12px";
    notice.style.maxWidth = "calc(100vw - 24px)";
    notice.style.fontFamily = "Montserrat, sans-serif";
    notice.style.fontSize = "12px";
    notice.style.letterSpacing = "0.2px";
    notice.innerHTML =
      '<span>Menu indisponível por enquanto. As peças ainda serão lançadas.</span>' +
      '<a href="lancamento.html" style="color:#fff;text-decoration:underline;white-space:nowrap;">Ver lancamento</a>';
    document.body.appendChild(notice);
    return notice;
  }

  function showPrelaunchMenuNotice() {
    const notice = ensurePrelaunchMenuNotice();
    notice.style.opacity = "1";
    notice.style.transform = "translate(-50%, 0)";
    notice.style.pointerEvents = "auto";
    window.clearTimeout(prelaunchNoticeTimer);
    prelaunchNoticeTimer = window.setTimeout(() => {
      notice.style.opacity = "0";
      notice.style.transform = "translate(-50%, 18px)";
      notice.style.pointerEvents = "none";
    }, 4200);
  }

  if (isPrelaunchMode) {
    openBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeMenu();
      showPrelaunchMenuNotice();
    });
    closeBtn?.addEventListener("click", closeMenu);
    return;
  }

  openBtn.addEventListener("click", openMenu);
  closeBtn?.addEventListener("click", closeMenu);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.classList.contains("is-open")) {
      closeMenu();
    }
  });

  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("is-open")) return;
    const clickedInsideMenu = menu.contains(event.target);
    const clickedOpenButton = openBtn.contains(event.target);
    if (!clickedInsideMenu && !clickedOpenButton) {
      closeMenu();
    }
  });
}

function initHeroVideoLoop() {
  const heroVideo = document.querySelector(".hero-video");
  if (!heroVideo) return;
  const fallbackSrc = String(heroVideo.getAttribute("data-fallback-src") || "").trim();
  let hasAppliedFallback = false;

  function applyVideoFallback() {
    if (!fallbackSrc || hasAppliedFallback) return;
    hasAppliedFallback = true;

    // Rebuild source list to force browser fallback load when local asset is invalid.
    heroVideo.innerHTML = "";
    const source = document.createElement("source");
    source.src = fallbackSrc;
    source.type = "video/mp4";
    heroVideo.appendChild(source);
    heroVideo.load();
    heroVideo.play().catch(() => {});
  }

  heroVideo.addEventListener("ended", () => {
    heroVideo.currentTime = 0;
    heroVideo.play().catch(() => {});
  });

  heroVideo.addEventListener("error", applyVideoFallback);
  const firstSource = heroVideo.querySelector("source");
  firstSource?.addEventListener("error", applyVideoFallback);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      heroVideo.play().catch(() => {});
    }
  });
}

function initCartEntryPoints() {
  const cartKey = "tsebi-cart-v1";
  const legacyCartKeys = ["tsebi-cart", "cart"];
  const returnKey = "tsebi-last-shopping-url";
  const currentPath = window.location.pathname.toLowerCase();
  const isCartPage = currentPath.endsWith("/cart.html") || currentPath.endsWith("cart.html");

  function getCurrentRelativeUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function readCart() {
    function normalize(items) {
      if (!Array.isArray(items)) return [];
      return items
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const rawKey = String(item.key || "").trim();
          const idFromKey = rawKey.includes("::") ? rawKey.split("::")[0] : rawKey;
          const id = String(item.id || item.productId || idFromKey || "").trim();
          if (!id) return null;
          return {
            id,
            qty: Math.max(1, Number(item.qty || item.quantity || 1))
          };
        })
        .filter(Boolean);
    }

    function parse(raw) {
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return normalize(parsed);
        if (parsed && Array.isArray(parsed.items)) return normalize(parsed.items);
      } catch {}
      return [];
    }

    try {
      const current = parse(localStorage.getItem(cartKey));
      if (current.length > 0) return current;
      for (const key of legacyCartKeys) {
        const legacy = parse(localStorage.getItem(key));
        if (legacy.length > 0) {
          localStorage.setItem(cartKey, JSON.stringify(legacy));
          return legacy;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  const totalItems = readCart().reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
  const cartLinks = Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'));

  cartLinks.forEach((link) => {
    if (!isCartPage) {
      const returnTo = getCurrentRelativeUrl();
      link.href = `cart.html?returnTo=${encodeURIComponent(returnTo)}`;
      link.addEventListener("click", () => {
        try {
          sessionStorage.setItem(returnKey, returnTo);
        } catch {}
      });
    } else {
      link.href = "cart.html";
    }
    link.classList.add("cart-link");
    if (totalItems > 0) {
      link.setAttribute("data-cart-count", String(totalItems));
    } else {
      link.removeAttribute("data-cart-count");
    }
  });
}

function initAccountEntryPoints() {
  const accountLinks = Array.from(document.querySelectorAll('a[aria-label="Conta"]'));
  if (!accountLinks.length) return;
  const currentRelativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginUrl = `login.html?returnUrl=${encodeURIComponent(currentRelativeUrl)}`;

  function render() {
    const user = userStore?.getCurrentUser?.() || null;
    const label = userStore?.getDisplayName?.() || "Entrar / Criar conta";
    accountLinks.forEach((link) => {
      link.href = user ? "conta.html" : loginUrl;
      if (link.classList.contains("quick-action")) return;
      link.textContent = label;
    });
  }

  render();
  window.addEventListener("tsebi:auth-changed", render);
}

function initTrackOrderEntryPoints() {
  const trackPanelPath = "conta.html#card-orders";
  const trackLinks = Array.from(document.querySelectorAll('a[data-link-key="track-order"]'));

  if (!trackLinks.length) {
    const footerLinks = Array.from(document.querySelectorAll(".site-footer a"));
    footerLinks.forEach((link) => {
      const linkText = String(link.textContent || "").trim().toLowerCase();
      if (linkText === "acompanhe seu pedido") trackLinks.push(link);
    });
  }

  if (!trackLinks.length) return;

  function render() {
    trackLinks.forEach((link) => {
      link.href = trackPanelPath;
      link.dataset.linkKey = "track-order";
    });
  }

  render();
  window.addEventListener("tsebi:auth-changed", render);
}

function normalizeNewsletterEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeNewsletterPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function isValidNewsletterEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeNewsletterEmail(value));
}

function getNewsletterSource(form) {
  if (!(form instanceof HTMLFormElement)) return "footer";
  if (form.classList.contains("newsletter-popup-form")) return "popup";
  return "footer";
}

function ensureNewsletterFeedback(form) {
  if (!(form instanceof HTMLFormElement)) return null;
  let node = form.querySelector(".newsletter-feedback");
  if (node) return node;
  node = document.createElement("p");
  node.className = "newsletter-feedback";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  form.appendChild(node);
  return node;
}

function setNewsletterFeedback(form, message, type) {
  const feedback = ensureNewsletterFeedback(form);
  if (!feedback) return;
  feedback.textContent = String(message || "");
  feedback.dataset.state = type === "error" ? "error" : "success";
}

function setNewsletterFormLoading(form, loading) {
  if (!(form instanceof HTMLFormElement)) return;
  const submitButton = form.querySelector('button[type="submit"]');
  if (!(submitButton instanceof HTMLButtonElement)) return;
  if (!submitButton.dataset.defaultLabel) {
    submitButton.dataset.defaultLabel = submitButton.textContent || "";
  }
  submitButton.disabled = Boolean(loading);
  if (loading) {
    submitButton.dataset.loading = "true";
    submitButton.textContent = "...";
  } else {
    submitButton.dataset.loading = "false";
    submitButton.textContent = submitButton.dataset.defaultLabel || submitButton.textContent;
  }
}

function closeNewsletterPopupAfterSuccess(form) {
  if (!(form instanceof HTMLFormElement)) return;
  if (!form.classList.contains("newsletter-popup-form")) return;
  const popup = document.getElementById("newsletterPopup");
  if (!popup) return;
  popup.classList.remove("is-open");
  popup.setAttribute("aria-hidden", "true");
  document.body.classList.remove("newsletter-popup-open");
}

function initNewsletterForms() {
  const forms = Array.from(document.querySelectorAll(".newsletter-form, .newsletter-popup-form"));
  if (!forms.length) return;

  forms.forEach((form) => {
    if (!(form instanceof HTMLFormElement)) return;
    if (form.dataset.newsletterBound === "true") return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const phoneInput = form.querySelector('input[type="tel"]');
      const email = normalizeNewsletterEmail(emailInput?.value || "");
      const phone = normalizeNewsletterPhone(phoneInput?.value || "");

      if (!isValidNewsletterEmail(email)) {
        setNewsletterFeedback(form, "Informe um e-mail valido para assinar.", "error");
        emailInput?.focus();
        return;
      }

      setNewsletterFormLoading(form, true);
      setNewsletterFeedback(form, "", "success");

      try {
        const response = await fetch("/api/newsletter/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email,
            phone,
            source: getNewsletterSource(form),
            page: `${window.location.pathname}${window.location.search}`.slice(0, 200),
            consent: true
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok) {
          setNewsletterFeedback(form, "Nao foi possivel concluir sua inscricao. Tente novamente.", "error");
          return;
        }

        setNewsletterFeedback(form, "Inscricao confirmada. Voce recebera as novidades da Tsebi.", "success");
        form.reset();
        closeNewsletterPopupAfterSuccess(form);
      } catch {
        setNewsletterFeedback(form, "Falha de conexao. Tente novamente em instantes.", "error");
      } finally {
        setNewsletterFormLoading(form, false);
      }
    });

    form.dataset.newsletterBound = "true";
  });
}

function initNewsletterPopup() {
  const popup = document.getElementById("newsletterPopup");
  const closeBtn = document.getElementById("closeNewsletterPopup");
  const backdrop = document.getElementById("newsletterPopupBackdrop");
  const shownKey = "tsebi-newsletter-popup-shown-session";

  if (!popup) return;

  let openTimer = null;

  function hasBeenShownInSession() {
    try {
      return sessionStorage.getItem(shownKey) === "true";
    } catch {
      return false;
    }
  }

  function markShownInSession() {
    try {
      sessionStorage.setItem(shownKey, "true");
    } catch {}
  }

  if (hasBeenShownInSession()) return;

  function closePopup() {
    popup.classList.remove("is-open");
    popup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("newsletter-popup-open");
  }

  function openPopup() {
    markShownInSession();
    popup.classList.add("is-open");
    popup.setAttribute("aria-hidden", "false");
    document.body.classList.add("newsletter-popup-open");
  }

  openTimer = window.setTimeout(openPopup, 5000);

  closeBtn?.addEventListener("click", () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    closePopup();
  });

  backdrop?.addEventListener("click", () => {
    if (openTimer) {
      clearTimeout(openTimer);
      openTimer = null;
    }
    closePopup();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && popup.classList.contains("is-open")) {
      closePopup();
    }
  });
}




