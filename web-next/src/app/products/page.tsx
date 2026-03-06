import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listProducts } from "@/services/products";
import { ProductGrid } from "@/components/ProductGrid";
import { BodyClassName } from "@/components/BodyClassName";
import { buildHoverImagePair } from "@/lib/product-media";
import type { Product } from "@/types";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import styles from "./page.module.css";
import { NovidadesGrid, type NovidadesGridTile } from "./NovidadesGrid";

export const metadata: Metadata = {
  title: "Produtos",
  description: "Produtos Tsebi.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Produtos | Tsebi Brasil",
    description: "Produtos Tsebi.",
    url: "/products",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Produtos | Tsebi Brasil",
    description: "Produtos Tsebi.",
  },
};

type ProductsSearchParams = {
  view?: string;
  n?: string;
  fp?: string;
  q?: string;
  gender?: string;
  category?: string;
  c?: string;
  collection?: string;
  subcategory?: string;
  color?: string;
  co?: string;
  size?: string;
  sz?: string;
  material?: string;
  mt?: string;
  sort?: string;
  isNew?: string;
  isBestSeller?: string;
  isFeatured?: string;
};

type ExtendedProduct = Product & {
  subcategory?: string;
  collections?: string[];
  tags?: string[];
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
};

type HeroConfig = {
  mediaUrl: string;
  mediaType: "image" | "video";
  rotate180?: boolean;
  objectPosition?: string;
};

type NovidadesTileVariant = "default" | "large";
type NovidadesGridMode = "default" | "category";

type NovidadesTile = NovidadesGridTile & {
  variant: NovidadesTileVariant;
};

type NovidadesFilterGroup = {
  label: string;
  category: string;
  subcategories: string[];
};

type NovidadesSortValue = "" | "best_sellers" | "newest" | "price_asc" | "price_desc";

type NovidadesCategoryHero = {
  mediaUrlMasculino: string;
  mediaUrlFeminino: string;
  objectPosition?: string;
};

const NOVIDADES_PARAM_KEYS = [
  "view",
  "q",
  "gender",
  "category",
  "collection",
  "subcategory",
  "color",
  "size",
  "material",
  "sort",
  "isNew",
  "isBestSeller",
  "isFeatured",
] as const;

const NOVIDADES_FILTERS_MASCULINO: NovidadesFilterGroup[] = [
  {
    label: "Ready-to-Wear",
    category: "Ready-to-Wear",
    subcategories: ["Camisetas", "Camisas", "Calças", "Bermudas"],
  },
  {
    label: "Outerwear",
    category: "Outerwear",
    subcategories: ["Jaquetas", "Casacos"],
  },
  {
    label: "Leather",
    category: "Leather",
    subcategories: ["Jaquetas de couro", "Calças de couro"],
  },
  {
    label: "Accessories",
    category: "Accessories",
    subcategories: ["Cintos", "Bolsas"],
  },
];

const NOVIDADES_FILTERS_FEMININO: NovidadesFilterGroup[] = [
  {
    label: "Ready-to-Wear",
    category: "Ready-to-Wear",
    subcategories: ["Vestidos", "Camisetas", "Camisas", "Calças", "Saias"],
  },
  {
    label: "Outerwear",
    category: "Outerwear",
    subcategories: ["Casacos", "Jaquetas"],
  },
  {
    label: "Leather",
    category: "Leather",
    subcategories: ["Jaquetas de couro", "Calças de couro", "Saias de couro"],
  },
  {
    label: "Accessories",
    category: "Accessories",
    subcategories: ["Cintos", "Bolsas", "Lenços"],
  },
];

const NOVIDADES_SORT_OPTIONS: Array<{ label: string; value: Exclude<NovidadesSortValue, ""> }> = [
  { label: "Mais vendidos", value: "best_sellers" },
  { label: "Mais recentes", value: "newest" },
  { label: "Preço crescente", value: "price_asc" },
  { label: "Preço decrescente", value: "price_desc" },
];

const NOVIDADES_CATEGORY_SLUG_TO_LABEL: Record<string, string> = {
  rtw: "Ready-to-Wear",
  ow: "Outerwear",
  le: "Leather",
  acc: "Accessories",
};

const NOVIDADES_CATEGORY_LABEL_TO_SLUG: Record<string, string> = {
  "ready-to-wear": "rtw",
  outerwear: "ow",
  leather: "le",
  accessories: "acc",
};

const NOVIDADES_CATEGORY_HERO_MAP: Record<string, NovidadesCategoryHero> = {
  "ready-to-wear": {
    mediaUrlMasculino: "/images/product/origem-shirt-1.jpg",
    mediaUrlFeminino: "/images/product/noir-dress-1.jpg",
    objectPosition: "center 30%",
  },
  outerwear: {
    mediaUrlMasculino: "/images/product/marco-trench-1.jpg",
    mediaUrlFeminino: "/images/product/aurora-coat-1.jpg",
    objectPosition: "center 28%",
  },
  leather: {
    mediaUrlMasculino: "/images/product/genesis-bomber-1.jpg",
    mediaUrlFeminino: "/images/product/atelier-bag-1.jpg",
    objectPosition: "center 26%",
  },
  accessories: {
    mediaUrlMasculino: "/images/product/marco-duffle-bag-1.jpg",
    mediaUrlFeminino: "/images/product/genesis-hobo-bag-1.jpg",
    objectPosition: "center 32%",
  },
};

