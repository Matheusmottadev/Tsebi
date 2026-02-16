(() => {
  // Para atualizar no futuro:
  // 1) Adicione/remova itens no array `genesisItems`.
  // 2) Para nova categoria, basta usar uma nova `categoryKey`.
  // 3) Mantenha `href` apontando para produto.html?id=...
  const fallbackGenesisItems = [
    {
      id: "genesis-bomber",
      categoryKey: "jackets",
      categoryLabel: { pt: "Jaquetas", en: "Jackets" },
      name: {
        pt: "Jaqueta bomber em couro italiano com forro em seda",
        en: "Italian leather bomber jacket with silk lining"
      },
      priceLabel: "R$ 5.900",
      image: "images/produtos/sug1.jpeg",
      href: "produto.html?id=genesis-bomber"
    },
    {
      id: "genesis-tailored",
      categoryKey: "trousers",
      categoryLabel: { pt: "Calças", en: "Trousers" },
      name: {
        pt: "Calça de alfaiataria em sarja premium estruturada",
        en: "Premium structured tailored twill trousers"
      },
      priceLabel: "R$ 2.200",
      image: "images/produtos/sug4.jpeg",
      href: "produto.html?id=genesis-tailored"
    },
    {
      id: "atelier-heels",
      categoryKey: "footwear",
      categoryLabel: { pt: "Calçados", en: "Footwear" },
      name: {
        pt: "Scarpin em couro envernizado de salto esculpido",
        en: "Patent leather pumps with sculpted heel"
      },
      priceLabel: "R$ 3.200",
      image: "images/produtos/sug2.jpeg",
      href: "produto.html?id=atelier-heels"
    },
    {
      id: "flux-knit",
      categoryKey: "knitwear",
      categoryLabel: { pt: "Malhas", en: "Knitwear" },
      name: {
        pt: "Malha em lã merino de toque ultrafino",
        en: "Ultrafine merino wool knitwear"
      },
      priceLabel: "R$ 1.980",
      image: "images/produtos/sug4.jpeg",
      href: "produto.html?id=flux-knit"
    },
    {
      id: "noir-dress",
      categoryKey: "dresses",
      categoryLabel: { pt: "Vestidos", en: "Dresses" },
      name: {
        pt: "Vestido coluna em crepe de seda com caimento couture",
        en: "Silk crepe column dress with couture drape"
      },
      priceLabel: "R$ 4.200",
      image: "images/produtos/sug2.jpeg",
      href: "produto.html?id=noir-dress"
    },
    {
      id: "essence-trousers",
      categoryKey: "trousers",
      categoryLabel: { pt: "Calças", en: "Trousers" },
      name: {
        pt: "Calça wide leg em linho premium com prega profunda",
        en: "Premium linen wide-leg trousers with deep pleat"
      },
      priceLabel: "R$ 2.250",
      image: "images/produtos/sug3.jpeg",
      href: "produto.html?id=essence-trousers"
    }
  ];

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  async function loadProducts() {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) return [];
      const parsed = await response.json();
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.products)) return parsed.products;
    } catch {}

    return [];
  }

  function toCategoryKey(category) {
    const normalized = normalizeText(category);
    if (normalized.includes("jaquet")) return "jackets";
    if (normalized.includes("calc") || normalized.includes("trouser")) return "trousers";
    if (normalized.includes("calcad") || normalized.includes("footwear")) return "footwear";
    if (normalized.includes("malha") || normalized.includes("knit")) return "knitwear";
    if (normalized.includes("vestid") || normalized.includes("dress")) return "dresses";
    return "collection";
  }

  function toCategoryLabel(category, key) {
    const normalized = normalizeText(category);
    if (key === "jackets") return { pt: "Jaquetas", en: "Jackets" };
    if (key === "trousers") return { pt: "Calças", en: "Trousers" };
    if (key === "footwear") return { pt: "Calçados", en: "Footwear" };
    if (key === "knitwear") return { pt: "Malhas", en: "Knitwear" };
    if (key === "dresses") return { pt: "Vestidos", en: "Dresses" };
    if (normalized) return { pt: category, en: category };
    return { pt: "Coleção", en: "Collection" };
  }

  let genesisItems = [...fallbackGenesisItems];

  const grid = document.getElementById("genesisGrid");
  const filters = document.getElementById("genesisCategoryFilters");
  if (!grid || !filters) return;

  const lang = localStorage.getItem("tsebi-site-language") === "en" ? "en" : "pt";
  const allLabel = lang === "en" ? "All categories" : "Todas as categorias";
  const emptyLabel = lang === "en" ? "No items found in this category." : "Nenhuma peça encontrada nessa categoria.";

  let categories = [];

  function refreshCategories() {
    categories = [];
    genesisItems.forEach((item) => {
      if (!categories.some((category) => category.key === item.categoryKey)) {
        categories.push({
          key: item.categoryKey,
          label: item.categoryLabel[lang] || item.categoryLabel.pt
        });
      }
    });
  }

  let activeCategory = "all";

  function renderFilters() {
    filters.innerHTML = "";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "genesis-filter-btn is-active";
    allButton.dataset.category = "all";
    allButton.textContent = allLabel;
    filters.appendChild(allButton);

    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "genesis-filter-btn";
      button.dataset.category = category.key;
      button.textContent = category.label;
      filters.appendChild(button);
    });
  }

  function groupByCategory(items) {
    return items.reduce((acc, item) => {
      if (!acc[item.categoryKey]) {
        acc[item.categoryKey] = {
          label: item.categoryLabel[lang] || item.categoryLabel.pt,
          items: []
        };
      }
      acc[item.categoryKey].items.push(item);
      return acc;
    }, {});
  }

  function renderCards(itemsByCategory) {
    grid.innerHTML = "";
    const groups = Object.values(itemsByCategory);

    if (!groups.length) {
      const empty = document.createElement("p");
      empty.className = "genesis-empty";
      empty.textContent = emptyLabel;
      grid.appendChild(empty);
      return;
    }

    groups.forEach((group) => {
      const section = document.createElement("section");
      section.className = "genesis-group";

      const title = document.createElement("h2");
      title.className = "genesis-group-title";
      title.textContent = group.label;

      const categoryGrid = document.createElement("div");
      categoryGrid.className = "genesis-grid";

      group.items.forEach((item) => {
        const card = document.createElement("a");
        card.className = "genesis-card";
        card.href = item.href;
        card.innerHTML = `
          <div class="genesis-card-media">
            <img src="${item.image}" alt="${item.name[lang] || item.name.pt}" loading="lazy" decoding="async" />
          </div>
          <div class="genesis-card-meta">
            <h3 class="genesis-card-name">${item.name[lang] || item.name.pt}</h3>
            <p class="genesis-card-price">${item.priceLabel}</p>
          </div>
        `;
        categoryGrid.appendChild(card);
      });

      section.append(title, categoryGrid);
      grid.appendChild(section);
    });
  }

  function render() {
    const filtered = activeCategory === "all"
      ? genesisItems
      : genesisItems.filter((item) => item.categoryKey === activeCategory);
    renderCards(groupByCategory(filtered));
  }

  filters.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (!target.classList.contains("genesis-filter-btn")) return;

    activeCategory = target.dataset.category || "all";
    filters.querySelectorAll(".genesis-filter-btn").forEach((button) => {
      button.classList.toggle("is-active", button === target);
    });
    render();
  });

  async function initialize() {
    const apiProducts = await loadProducts();
    if (apiProducts.length > 0) {
      const mapped = apiProducts
        .filter((item) => normalizeText(item?.collection).includes("genesis"))
        .map((item) => {
          const categoryKey = toCategoryKey(item.category);
          return {
            id: String(item.id || item.sku || "").trim(),
            categoryKey,
            categoryLabel: toCategoryLabel(item.category, categoryKey),
            name: {
              pt: String(item.name || ""),
              en: String(item.nameEn || item.name || "")
            },
            priceLabel: String(item.priceLabel || ""),
            image: String(item.image || "images/produtos/sug1.jpeg"),
            href: String(item.href || `produto.html?id=${encodeURIComponent(String(item.id || "").trim())}`)
          };
        })
        .filter((item) => item.id);

      if (mapped.length > 0) {
        genesisItems = mapped;
      }
    }

    refreshCategories();
    renderFilters();
    render();
  }

  initialize().catch(() => {
    refreshCategories();
    renderFilters();
    render();
  });
})();
