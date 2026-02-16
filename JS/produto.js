let productsCatalog = [];

async function loadProductsCatalog() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) return [];
    const parsed = await response.json();
    const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.products) ? parsed.products : []);
    return list.map((product) => ({
      ...product,
      stock: Number(product?.stock ?? product?.stock_qty ?? 0)
    }));
  } catch {}

  return [];
}

async function loadProductById(id) {
  const normalizedId = String(id || "").trim();
  if (!normalizedId) return null;

  try {
    const response = await fetch(`/api/products/${encodeURIComponent(normalizedId)}`);
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const parsed = await response.json();
    if (parsed && typeof parsed === "object") {
      return {
        ...parsed,
        stock: Number(parsed?.stock ?? parsed?.stock_qty ?? 0)
      };
    }
  } catch {}

  return null;
}

const galleryPool = [
  "images/produtos/sug1.jpeg",
  "images/produtos/sug2.jpeg",
  "images/produtos/sug3.jpeg",
  "images/produtos/sug4.jpeg"
];

const cartKey = "tsebi-cart-v1";
const returnKey = "tsebi-last-shopping-url";
const userStore = window.TsebiUserStore;
const currentLang = localStorage.getItem("tsebi-site-language") || "pt";
const isEnglish = currentLang === "en";

const productNameMapEn = {
  "genesis-bomber": "Italian leather bomber jacket with silk lining",
  "genesis-tailored": "Premium structured tailored twill pants",
  "origem-shirt": "Croatian cotton shirt with noble weave",
  "origem-skirt": "Structured cool wool skirt with impeccable finish",
  "atelier-bag": "Natural leather bag with plated hardware",
  "atelier-heels": "Patent leather pumps with sculpted heel",
  "flux-trench": "Gabardine trench coat with architectural cut",
  "flux-knit": "Ultrafine merino wool knitwear",
  "noir-dress": "Silk crepe column dress with couture drape",
  "noir-sneaker": "Technical nylon and premium-finish leather sneaker",
  "essence-blazer": "Premium linen blazer with precision tailoring",
  "essence-trousers": "Premium linen wide-leg trousers with deep pleat"
};

const colorMapEn = {
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
  "Off white": "Off-white"
};

const collectionMapEn = {
  "Gênesis": "Genesis",
  "Alicerce": "Alicerce"
};

const sizeMapEn = { P: "S", M: "M", G: "X", GG: "XS" };

function tProductName(itemOrId, fallback) {
  const id = typeof itemOrId === "string" ? itemOrId : itemOrId?.id;
  const source = typeof itemOrId === "string" ? fallback : itemOrId?.name;
  if (!isEnglish) return source || "";
  return productNameMapEn[id] || source || "";
}

function tColor(color) {
  if (!isEnglish) return color || "";
  return colorMapEn[color] || color || "";
}

function tCollection(collection) {
  if (!isEnglish) return collection || "";
  return collectionMapEn[collection] || collection || "";
}

function tSize(size) {
  if (!isEnglish) return size || "";
  return sizeMapEn[size] || size || "";
}

function variantKey(color, size) {
  return `${color}__${size}`;
}

function readCart() {
  function normalizeCartItems(items) {
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
          id,
          qty: Math.max(1, Number(item.qty || item.quantity || 1))
        };
      })
      .filter(Boolean);
  }

  try {
    const raw = localStorage.getItem(cartKey);
    const parsed = raw ? JSON.parse(raw) : [];
    const normalized = normalizeCartItems(parsed);
    if (Array.isArray(parsed) && normalized.length !== parsed.length) {
      saveCart(normalized);
    }
    return normalized;
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(cartKey, JSON.stringify(items));
  } catch {}
}

function isFavoriteProduct(productId) {
  return Boolean(userStore?.isFavorite(productId));
}

function updateFavoriteButtonUI(button) {
  const productId = button?.dataset.productId || "";
  const active = isFavoriteProduct(productId);
  button.classList.toggle("is-active", active);
  button.textContent = active ? "♥" : "♡";
  button.setAttribute("aria-label", active ? "Remover dos favoritos" : "Adicionar aos favoritos");
}