const BROKEN_ENCODING_REPLACEMENTS: Array<[string, string]> = [
  ["Ã¡", "á"],
  ["Ãà", "à"],
  ["Ã¢", "â"],
  ["Ãã", "ã"],
  ["Ãä", "ä"],
  ["Ãé", "é"],
  ["Ãê", "ê"],
  ["Ãí", "í"],
  ["Ãó", "ó"],
  ["Ãô", "ô"],
  ["Ãõ", "õ"],
  ["Ãö", "ö"],
  ["Ãú", "ú"],
  ["Ãü", "ü"],
  ["Ãç", "ç"],
  ["ÃÁ", "Á"],
  ["ÃÀ", "À"],
  ["ÃÂ", "Â"],
  ["ÃÃ", "Ã"],
  ["ÃÉ", "É"],
  ["ÃÊ", "Ê"],
  ["ÃÍ", "Í"],
  ["ÃÓ", "Ó"],
  ["ÃÔ", "Ô"],
  ["ÃÕ", "Õ"],
  ["ÃÚ", "Ú"],
  ["ÃÇ", "Ç"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
];

function sanitizeDisplayText(value: unknown): string {
  let text = String(value || "").trim();
  if (!text) return "";

  BROKEN_ENCODING_REPLACEMENTS.forEach(([broken, fixed]) => {
    text = text.split(broken).join(fixed);
  });

  text = text.replace(/\uFFFD/g, "").trim();
  if (/^[\?\uFFFD]nico$/i.test(text)) return "Único";
  return text;
}

function normalizeText(value: unknown): string {
  return sanitizeDisplayText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function parseBooleanParam(value: string | undefined): boolean | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value);
  if (["1", "true", "yes", "sim"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "não"].includes(normalized)) return false;
  return null;
}

function includesNormalized(haystack: unknown, needle: string): boolean {
  return normalizeText(haystack).includes(needle);
}

function matchesArrayField(values: unknown, needle: string): boolean {
  if (!Array.isArray(values)) return false;
  return values.some((entry) => includesNormalized(entry, needle));
}

function buildPageTitle(params: ProductsSearchParams): string {
  const view = normalizeText(params.view);
  const category = String(params.category || "").trim();
  if (view === "novidades-para-ele") return category ? `Novidades para ele - ${category}` : "Novidades para ele";
  if (view === "novidades-para-ela") return category ? `Novidades para ela - ${category}` : "Novidades para ela";

  const isNew = parseBooleanParam(params.isNew);
  const gender = normalizeText(params.gender);

  if (isNew === true && gender === "masculino") return "Novidades para ele";
  if (isNew === true && gender === "feminino") return "Novidades para ela";
  if (isNew === true) return "Novidades";
  if (gender === "masculino") return "Produtos Masculinos";
  if (gender === "feminino") return "Produtos Femininos";
  return "Produtos";
}

function resolveCommercialView(params: ProductsSearchParams): ProductsSearchParams {
  const shortView = normalizeText(params.n);
  const resolvedView =
    shortView === "e" || shortView === "ele" || shortView === "m" || shortView === "masculino"
      ? "novidades-para-ele"
      : shortView === "a" || shortView === "ela" || shortView === "f" || shortView === "feminino"
        ? "novidades-para-ela"
        : params.view;
  const view = normalizeText(resolvedView);
  const resolvedCategory = resolveNovidadesCategoryParam(params.category ?? params.c);
  const resolvedColor = String(params.color ?? params.co ?? "").trim();
  const resolvedSize = String(params.size ?? params.sz ?? "").trim();
  const resolvedMaterial = String(params.material ?? params.mt ?? "").trim();
  const baseParams = {
    ...params,
    view: resolvedView,
    category: resolvedCategory,
    color: resolvedColor,
    size: resolvedSize,
    material: resolvedMaterial,
  };

  if (view === "novidades-para-ele") {
    return { ...baseParams, isNew: params.isNew ?? "true", gender: params.gender ?? "Masculino" };
  }

  if (view === "novidades-para-ela") {
    return { ...baseParams, isNew: params.isNew ?? "true", gender: params.gender ?? "Feminino" };
  }

  return baseParams;
}

function resolveNovidadesCategoryParam(value: string | undefined): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = normalizeText(raw);
  return NOVIDADES_CATEGORY_SLUG_TO_LABEL[normalized] || raw;
}

function toNovidadesCategorySlug(value: string): string {
  const normalized = normalizeText(value);
  return NOVIDADES_CATEGORY_LABEL_TO_SLUG[normalized] || value;
}

function resolveHeroConfig(params: ProductsSearchParams): HeroConfig | null {
  const view = normalizeText(params.view);
  const normalizedCategory = normalizeText(params.category);
  const normalizedGender = normalizeText(params.gender);
  const categoryHeroEntry =
    normalizedCategory && (NOVIDADES_CATEGORY_HERO_MAP[normalizedCategory] || null);

  if ((view === "novidades-para-ela" || view === "novidades-para-ele") && categoryHeroEntry) {
    return {
      mediaUrl:
        normalizedGender === "masculino" ? categoryHeroEntry.mediaUrlMasculino : categoryHeroEntry.mediaUrlFeminino,
      mediaType: "image",
      objectPosition: categoryHeroEntry.objectPosition ?? "center center",
    };
  }

  if (view === "novidades-para-ela") {
    return {
      mediaUrl: "https://media.tsebi.com.br/generation-8974f666-dacc-437b-a535-77e350085a50.png",
      mediaType: "image",
      objectPosition: "center 22%",
    };
  }

  if (view === "novidades-para-ele") {
    return {
      mediaUrl: "https://media.tsebi.com.br/generation-57e63375-48cf-4bbf-a7b9-22ce3f1b5a6a.png",
      mediaType: "image",
      rotate180: false,
      objectPosition: "center 28%",
    };
  }

  return null;
}

function resolveNovidadesFilterGroups(params: ProductsSearchParams): NovidadesFilterGroup[] {
  const view = normalizeText(params.view);
  if (view === "novidades-para-ele") return NOVIDADES_FILTERS_MASCULINO;
  if (view === "novidades-para-ela") return NOVIDADES_FILTERS_FEMININO;

  const gender = normalizeText(params.gender);
  if (gender === "masculino") return NOVIDADES_FILTERS_MASCULINO;
  if (gender === "feminino") return NOVIDADES_FILTERS_FEMININO;
  return [];
}

function normalizeSortParam(value: string | undefined): NovidadesSortValue {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (normalized === "best_sellers" || normalized === "mais-vendidos" || normalized === "mais vendidos") return "best_sellers";
  if (normalized === "newest" || normalized === "mais-recentes" || normalized === "mais recentes") return "newest";
  if (normalized === "price_asc" || normalized === "preco-crescente" || normalized === "preco crescente") return "price_asc";
  if (normalized === "price_desc" || normalized === "preco-decrescente" || normalized === "preco decrescente") return "price_desc";
  return "";
}

function getSortLabel(sort: NovidadesSortValue): string {
  const option = NOVIDADES_SORT_OPTIONS.find((entry) => entry.value === sort);
  return option ? option.label : "Ordenação";
}

function parseDateValue(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortProducts(products: ExtendedProduct[], sortValue: NovidadesSortValue): ExtendedProduct[] {
  if (!sortValue) return products;

  const sorted = [...products];

  sorted.sort((a, b) => {
    if (sortValue === "best_sellers") {
      const bestSellerDiff = Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
      if (bestSellerDiff !== 0) return bestSellerDiff;
      const newDiff = Number(Boolean(b.isNew)) - Number(Boolean(a.isNew));
      if (newDiff !== 0) return newDiff;
      return parseDateValue(b.updatedAt || b.createdAt) - parseDateValue(a.updatedAt || a.createdAt);
    }

    if (sortValue === "newest") {
      const byDate = parseDateValue(b.updatedAt || b.createdAt) - parseDateValue(a.updatedAt || a.createdAt);
      if (byDate !== 0) return byDate;
      return Number(Boolean(b.isNew)) - Number(Boolean(a.isNew));
    }

    const priceA = Number(a.priceValue || 0);
    const priceB = Number(b.priceValue || 0);

    if (sortValue === "price_asc") return priceA - priceB;
    if (sortValue === "price_desc") return priceB - priceA;

    return 0;
  });

  return sorted;
}

function buildProductsHref(
  params: ProductsSearchParams,
  patch: Partial<Record<(typeof NOVIDADES_PARAM_KEYS)[number], string | null>>
): string {
  const search = new URLSearchParams();
  const nextView = String((patch.view ?? params.view) || "").trim();
  const isNovidadesView = ["novidades-para-ele", "novidades-para-ela"].includes(normalizeText(nextView));
  if (isNovidadesView) {
    search.set("n", normalizeText(nextView) === "novidades-para-ele" ? "e" : "a");
  }

  NOVIDADES_PARAM_KEYS.forEach((key) => {
    if (isNovidadesView && ["view", "gender", "isNew", "isBestSeller", "isFeatured"].includes(key)) return;

    const incoming = patch[key];
    if (incoming === null) return;

    const base = params[key];
    const value = String((incoming ?? base) || "").trim();
    if (!value) return;

    if (isNovidadesView && key === "category") {
      search.set("c", toNovidadesCategorySlug(value));
      return;
    }
    if (isNovidadesView && key === "color") {
      search.set("co", value);
      return;
    }
    if (isNovidadesView && key === "size") {
      search.set("sz", value);
      return;
    }
    if (isNovidadesView && key === "material") {
      search.set("mt", value);
      return;
    }

    search.set(key, value);
  });

  const query = search.toString();
  return query ? `/products?${query}` : "/products";
}

function buildProductsHrefWithOpenFilters(
  params: ProductsSearchParams,
  patch: Partial<Record<(typeof NOVIDADES_PARAM_KEYS)[number], string | null>>
): string {
  const baseHref = buildProductsHref(params, patch);
  const [path, query = ""] = baseHref.split("?");
  const search = new URLSearchParams(query);
  search.set("fp", "1");
  const nextQuery = search.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function parseMultiSelectParam(value: string | undefined): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const seen = new Set<string>();
  const parsed: string[] = [];

  raw.split(",").forEach((entry) => {
    const sanitized = sanitizeDisplayText(entry).trim();
    const normalized = normalizeText(sanitized);
    if (!sanitized || !normalized || seen.has(normalized)) return;
    seen.add(normalized);
    parsed.push(sanitized);
  });

  return parsed;
}

function serializeMultiSelectParam(values: string[]): string | null {
  const parsed = parseMultiSelectParam(values.join(","));
  if (parsed.length === 0) return null;
  return parsed.join(",");
}

function toggleMultiSelectOption(currentValues: string[], option: string): string | null {
  const optionSanitized = sanitizeDisplayText(option).trim();
  const optionNormalized = normalizeText(optionSanitized);
  if (!optionSanitized || !optionNormalized) return serializeMultiSelectParam(currentValues);

  const exists = currentValues.some((entry) => normalizeText(entry) === optionNormalized);
  const nextValues = exists
    ? currentValues.filter((entry) => normalizeText(entry) !== optionNormalized)
    : [...currentValues, optionSanitized];

  return serializeMultiSelectParam(nextValues);
}

function addMultiSelectOption(currentValues: string[], option: string): string | null {
  const optionSanitized = sanitizeDisplayText(option).trim();
  const optionNormalized = normalizeText(optionSanitized);
  if (!optionSanitized || !optionNormalized) return serializeMultiSelectParam(currentValues);

  const exists = currentValues.some((entry) => normalizeText(entry) === optionNormalized);
  const nextValues = exists ? currentValues : [...currentValues, optionSanitized];
  return serializeMultiSelectParam(nextValues);
}

type AvailableFilters = {
  collections: string[];
  colors: string[];
  materials: string[];
  sizes: string[];
};

const COLOR_SWATCH_MAP: Record<string, string> = {
  preto: "#111111",
  branco: "#f5f5f5",
  cinza: "#a8a8a8",
  prata: "#b8bcc3",
  dourado: "#cfa85a",
  bege: "#d2b48c",
  marrom: "#7a4b2a",
  caramelo: "#b56a3b",
  azul: "#1f61d1",
  "azul-claro": "#7cb5e8",
  azulmarinho: "#1b2f5d",
  "azul-marinho": "#1b2f5d",
  vermelho: "#b21c1c",
  vinho: "#722F37",
  bordô: "#6d1f2c",
  bordo: "#6d1f2c",
  rosa: "#e08fb0",
  roxo: "#6c4ec7",
  violeta: "#6d4fd6",
  verde: "#2f8f5a",
  "verde-oliva": "#5c6f3a",
  oliva: "#5c6f3a",
  amarelo: "#f2cd00",
  laranja: "#ea8a2f",
  nude: "#d9b89c",
};

function normalizeOptionValues(values: string[]): string[] {
  const normalizedMap = new Map<string, string>();
  values.forEach((entry) => {
    const raw = sanitizeDisplayText(entry);
    const normalized = normalizeText(raw);
    if (!raw || !normalized || normalizedMap.has(normalized)) return;
    normalizedMap.set(normalized, raw);
  });
  return Array.from(normalizedMap.values());
}

function sortOptionValues(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true }));
}