function initProductAccountEntry() {
  const accountLinks = Array.from(document.querySelectorAll('a[aria-label="Conta"]'));
  if (!accountLinks.length) return;
  const label = userStore?.getDisplayName?.() || "Conta";
  accountLinks.forEach((link) => {
    link.href = "conta.html";
    link.textContent = label;
  });
}

function syncProductHeaderCartLink() {
  const cartLinks = Array.from(document.querySelectorAll('a[aria-label="Carrinho"]'));
  if (!cartLinks.length) return;

  const totalItems = readCart().reduce((sum, item) => sum + Math.max(1, Number(item.qty) || 1), 0);
  cartLinks.forEach((link) => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    link.href = `cart.html?returnTo=${encodeURIComponent(returnTo)}`;
    link.classList.add("cart-link");
    if (!link.dataset.returnBound) {
      link.addEventListener("click", () => {
        try {
          sessionStorage.setItem(returnKey, returnTo);
        } catch {}
      });
      link.dataset.returnBound = "true";
    }
    if (totalItems > 0) {
      link.setAttribute("data-cart-count", String(totalItems));
    } else {
      link.removeAttribute("data-cart-count");
    }
  });
}

function initProductCartLinksReturnTo() {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const links = Array.from(document.querySelectorAll('a[href="cart.html"]'));
  links.forEach((link) => {
    link.href = `cart.html?returnTo=${encodeURIComponent(returnTo)}`;
    if (link.dataset.returnBound) return;
    link.addEventListener("click", () => {
      try {
        sessionStorage.setItem(returnKey, returnTo);
      } catch {}
    });
    link.dataset.returnBound = "true";
  });
}