type OrderedSizeFilters = {
  apparel: string[];
  numeric: string[];
  others: string[];
};

function parseSizeNumericValue(value: string): number | null {
  const normalized = String(value || "")
    .trim()
    .replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderSizeFilters(values: string[]): OrderedSizeFilters {
  const apparelOrder = ["p", "m", "g", "gg"] as const;
  const apparelLabelByKey: Record<(typeof apparelOrder)[number], string> = {
    p: "P",
    m: "M",
    g: "G",
    gg: "GG",
  };
  const apparelSet = new Set<string>();
  const numericEntries: Array<{ label: string; numeric: number }> = [];
  const others: string[] = [];

  values.forEach((entry) => {
    const label = String(entry || "").trim();
    if (!label) return;
    const normalized = normalizeText(label);
    if (apparelOrder.includes(normalized as (typeof apparelOrder)[number])) {
      apparelSet.add(normalized);
      return;
    }
    const numeric = parseSizeNumericValue(label);
    if (numeric !== null) {
      numericEntries.push({ label, numeric });
      return;
    }
    others.push(label);
  });

  const apparel = apparelOrder.filter((key) => apparelSet.has(key)).map((key) => apparelLabelByKey[key]);
  const numeric = [...numericEntries]
    .sort((a, b) => (a.numeric !== b.numeric ? a.numeric - b.numeric : a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })))
    .map((entry) => entry.label);

  return { apparel, numeric, others: sortOptionValues(others) };
}

function getAvailableFilters(products: ExtendedProduct[]): AvailableFilters {
  const collections = normalizeOptionValues(
    products.flatMap((product) => {
      const entries = [sanitizeDisplayText(product.collection)];
      if (Array.isArray(product.collections)) {
        product.collections.forEach((entry) => entries.push(sanitizeDisplayText(entry)));
      }
      return entries;
    })
  );
  const colors = normalizeOptionValues(
    products.flatMap((product) => (Array.isArray(product.colors) ? product.colors.map((item) => sanitizeDisplayText(item)) : []))
  );
  const materials = normalizeOptionValues(products.map((product) => sanitizeDisplayText(product.material)));
  const sizes = normalizeOptionValues(
    products.flatMap((product) => (Array.isArray(product.sizes) ? product.sizes.map((item) => sanitizeDisplayText(item)) : []))
  );
  return {
    collections: sortOptionValues(collections),
    colors: sortOptionValues(colors),
    materials: sortOptionValues(materials),
    sizes: sortOptionValues(sizes),
  };
}

function resolveColorSwatch(colorName: string): string {
  const normalized = normalizeText(colorName).replace(/\s+/g, "-");
  return COLOR_SWATCH_MAP[normalized] || "#d9d9d9";
}

function buildNovidadesTiles(products: ExtendedProduct[], mode: NovidadesGridMode = "default"): NovidadesTile[] {
  const tiles: NovidadesTile[] = [];
  let cursor = 0;

  function toTile(product: ExtendedProduct, variant: NovidadesTileVariant, index: number): NovidadesTile {
    const id = String(product.id || product.sku || "").trim();
    const imageRaw = String(product.image || "").trim();
    const normalizedImage =
      imageRaw && /^https?:\/\//i.test(imageRaw)
        ? imageRaw
        : imageRaw.startsWith("/")
          ? imageRaw
          : imageRaw
            ? `/${imageRaw.replace(/^\.?\//, "")}`
            : "/images/placeholderreal.webp";
    const pair = buildHoverImagePair({
      id: id || String(index),
      image: normalizedImage,
      secondaryImage: String(product.secondaryImage || "").trim(),
    });
    const baseId = id || String(index);
    return {
      key: `${baseId}-${variant}-${index}`,
      id: id || baseId,
      name: sanitizeDisplayText(product.name || "Produto Tsebi"),
      image: pair.primary,
      secondaryImage: pair.secondary,
      priceLabel: sanitizeDisplayText(product.priceLabel || ""),
      category: sanitizeDisplayText(product.category || ""),
      priceValue: Number(product.priceValue || 0),
      currency: String(product.currency || "brl"),
      href: `/product/${encodeURIComponent(id || baseId)}`,
      variant,
    };
  }

  if (mode === "category") {
    while (cursor < products.length) {
      // Primeira linha já abre com card grande e depois repete após cada 3 linhas de cards normais.
      tiles.push(toTile(products[cursor], "large", cursor));
      cursor += 1;

      const rightColumnCount = Math.min(4, products.length - cursor);
      for (let i = 0; i < rightColumnCount; i += 1) {
        const productIndex = cursor + i;
        tiles.push(toTile(products[productIndex], "default", productIndex));
      }
      cursor += rightColumnCount;

      if (cursor >= products.length) break;

      const fullRowsCount = Math.min(12, products.length - cursor);
      for (let i = 0; i < fullRowsCount; i += 1) {
        const productIndex = cursor + i;
        tiles.push(toTile(products[productIndex], "default", productIndex));
      }
      cursor += fullRowsCount;
    }

    return tiles;
  }

  while (cursor < products.length) {
    const remaining = products.length - cursor;

    if (remaining <= 8) {
      for (let i = cursor; i < products.length; i += 1) {
        tiles.push(toTile(products[i], "default", i));
      }
      break;
    }

    for (let i = 0; i < 8; i += 1) {
      const productIndex = cursor + i;
      tiles.push(toTile(products[productIndex], "default", productIndex));
    }
    cursor += 8;

    if (cursor >= products.length) break;

    tiles.push(toTile(products[cursor], "large", cursor));
    cursor += 1;

    const rightColumnCount = Math.min(4, products.length - cursor);
    for (let i = 0; i < rightColumnCount; i += 1) {
      const productIndex = cursor + i;
      tiles.push(toTile(products[productIndex], "default", productIndex));
    }
    cursor += rightColumnCount;
  }

  return tiles;
}