function parsePrice(label) {
  const normalized = String(label || "")
    .replace("R$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .trim();
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

function formatPrice(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildProductGalleryByColor(product) {
  const colorGalleries = {};

  product.colors.forEach((color, colorIndex) => {
    const rotated = galleryPool.map((_, i) => galleryPool[(i + colorIndex) % galleryPool.length]);
    const unique = [product.image, ...rotated].filter((img, idx, list) => list.indexOf(img) === idx);
    colorGalleries[color] = unique.slice(0, 6);
  });

  return colorGalleries;
}

function buildVariantStock(product) {
  const stockMap = {};
  const totalStock = Math.max(0, Number(product?.stock ?? product?.stock_qty ?? 0));
  const combinations = [];

  product.colors.forEach((color) => {
    product.sizes.forEach((size) => {
      const key = variantKey(color, size);
      stockMap[key] = 0;
      combinations.push(key);
    });
  });

  if (combinations.length === 0 || totalStock <= 0) {
    return stockMap;
  }

  let remaining = totalStock;
  let index = 0;
  while (remaining > 0) {
    const key = combinations[index % combinations.length];
    stockMap[key] += 1;
    remaining -= 1;
    index += 1;
  }

  return stockMap;
}

function createOptionButton(label, isSelected, isDisabled) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "product-variant-option";
  button.textContent = label;

  if (isSelected) button.classList.add("is-selected");
  if (isDisabled) {
    button.classList.add("is-disabled");
    button.disabled = true;
  }

  return button;
}

const params = new URLSearchParams(window.location.search);
const productId = params.get("id");
const returnTo = params.get("returnTo");

const productView = document.getElementById("productView");
const productNotFound = document.getElementById("productNotFound");
const productBack = document.querySelector(".product-back");
let productCta = null;

if (productBack) {
  const referrerUrl = document.referrer ? new URL(document.referrer, window.location.href) : null;
  const sameOriginReferrer = referrerUrl && referrerUrl.origin === window.location.origin ? referrerUrl.href : "";
  const fallbackUrl = returnTo ? decodeURIComponent(returnTo) : (sameOriginReferrer || "index.html");
  productBack.setAttribute("href", fallbackUrl);

  productBack.addEventListener("click", (event) => {
    if (window.history.length > 1) {
      event.preventDefault();
      window.history.back();
    }
  });
}

syncProductHeaderCartLink();
initProductCartLinksReturnTo();
initProductAccountEntry();

initProductPage();

async function initProductPage() {
  productsCatalog = await loadProductsCatalog();
  if (!Array.isArray(productsCatalog)) productsCatalog = [];

  const product = (await loadProductById(productId)) || productsCatalog.find((item) => item.id === productId);

if (!product) {
  if (productNotFound) productNotFound.hidden = false;
} else {
  productCta = document.querySelector(".product-cta");
  const productMediaTrack = document.getElementById("productMediaTrack");
  const productMediaDots = document.getElementById("productMediaDots");
  const productCollection = document.getElementById("productCollection");
  const productName = document.getElementById("productName");
  const productPrice = document.getElementById("productPrice");
  const productDescription = document.getElementById("productDescription");
  const productSimilar = document.getElementById("productSimilar");
  const productSimilarGrid = document.getElementById("productSimilarGrid");
  const productSelectedColorText = document.getElementById("productSelectedColorText");
  const productColorOptions = document.getElementById("productColorOptions");
  const productSizeSelect = document.getElementById("productSizeSelect");
  const productStockNote = document.getElementById("productStockNote");
  const openProductDetailsPopup = document.getElementById("openProductDetailsPopup");
  const productDetailsPopup = document.getElementById("productDetailsPopup");
  const productDetailsPopupBackdrop = document.getElementById("productDetailsPopupBackdrop");
  const closeProductDetailsPopup = document.getElementById("closeProductDetailsPopup");
  const productDetailsTitle = document.getElementById("productDetailsTitle");
  const productDetailsOrigin = document.getElementById("productDetailsOrigin");
  const productDetailsComposition = document.getElementById("productDetailsComposition");
  const productDetailsConstruction = document.getElementById("productDetailsConstruction");
  const productDetailsCare = document.getElementById("productDetailsCare");
  const cartPopup = document.getElementById("cartPopup");
  const cartPopupBackdrop = document.getElementById("cartPopupBackdrop");
  const closeCartPopup = document.getElementById("closeCartPopup");
  const cartPopupItems = document.getElementById("cartPopupItems");
  const cartPopupCount = document.getElementById("cartPopupCount");
  const cartPopupSubtotal = document.getElementById("cartPopupSubtotal");

  const colorGalleries = buildProductGalleryByColor(product);
  const stockMap = buildVariantStock(product);
  const totalProductStock = Math.max(0, Number(product?.stock ?? product?.stock_qty ?? 0));

  let selectedColor = product.colors[0] || "";
  let selectedSize = product.sizes[0] || "";

  function getProductDetails(item) {
    const originByCollection = {
      "Gênesis": "Desenvolvida no Brasil, com matérias-primas selecionadas de fornecedores europeus e acabamento final artesanal.",
      "Alicerce": "Criada no Brasil com foco em alfaiataria contemporânea, construída para uso recorrente com padrão premium."
    };

    if (isEnglish) {
      return {
        origin: "Developed in Brazil with carefully selected materials and refined finishing.",
        composition: `${item.material}.`,
        construction: "Precise fit, clean seams and a structure designed to keep an elegant drape over time.",
        care: "Dry clean or professional specialized care. Store in an airy place and avoid rough surfaces."
      };
    }

    return {
      origin: originByCollection[item.collection] || "Peça desenvolvida no Brasil com seleção criteriosa de materiais.",
      composition: `${item.material}.`,
      construction: "Modelagem precisa, costuras limpas e estrutura pensada para manter caimento elegante ao longo do uso.",
      care: "Lavar a seco ou higienização profissional especializada. Guardar em local arejado e evitar contato com superfícies ásperas."
    };
  }

  function getStock(color, size) {
    return stockMap[variantKey(color, size)] || 0;
  }

  function isColorAvailable(color, currentSize) {
    if (currentSize) return getStock(color, currentSize) > 0;
    return product.sizes.some((size) => getStock(color, size) > 0);
  }

  function isSizeAvailable(size, currentColor) {
    if (currentColor) return getStock(currentColor, size) > 0;
    return product.colors.some((color) => getStock(color, size) > 0);
  }

  function getFirstAvailableSizeForColor(color) {
    return product.sizes.find((size) => getStock(color, size) > 0) || "";
  }

  function getFirstAvailableColorForSize(size) {
    return product.colors.find((color) => getStock(color, size) > 0) || "";
  }

  function renderGallery(images) {
    if (!productMediaTrack || !productMediaDots) return;

    productMediaTrack.innerHTML = "";
    productMediaDots.innerHTML = "";
    const slideIds = [];

    images.forEach((imageSrc, index) => {
      const slide = document.createElement("div");
      slide.className = "product-media-slide";
      slide.id = `productMediaSlide-${index}`;
      slideIds.push(slide.id);

      const image = document.createElement("img");
      image.src = imageSrc;
      image.alt = `${tProductName(product)} - ${isEnglish ? "photo" : "foto"} ${index + 1}`;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";
      slide.appendChild(image);
      productMediaTrack.appendChild(slide);

      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "product-dot";
      dot.setAttribute("aria-label", `Ver foto ${index + 1}`);
      dot.addEventListener("click", () => {
        const target = document.getElementById(`productMediaSlide-${index}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      productMediaDots.appendChild(dot);
    });

    function setActiveDot(activeIndex) {
      const dots = Array.from(productMediaDots.querySelectorAll(".product-dot"));
      dots.forEach((dot, dotIndex) => {
        dot.classList.toggle("is-active", dotIndex === activeIndex);
      });
    }

    function syncActiveDotByScroll() {
      const trackTop = productMediaTrack.getBoundingClientRect().top;
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      slideIds.forEach((id, index) => {
        const slideEl = document.getElementById(id);
        if (!slideEl) return;
        const distance = Math.abs(slideEl.getBoundingClientRect().top - trackTop);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      setActiveDot(nearestIndex);
    }

    productMediaTrack.addEventListener("scroll", syncActiveDotByScroll, { passive: true });
    setActiveDot(0);
  }

  function renderVariantOptions() {
    if (!productColorOptions || !productSizeSelect) return;

    productColorOptions.innerHTML = "";
    productSizeSelect.innerHTML = "";
    productSizeSelect.onchange = null;

    if (productSelectedColorText) {
      productSelectedColorText.textContent = tColor(selectedColor || "-");
    }

    product.colors.forEach((color) => {
      const disabled = !isColorAvailable(color, selectedSize);
      const button = createOptionButton(tColor(color), selectedColor === color, disabled);
      button.classList.add("product-color-option");
      button.addEventListener("click", () => {
        selectedColor = color;
        if (!isSizeAvailable(selectedSize, selectedColor)) {
          selectedSize = getFirstAvailableSizeForColor(selectedColor);
        }
        syncProductState();
      });
      productColorOptions.appendChild(button);
    });

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = isEnglish ? "Select size" : "Selecionar tamanho";
    productSizeSelect.appendChild(placeholder);

    product.sizes.forEach((size) => {
      const disabled = !isSizeAvailable(size, selectedColor);
      const option = document.createElement("option");
      option.value = size;
      option.textContent = tSize(size);
      option.disabled = disabled;
      if (selectedSize === size) option.selected = true;
      productSizeSelect.appendChild(option);
    });

    if (!selectedSize || !isSizeAvailable(selectedSize, selectedColor)) {
      selectedSize = getFirstAvailableSizeForColor(selectedColor);
      productSizeSelect.value = selectedSize || "";
    }

    productSizeSelect.onchange = () => {
      selectedSize = productSizeSelect.value;
      if (!selectedSize) {
        syncProductState();
        return;
      }
      if (!isColorAvailable(selectedColor, selectedSize)) {
        selectedColor = getFirstAvailableColorForSize(selectedSize);
      }
      syncProductState();
    };
  }

  function syncStockState() {
    if (!productStockNote || !productCta) return;

    if (totalProductStock <= 0) {
      productStockNote.textContent = isEnglish ? "Sold out." : "Esgotado.";
      productCta.disabled = true;
      productCta.classList.add("is-disabled");
      productCta.textContent = isEnglish ? "Sold out" : "ESGOTADO";
      return;
    }

    const stock = getStock(selectedColor, selectedSize);

    if (!selectedColor || !selectedSize) {
      productStockNote.textContent = "";
      productCta.disabled = true;
      productCta.classList.add("is-disabled");
      productCta.textContent = isEnglish ? "Select variant" : "Selecionar variação";
      return;
    }

    if (stock <= 0) {
      productStockNote.textContent = isEnglish ? "Sold out." : "Esgotado.";
      productCta.disabled = true;
      productCta.classList.add("is-disabled");
      productCta.textContent = isEnglish ? "Sold out" : "ESGOTADO";
      return;
    }

    productStockNote.textContent = "";
    productCta.disabled = false;
    productCta.classList.remove("is-disabled");
    productCta.textContent = isEnglish ? "Add to cart" : "Adicionar ao carrinho";
  }

  function syncProductState() {
    const gallery = colorGalleries[selectedColor] || [product.image];
    renderGallery(gallery);
    renderVariantOptions();
    syncStockState();
  }

  function scoreSimilarity(baseProduct, candidate) {
    let score = 0;
    if (candidate.collection === baseProduct.collection) score += 5;
    if (candidate.material === baseProduct.material) score += 3;
    if (candidate.colors.some((color) => baseProduct.colors.includes(color))) score += 2;
    if (candidate.sizes.some((size) => baseProduct.sizes.includes(size))) score += 1;
    return score;
  }

  function renderSimilarProducts() {
    if (!productSimilar || !productSimilarGrid) return;

    const similar = productsCatalog
      .filter((item) => item.id !== product.id)
      .map((item) => ({ item, score: scoreSimilarity(product, item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.item);

    productSimilarGrid.innerHTML = "";

    similar.forEach((item) => {
      const card = document.createElement("a");
      card.className = "product-similar-card";
      card.href = `produto.html?id=${encodeURIComponent(item.id)}`;
      card.innerHTML = `
        <div class="product-similar-media">
          <img src="${item.image}" alt="${tProductName(item)}" loading="lazy" decoding="async" />
          <button class="product-favorite-btn ${isFavoriteProduct(item.id) ? "is-active" : ""}" type="button" data-product-id="${item.id}" aria-label="${isFavoriteProduct(item.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}">${isFavoriteProduct(item.id) ? "♥" : "♡"}</button>
        </div>
        <div class="product-similar-meta">
          <p class="product-similar-collection">${String(tCollection(item.collection) || "").toUpperCase()}</p>
          <h3 class="product-similar-name">${tProductName(item)}</h3>
          <p class="product-similar-price">${item.priceLabel}</p>
        </div>
      `;
      productSimilarGrid.appendChild(card);
    });

    productSimilar.hidden = similar.length === 0;
  }

  function addSelectedVariantToCart() {
    if (totalProductStock <= 0) {
      syncStockState();
      return;
    }

    if (!selectedColor || !selectedSize) return;

    const stock = getStock(selectedColor, selectedSize);
    if (stock <= 0) {
      syncStockState();
      return;
    }

    const cart = readCart();
    const key = `${product.id}::${selectedColor}::${selectedSize}`;
    const existing = cart.find((item) => item.key === key);

    if (existing) {
      if ((Number(existing.qty) || 1) >= stock) {
          if (productStockNote) productStockNote.textContent = isEnglish ? "You have reached the stock limit for this variant in the cart." : "Você já atingiu o limite de estoque dessa variação no carrinho.";
        return;
      }
      existing.qty = (Number(existing.qty) || 1) + 1;
    } else {
      cart.push({
        key,
        id: product.id,
        name: product.name,
        priceLabel: product.priceLabel,
        image: colorGalleries[selectedColor]?.[0] || product.image,
        color: selectedColor,
        size: selectedSize,
        maxStock: stock,
        qty: 1
      });
    }

    saveCart(cart);
    syncProductHeaderCartLink();
    if (productCta) productCta.textContent = isEnglish ? "Added to cart" : "Adicionado ao carrinho";
    openCartPopup(key);
  }

  function closePopup() {
    if (!cartPopup) return;
    cartPopup.classList.remove("is-open");
    cartPopup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  function closeDetailsPopup() {
    if (!productDetailsPopup) return;
    productDetailsPopup.classList.remove("is-open");
    productDetailsPopup.setAttribute("aria-hidden", "true");
    document.body.classList.remove("no-scroll");
  }

  function openDetailsPopup() {
    if (!productDetailsPopup) return;
    productDetailsPopup.classList.add("is-open");
    productDetailsPopup.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  function openCartPopup(lastKey) {
    if (!cartPopup) return;
    const cart = readCart();
    if (!cart.length) {
      closePopup();
      return;
    }

    const subtotal = cart.reduce((sum, item) => {
      const qty = Math.max(1, Number(item.qty) || 1);
      return sum + parsePrice(item.priceLabel) * qty;
    }, 0);

    if (cartPopupCount) cartPopupCount.textContent = String(cart.length);
    if (cartPopupSubtotal) cartPopupSubtotal.textContent = formatPrice(subtotal);

    if (cartPopupItems) {
      cartPopupItems.innerHTML = "";

      cart.forEach((item) => {
        const qty = Math.max(1, Number(item.qty) || 1);
        const line = document.createElement("article");
        line.className = "cart-popup-item";
        if (item.key === lastKey) line.classList.add("is-new");
        line.innerHTML = `
          <img class="cart-popup-image" src="${item.image}" alt="${item.name}" />
          <div class="cart-popup-info">
            <h3>${tProductName(item.id, item.name)}</h3>
            <p>${isEnglish ? "Color" : "Cor"}: ${tColor(item.color || "-")}</p>
            <p>${isEnglish ? "Size" : "Tamanho"}: ${tSize(item.size || "-")}</p>
            <p>${isEnglish ? "Qty" : "Qtd"}: ${qty}</p>
            <strong>${item.priceLabel}</strong>
            <button class="cart-popup-remove" type="button" data-remove-key="${item.key}">${isEnglish ? "Remove" : "Excluir"}</button>
          </div>
        `;
        cartPopupItems.appendChild(line);
      });
    }

    cartPopup.classList.add("is-open");
    cartPopup.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
  }

  if (productCollection) productCollection.textContent = String(tCollection(product.collection) || "").toUpperCase();
  if (productName) productName.textContent = tProductName(product);
  if (productPrice) productPrice.textContent = product.priceLabel;
  if (productDescription) {
    productDescription.textContent = isEnglish
      ? "A high-standard piece with refined finishing and elegant presence for daily wear or special occasions."
      : "Peça com construção de alto padrão, acabamento refinado e presença elegante para uso diário ou ocasiões especiais.";
  }
  if (!isSizeAvailable(selectedSize, selectedColor)) {
    selectedSize = getFirstAvailableSizeForColor(selectedColor);
  }

  const details = getProductDetails(product);
  if (productDetailsTitle) productDetailsTitle.textContent = tProductName(product);
  if (productDetailsOrigin) productDetailsOrigin.textContent = details.origin;
  if (productDetailsComposition) productDetailsComposition.textContent = details.composition;
  if (productDetailsConstruction) productDetailsConstruction.textContent = details.construction;
  if (productDetailsCare) productDetailsCare.textContent = details.care;

  syncProductState();
  renderSimilarProducts();

  productCta?.addEventListener("click", addSelectedVariantToCart);
  closeCartPopup?.addEventListener("click", closePopup);
  cartPopupBackdrop?.addEventListener("click", closePopup);
  productSimilarGrid?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const favoriteButton = target.closest(".product-favorite-btn");
    if (!favoriteButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (!userStore) return;
    userStore.toggleFavorite(favoriteButton.dataset.productId || "");
    updateFavoriteButtonUI(favoriteButton);
  });
  cartPopupItems?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-key]");
    if (!removeButton) return;
    const removeKey = removeButton.getAttribute("data-remove-key");
    if (!removeKey) return;

    const updated = readCart().filter((item) => item.key !== removeKey);
    saveCart(updated);
    syncProductHeaderCartLink();

    if (!updated.length) {
      closePopup();
      return;
    }

    openCartPopup(updated[updated.length - 1].key);
  });
  openProductDetailsPopup?.addEventListener("click", (event) => {
    event.preventDefault();
    openDetailsPopup();
  });
  closeProductDetailsPopup?.addEventListener("click", closeDetailsPopup);
  productDetailsPopupBackdrop?.addEventListener("click", closeDetailsPopup);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cartPopup?.classList.contains("is-open")) closePopup();
    if (event.key === "Escape" && productDetailsPopup?.classList.contains("is-open")) closeDetailsPopup();
  });

  if (productView) productView.hidden = false;
}
}