function filterProducts(
  products: ExtendedProduct[],
  params: ProductsSearchParams,
  options: { ignoreAttributeFilters?: boolean } = {}
): ExtendedProduct[] {
  const query = normalizeText(params.q);
  const gender = normalizeText(params.gender);
  const category = normalizeText(params.category);
  const collections = parseMultiSelectParam(params.collection).map((value) => normalizeText(value));
  const subcategory = normalizeText(params.subcategory);
  const colors = parseMultiSelectParam(params.color).map((value) => normalizeText(value));
  const sizes = parseMultiSelectParam(params.size).map((value) => normalizeText(value));
  const materials = parseMultiSelectParam(params.material).map((value) => normalizeText(value));
  const isNew = parseBooleanParam(params.isNew);
  const isBestSeller = parseBooleanParam(params.isBestSeller);
  const isFeatured = parseBooleanParam(params.isFeatured);
  const ignoreAttributeFilters = Boolean(options.ignoreAttributeFilters);

  return products.filter((product) => {
    if (gender && normalizeText(product.gender) !== gender) return false;
    if (category && normalizeText(product.category) !== category) return false;

    if (collections.length > 0) {
      const hasCollectionMatch = collections.some((collection) => {
        const matchesPrimary = normalizeText(product.collection) === collection;
        const matchesList = matchesArrayField(product.collections, collection);
        return matchesPrimary || matchesList;
      });
      if (!hasCollectionMatch) return false;
    }

    if (subcategory && normalizeText(product.subcategory) !== subcategory) return false;

    if (!ignoreAttributeFilters && colors.length > 0) {
      const hasColorMatch = colors.some((color) => matchesArrayField(product.colors, color));
      if (!hasColorMatch) return false;
    }

    if (!ignoreAttributeFilters && sizes.length > 0) {
      const hasSizeMatch = sizes.some((size) => matchesArrayField(product.sizes, size));
      if (!hasSizeMatch) return false;
    }

    if (!ignoreAttributeFilters && materials.length > 0) {
      const hasMaterialMatch = materials.some((material) => normalizeText(product.material) === material);
      if (!hasMaterialMatch) return false;
    }

    if (isNew !== null && Boolean(product.isNew) !== isNew) return false;
    if (isBestSeller !== null && Boolean(product.isBestSeller) !== isBestSeller) return false;
    if (isFeatured !== null && Boolean(product.isFeatured) !== isFeatured) return false;

    if (!query) return true;

    const searchable = [
      product.name,
      product.category,
      product.collection,
      product.material,
      product.sku,
      product.subcategory,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.collections) ? product.collections : []),
    ];

    return searchable.some((entry) => includesNormalized(entry, query));
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const rawParams = await searchParams;
  const params = resolveCommercialView(rawParams);
  const normalizedView = normalizeText(params.view);
  const isNovidadesView = normalizedView === "novidades-para-ele" || normalizedView === "novidades-para-ela";
  const hasLegacyLongParams =
    isNovidadesView &&
    Boolean(
      rawParams.view ||
        rawParams.gender ||
        rawParams.isNew ||
        rawParams.category ||
        rawParams.color ||
        rawParams.size ||
        rawParams.material
    );
  if (hasLegacyLongParams) {
    redirect(buildProductsHref(params, {}));
  }
  const products = (await listProducts()) as ExtendedProduct[];
  const filteredForFacets = filterProducts(products, params, { ignoreAttributeFilters: true });
  const filtered = filterProducts(products, params);
  const availableFilters = getAvailableFilters(filteredForFacets);
  const sortValue = normalizeSortParam(params.sort);
  const sorted = sortProducts(filtered, sortValue);
  const title = buildPageTitle(params);
  const heroConfig = resolveHeroConfig(params);
  const novidadesFilterGroups = resolveNovidadesFilterGroups(params);
  const activeCategory = normalizeText(params.category);
  const activeSubcategory = normalizeText(params.subcategory);
  const activeCollections = parseMultiSelectParam(params.collection);
  const activeColors = parseMultiSelectParam(params.color);
  const activeMaterials = parseMultiSelectParam(params.material);
  const activeSizes = parseMultiSelectParam(params.size);
  const activeCollectionsSet = new Set(activeCollections.map((value) => normalizeText(value)));
  const activeColorsSet = new Set(activeColors.map((value) => normalizeText(value)));
  const activeMaterialsSet = new Set(activeMaterials.map((value) => normalizeText(value)));
  const activeSizesSet = new Set(activeSizes.map((value) => normalizeText(value)));
  const selectedFiltersCount =
    activeCollections.length + activeColors.length + activeMaterials.length + activeSizes.length;
  const shouldKeepFiltersOpen = String(params.fp || "").trim() === "1";
  const visibleColors = availableFilters.colors.slice(0, 4);
  const hiddenColors = availableFilters.colors.slice(4);
  const visibleMaterials = availableFilters.materials.slice(0, 4);
  const hiddenMaterials = availableFilters.materials.slice(4);
  const orderedSizes = orderSizeFilters(availableFilters.sizes);
  const sizeSequence = [...orderedSizes.apparel, ...orderedSizes.numeric, ...orderedSizes.others];
  const hasSizeSeparator = orderedSizes.apparel.length > 0 && orderedSizes.numeric.length > 0;
  const collectionAvailability = new Map(
    availableFilters.collections.map((option) => {
      const nextCollection = addMultiSelectOption(activeCollections, option) ?? "";
      const hasMatch = filterProducts(products, { ...params, collection: nextCollection }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const colorAvailability = new Map(
    availableFilters.colors.map((option) => {
      const nextColor = addMultiSelectOption(activeColors, option) ?? "";
      const hasMatch = filterProducts(products, { ...params, color: nextColor }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const materialAvailability = new Map(
    availableFilters.materials.map((option) => {
      const nextMaterial = addMultiSelectOption(activeMaterials, option) ?? "";
      const hasMatch = filterProducts(products, { ...params, material: nextMaterial }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const sizeAvailability = new Map(
    sizeSequence.map((option) => {
      const nextSize = addMultiSelectOption(activeSizes, option) ?? "";
      const hasMatch = filterProducts(products, { ...params, size: nextSize }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const activeFilterGroup =
    novidadesFilterGroups.find((group) => normalizeText(group.category) === activeCategory) ?? null;
  const novidadesTiles = buildNovidadesTiles(sorted, activeFilterGroup ? "category" : "default");
  const activeSortLabel = getSortLabel(sortValue);
  const novidadesBackLabel = "< Voltar";
  const renderSelectedMark = () => (
    <span className={styles.novidadesFiltersSelectedMark} aria-hidden="true">
      <img src="/images/logo-tsebi.png" alt="" className={styles.novidadesFiltersSelectedLogo} />
      <svg viewBox="0 0 12 12" className={styles.novidadesFiltersSelectedTick}>
        <path d="M2.2 6.2 4.8 8.8 9.8 3.8" />
      </svg>
    </span>
  );

  if (heroConfig) {
    const headerStackHeight = "calc(var(--top-bar-height, 38px) + var(--header-height, 84px))";
    const hasNovidadesToolbar = novidadesFilterGroups.length > 0;
    const toolbarHeight = hasNovidadesToolbar
      ? activeFilterGroup
        ? "var(--novidades-toolbar-height-expanded, 64px)"
        : "var(--novidades-toolbar-height, 40px)"
      : "0px";
    const toolbarAttachOffset = hasNovidadesToolbar ? "var(--novidades-toolbar-attach-offset, 10px)" : "0px";
    const attachedHeaderHeight = `calc(${headerStackHeight} - ${toolbarAttachOffset})`;
    const heroOffset = `calc(${attachedHeaderHeight} + ${toolbarHeight})`;
    const viewportHeight = `calc(100dvh - ${attachedHeaderHeight} - ${toolbarHeight})`;

    return (
      <main>
        <BodyClassName className="products-novidades-view" />

        {hasNovidadesToolbar ? (
          <section
            className={`${styles.novidadesToolbarSection} ${activeFilterGroup ? styles.novidadesToolbarSectionExpanded : ""}`}
            aria-label="Filtros de novidades"
          >
            <div className={styles.novidadesToolbarInner}>
              <div className={styles.novidadesFiltersLeft}>
                {activeFilterGroup ? (
                  <div className={styles.novidadesCategoriesRow}>
                    <a
                      href={buildProductsHref(params, {
                        category: activeFilterGroup.category,
                        subcategory: null,
                      })}
                      className={`${styles.novidadesMainCategoryLink} ${styles.novidadesMainCategoryLinkActive}`}
                    >
                      {activeFilterGroup.label}
                    </a>
                  </div>
                ) : (
                  <div className={styles.novidadesCategoriesRow}>
                    <a
                      href={buildProductsHref(params, { category: null, subcategory: null })}
                      className={`${styles.novidadesMainCategoryLink} ${!activeCategory ? styles.novidadesMainCategoryLinkActive : ""}`}
                    >
                      Todos
                    </a>
                    {novidadesFilterGroups.map((group) => {
                      const groupIsActive = normalizeText(group.category) === activeCategory;
                      return (
                        <a
                          key={group.label}
                          href={buildProductsHref(params, {
                            category: group.category,
                            subcategory: null,
                          })}
                          className={`${styles.novidadesMainCategoryLink} ${groupIsActive ? styles.novidadesMainCategoryLinkActive : ""}`}
                        >
                          {group.label}
                        </a>
                      );
                    })}
                  </div>
                )}

                {activeFilterGroup ? (
                  <div className={styles.novidadesSubcategoriesRow}>
                    <a
                      href={buildProductsHref(params, {
                        category: null,
                        subcategory: null,
                      })}
                      className={styles.novidadesBackButton}
                    >
                      {novidadesBackLabel}
                    </a>
                    <span className={styles.novidadesSubDivider} aria-hidden="true">
                      |
                    </span>
                    <a
                      href={buildProductsHref(params, {
                        category: activeFilterGroup.category,
                        subcategory: null,
                      })}
                      className={`${styles.novidadesFlatLink} ${!activeSubcategory ? styles.novidadesFlatLinkActive : ""}`}
                    >
                      Geral
                    </a>
                    {activeFilterGroup.subcategories.map((subcategory) => {
                      const isActive = normalizeText(subcategory) === activeSubcategory;
                      return (
                        <a
                          key={subcategory}
                          href={buildProductsHref(params, {
                            category: activeFilterGroup.category,
                            subcategory,
                          })}
                          className={`${styles.novidadesFlatLink} ${isActive ? styles.novidadesFlatLinkActive : ""}`}
                        >
                          {subcategory}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className={styles.novidadesActionsRight}>
                <details className={styles.novidadesSortGroup}>
                  <summary className={styles.novidadesSortToggle}>
                    <span>{activeSortLabel}</span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesSortActionIcon}>
                      <path d="M8 6h8" />
                      <path d="M10 3l-2 3 2 3" />
                      <path d="M16 18H8" />
                      <path d="M14 15l2 3-2 3" />
                    </svg>
                  </summary>
                  <div className={styles.novidadesSortMenu}>
                    <a
                      href={buildProductsHref(params, { sort: null })}
                      className={`${styles.novidadesFilterItem} ${!sortValue ? styles.novidadesFilterItemActive : ""}`}
                    >
                      Ordenação
                    </a>
                    {NOVIDADES_SORT_OPTIONS.map((option) => {
                      const isActive = option.value === sortValue;
                      return (
                        <a
                          key={option.value}
                          href={buildProductsHref(params, { sort: option.value })}
                          className={`${styles.novidadesFilterItem} ${isActive ? styles.novidadesFilterItemActive : ""}`}
                        >
                          {option.label}
                        </a>
                      );
                    })}
                  </div>
                </details>

                <div className={styles.novidadesFiltersPopupGroup}>
                  <input
                    id="novidades-filtros-toggle"
                    type="checkbox"
                    className={styles.novidadesFiltersPopupCheckbox}
                    defaultChecked={shouldKeepFiltersOpen}
                    aria-label="Abrir filtros"
                  />
                  <label
                    htmlFor="novidades-filtros-toggle"
                    className={`${styles.novidadesActionButton} ${styles.novidadesFiltersPopupToggle}`}
                  >
                    <span className={styles.novidadesFiltersLabel}>
                      Filtros
                      {selectedFiltersCount > 0 ? <sup className={styles.novidadesFiltersSelectedCount}>{selectedFiltersCount}</sup> : null}
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesFilterActionIcon}>
                      <path d="M4 7h16" />
                      <circle cx="9" cy="7" r="1.8" />
                      <path d="M4 12h16" />
                      <circle cx="15" cy="12" r="1.8" />
                      <path d="M4 17h16" />
                      <circle cx="11.5" cy="17" r="1.8" />
                    </svg>
                  </label>
                  <div className={styles.novidadesFiltersPopupPanel} role="dialog" aria-label="Filtros">
                    <a
                      href={buildProductsHrefWithOpenFilters(params, {
                        collection: null,
                        color: null,
                        size: null,
                        material: null,
                      })}
                      className={styles.novidadesFiltersClear}
                    >
                      Limpar filtros
                    </a>
                    <label
                      htmlFor="novidades-filtros-toggle"
                      className={styles.novidadesFiltersPopupClose}
                      aria-label="Fechar filtros"
                    >
                      X
                    </label>
                    <div className={styles.novidadesFiltersPopupBody}>
                      <section className={styles.novidadesFiltersSection}>
                        <h3 className={styles.novidadesFiltersSectionTitle}>Coleção</h3>
                        {availableFilters.collections.length > 0 ? (
                          <div className={styles.novidadesFiltersTwoColumns}>
                            {availableFilters.collections.map((collectionOption) => {
                              const isActive = activeCollectionsSet.has(normalizeText(collectionOption));
                              const isUnavailable = !isActive && !collectionAvailability.get(normalizeText(collectionOption));
                              const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                              if (isUnavailable) {
                                return (
                                  <span key={collectionOption} className={optionClassName} aria-disabled="true">
                                    <span className={styles.novidadesFiltersOptionLabel}>{collectionOption}</span>
                                  </span>
                                );
                              }
                              return (
                                <a
                                  key={collectionOption}
                                  href={buildProductsHrefWithOpenFilters(params, {
                                    collection: toggleMultiSelectOption(activeCollections, collectionOption),
                                  })}
                                  className={optionClassName}
                                >
                                  <span className={styles.novidadesFiltersOptionLabel}>{collectionOption}</span>
                                  {isActive ? renderSelectedMark() : null}
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <p className={styles.novidadesFiltersEmpty}>Sem coleções disponíveis.</p>
                        )}
                      </section>

                      <section className={styles.novidadesFiltersSection}>
                        <h3 className={styles.novidadesFiltersSectionTitle}>Cor</h3>
                        {availableFilters.colors.length > 0 ? (
                          <div className={styles.novidadesFiltersExpandableBlock}>
                            <div className={styles.novidadesFiltersTwoColumns}>
                              {visibleColors.map((colorOption) => {
                                const isActive = activeColorsSet.has(normalizeText(colorOption));
                                const isUnavailable = !isActive && !colorAvailability.get(normalizeText(colorOption));
                                const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                                if (isUnavailable) {
                                  return (
                                    <span key={colorOption} className={optionClassName} aria-disabled="true">
                                      <span
                                        className={styles.novidadesFiltersColorDot}
                                        aria-hidden="true"
                                        style={{ backgroundColor: resolveColorSwatch(colorOption) }}
                                      />
                                      <span className={styles.novidadesFiltersOptionLabel}>{colorOption}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <a
                                    key={colorOption}
                                    href={buildProductsHrefWithOpenFilters(params, {
                                      color: toggleMultiSelectOption(activeColors, colorOption),
                                    })}
                                    className={optionClassName}
                                  >
                                    <span
                                      className={styles.novidadesFiltersColorDot}
                                      aria-hidden="true"
                                      style={{ backgroundColor: resolveColorSwatch(colorOption) }}
                                    />
                                    <span className={styles.novidadesFiltersOptionLabel}>{colorOption}</span>
                                    {isActive ? renderSelectedMark() : null}
                                  </a>
                                );
                              })}
                            </div>
                            {hiddenColors.length > 0 ? (
                              <details className={styles.novidadesFiltersMoreGroup}>
                                <summary className={styles.novidadesFiltersMoreToggle}>
                                  <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                                  <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                                </summary>
                                <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                                  {hiddenColors.map((colorOption) => {
                                    const isActive = activeColorsSet.has(normalizeText(colorOption));
                                    const isUnavailable = !isActive && !colorAvailability.get(normalizeText(colorOption));
                                    const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                                    if (isUnavailable) {
                                      return (
                                        <span key={colorOption} className={optionClassName} aria-disabled="true">
                                          <span
                                            className={styles.novidadesFiltersColorDot}
                                            aria-hidden="true"
                                            style={{ backgroundColor: resolveColorSwatch(colorOption) }}
                                          />
                                          <span className={styles.novidadesFiltersOptionLabel}>{colorOption}</span>
                                        </span>
                                      );
                                    }
                                    return (
                                      <a
                                        key={colorOption}
                                        href={buildProductsHrefWithOpenFilters(params, {
                                          color: toggleMultiSelectOption(activeColors, colorOption),
                                        })}
                                        className={optionClassName}
                                      >
                                        <span
                                          className={styles.novidadesFiltersColorDot}
                                          aria-hidden="true"
                                          style={{ backgroundColor: resolveColorSwatch(colorOption) }}
                                        />
                                        <span className={styles.novidadesFiltersOptionLabel}>{colorOption}</span>
                                        {isActive ? renderSelectedMark() : null}
                                      </a>
                                    );
                                  })}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : (
                          <p className={styles.novidadesFiltersEmpty}>Sem cores disponíveis.</p>
                        )}
                      </section>

                      <section className={styles.novidadesFiltersSection}>
                        <h3 className={styles.novidadesFiltersSectionTitle}>Material</h3>
                        {availableFilters.materials.length > 0 ? (
                          <div className={styles.novidadesFiltersExpandableBlock}>
                            <div className={styles.novidadesFiltersTwoColumns}>
                              {visibleMaterials.map((materialOption) => {
                                const isActive = activeMaterialsSet.has(normalizeText(materialOption));
                                const isUnavailable = !isActive && !materialAvailability.get(normalizeText(materialOption));
                                const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                                if (isUnavailable) {
                                  return (
                                    <span key={materialOption} className={optionClassName} aria-disabled="true">
                                      <span className={styles.novidadesFiltersOptionLabel}>{materialOption}</span>
                                    </span>
                                  );
                                }
                                return (
                                  <a
                                    key={materialOption}
                                    href={buildProductsHrefWithOpenFilters(params, {
                                      material: toggleMultiSelectOption(activeMaterials, materialOption),
                                    })}
                                    className={optionClassName}
                                  >
                                    <span className={styles.novidadesFiltersOptionLabel}>{materialOption}</span>
                                    {isActive ? renderSelectedMark() : null}
                                  </a>
                                );
                              })}
                            </div>
                            {hiddenMaterials.length > 0 ? (
                              <details className={styles.novidadesFiltersMoreGroup}>
                                <summary className={styles.novidadesFiltersMoreToggle}>
                                  <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                                  <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                                </summary>
                                <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                                  {hiddenMaterials.map((materialOption) => {
                                    const isActive = activeMaterialsSet.has(normalizeText(materialOption));
                                    const isUnavailable = !isActive && !materialAvailability.get(normalizeText(materialOption));
                                    const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                                    if (isUnavailable) {
                                      return (
                                        <span key={materialOption} className={optionClassName} aria-disabled="true">
                                          <span className={styles.novidadesFiltersOptionLabel}>{materialOption}</span>
                                        </span>
                                      );
                                    }
                                    return (
                                      <a
                                        key={materialOption}
                                        href={buildProductsHrefWithOpenFilters(params, {
                                          material: toggleMultiSelectOption(activeMaterials, materialOption),
                                        })}
                                        className={optionClassName}
                                      >
                                        <span className={styles.novidadesFiltersOptionLabel}>{materialOption}</span>
                                        {isActive ? renderSelectedMark() : null}
                                      </a>
                                    );
                                  })}
                                </div>
                              </details>
                            ) : null}
                          </div>
                        ) : (
                          <p className={styles.novidadesFiltersEmpty}>Sem materiais disponíveis.</p>
                        )}
                      </section>

                      <section className={styles.novidadesFiltersSection}>
                        <h3 className={styles.novidadesFiltersSectionTitle}>Tamanho</h3>
                        {sizeSequence.length > 0 ? (
                          <div className={styles.novidadesFiltersSizesWrap}>
                            {orderedSizes.apparel.map((sizeOption) => {
                              const isActive = activeSizesSet.has(normalizeText(sizeOption));
                              const isUnavailable = !isActive && !sizeAvailability.get(normalizeText(sizeOption));
                              const optionClassName = `${styles.novidadesFiltersSizeChip} ${isActive ? styles.novidadesFiltersSizeChipActive : ""} ${isUnavailable ? styles.novidadesFiltersSizeChipUnavailable : ""}`;
                              if (isUnavailable) {
                                return (
                                  <span key={sizeOption} className={optionClassName} aria-disabled="true">
                                    {sizeOption}
                                  </span>
                                );
                              }
                              return (
                                <a
                                  key={sizeOption}
                                  href={buildProductsHrefWithOpenFilters(params, {
                                    size: toggleMultiSelectOption(activeSizes, sizeOption),
                                  })}
                                  className={optionClassName}
                                >
                                  {sizeOption}
                                  {isActive ? renderSelectedMark() : null}
                                </a>
                              );
                            })}
                            {hasSizeSeparator ? <span className={styles.novidadesFiltersSizeDivider}>|</span> : null}
                            {[...orderedSizes.numeric, ...orderedSizes.others].map((sizeOption) => {
                              const isActive = activeSizesSet.has(normalizeText(sizeOption));
                              const isUnavailable = !isActive && !sizeAvailability.get(normalizeText(sizeOption));
                              const optionClassName = `${styles.novidadesFiltersSizeChip} ${isActive ? styles.novidadesFiltersSizeChipActive : ""} ${isUnavailable ? styles.novidadesFiltersSizeChipUnavailable : ""}`;
                              if (isUnavailable) {
                                return (
                                  <span key={sizeOption} className={optionClassName} aria-disabled="true">
                                    {sizeOption}
                                  </span>
                                );
                              }
                              return (
                                <a
                                  key={sizeOption}
                                  href={buildProductsHrefWithOpenFilters(params, {
                                    size: toggleMultiSelectOption(activeSizes, sizeOption),
                                  })}
                                  className={optionClassName}
                                >
                                  {sizeOption}
                                  {isActive ? renderSelectedMark() : null}
                                </a>
                              );
                            })}
                          </div>
                        ) : (
                          <p className={styles.novidadesFiltersEmpty}>Sem tamanhos disponíveis.</p>
                        )}
                      </section>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section
          aria-label={title}
          style={{
            position: "relative",
            width: "100vw",
            height: viewportHeight,
            minHeight: viewportHeight,
            marginLeft: "calc(50% - 50vw)",
            marginTop: heroOffset,
            overflow: "hidden",
          }}
        >
          {heroConfig.mediaType === "video" ? (
            <video
              autoPlay
              loop
              muted
              playsInline
              src={heroConfig.mediaUrl}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: heroConfig.objectPosition ?? "center center",
                transform: heroConfig.rotate180 ? "rotate(180deg)" : "none",
                transformOrigin: "center center",
              }}
            />
          ) : (
            <img
              src={heroConfig.mediaUrl}
              alt={title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: heroConfig.objectPosition ?? "center center",
                transform: heroConfig.rotate180 ? "rotate(180deg)" : "none",
                transformOrigin: "center center",
              }}
            />
          )}
        </section>

        <section
          aria-label={`Produtos da seção ${title}`}
          className={styles.novidadesSection}
        >
          <NovidadesGrid tiles={novidadesTiles} />
        </section>

        <LegacyFooter variant="light" />
      </main>
    );
  }

  return (
    <main>
      <section className="tsebi-category-section" aria-label="catalogo de produtos">
        <div className="tsebi-container">
          <ProductGrid
            products={sorted}
            title={title}
            description={`${sorted.length} produto(s)`}
            emptyMessage="Nenhum produto encontrado para os filtros selecionados."
          />
        </div>
      </section>
    </main>
  );
}
