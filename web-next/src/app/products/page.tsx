import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { listProducts } from "@/services/products";
import { ProductGrid } from "@/components/ProductGrid";
import { BodyClassName } from "@/components/BodyClassName";
import { Price } from "@/components/Price";
import { buildHoverImagePair, collectProductMedia } from "@/lib/product-media";
import type { Product } from "@/types";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import { ExclusiveSuggestions, type ExclusiveSuggestionFallbackCard } from "./ExclusiveSuggestions";
import { ProductsSearchGrid, type ProductsSearchGridItem } from "./ProductsSearchGrid";
import styles from "./page.module.css";
import { NovidadesGrid, type NovidadesGridTile } from "./NovidadesGrid";
import { ProductsToolbarSearch } from "./ProductsToolbarSearch";
import { ProductsMobileFilterPanel } from "./ProductsMobileFilterPanel";
import { ProductsMobileSortPanel } from "./ProductsMobileSortPanel";

export const revalidate = 3600;

const PRODUCTS_DESCRIPTION =
  "Explore as coleções exclusivas da Tsebi Brasil — moda de luxo contemporâneo com alfaiataria artesanal, tecidos premium e design autoral. Compre online com entrega para todo o Brasil.";

export const metadata: Metadata = {
  title: "Produtos",
  description: PRODUCTS_DESCRIPTION,
  keywords: [
    "roupas de luxo",
    "moda feminina premium",
    "moda masculina premium",
    "alfaiataria brasileira",
    "coleção exclusiva",
    "roupas de qualidade",
    "moda autoral",
    "comprar roupas online",
    "tsebi produtos",
  ],
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Produtos | Tsebi Brasil",
    description: PRODUCTS_DESCRIPTION,
    url: "/products",
    type: "website",
    images: [{ url: "/images/Gazelalogo.png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Produtos | Tsebi Brasil",
    description: PRODUCTS_DESCRIPTION,
    images: ["/images/Gazelalogo.png"],
  },
};

type ProductsSearchParams = {
  view?: string;
  n?: string;
  p?: string;
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

const ACCESSORIES_TAB_SUBCATEGORIES = ["Bolsas", "Carteiras", "Cintos", "Lenços"];

const ACCESSORIES_CATEGORY_ALIASES: Record<string, string> = {
  accessories: "Accessories",
  acessorios: "Accessories",
  "bolsas-e-acessorios": "Accessories",
};

const ACCESSORIES_SUBCATEGORY_ALIASES: Record<string, string> = {
  bolsa: "Bolsas",
  bolsas: "Bolsas",
  carteira: "Carteiras",
  carteiras: "Carteiras",
  cinto: "Cintos",
  cintos: "Cintos",
  lenco: "Lencos",
  lencos: "Lencos",
  "len\u00e7o": "Lencos",
  "len\u00e7os": "Lencos",
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

const BROKEN_ENCODING_REPLACEMENTS: Array<[string, string]> = [];

const QUESTION_MARK_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\?nico/gi, "Único"],
  [/Cardig\?/gi, "Cardigã"],
  [/t\?cnico/gi, "técnico"],
  [/\bL\?\b/g, "Lã"],
  [/\bl\?\b/g, "lã"],
  [/Pre\?o/gi, "Preço"],
  [/Cole\?ao/gi, "Coleção"],
  [/Se\?ao/gi, "Seção"],
];

const ROOT_PRODUCTS_MAIN_CATEGORY_LINKS = [
  { href: "/products?n=e", label: "Todos", active: true },
  { href: "/products?n=e&c=rtw", label: "Ready-to-Wear", active: false },
  { href: "/products?n=e&c=ow", label: "Outerwear", active: false },
  { href: "/products?n=e&c=le", label: "Leather", active: false },
  { href: "/products?n=e&c=acc", label: "Accessories", active: false },
] as const;

const ROOT_PRODUCTS_SORT_LINKS = [
  { href: "/products?n=e", label: "Ordenação", active: true },
  { href: "/products?n=e&sort=best_sellers", label: "Mais vendidos", active: false },
  { href: "/products?n=e&sort=newest", label: "Mais recentes", active: false },
  { href: "/products?n=e&sort=price_asc", label: "Preço crescente", active: false },
  { href: "/products?n=e&sort=price_desc", label: "Preço decrescente", active: false },
] as const;

const ROOT_PRODUCTS_COLLECTION_LINKS = [
  { href: "/products?n=e&collection=Alicerce&fp=1", label: "Alicerce" },
  { href: "/products?n=e&collection=G%C3%AAnesis&fp=1", label: "Gênesis" },
] as const;

const ROOT_PRODUCTS_COLOR_OPTIONS_VISIBLE = [
  { href: "/products?n=e&co=Areia&fp=1", label: "Areia", color: "#d9d9d9" },
  { href: "/products?n=e&co=Azul&fp=1", label: "Azul", color: "#1f61d1" },
  { href: "/products?n=e&co=Bege&fp=1", label: "Bege", color: "#d2b48c" },
  { href: "/products?n=e&co=Branco&fp=1", label: "Branco", color: "#f5f5f5" },
] as const;

const ROOT_PRODUCTS_COLOR_OPTIONS_HIDDEN = [
  { href: "/products?n=e&co=Cafe&fp=1", label: "Cafe", color: "#d9d9d9" },
  { href: "/products?n=e&co=Caramelo&fp=1", label: "Caramelo", color: "#b56a3b" },
  { href: "/products?n=e&co=Cinza&fp=1", label: "Cinza", color: "#a8a8a8" },
  { href: "/products?n=e&co=Grafite&fp=1", label: "Grafite", color: "#d9d9d9" },
  { href: "/products?n=e&co=Marrom&fp=1", label: "Marrom", color: "#7a4b2a" },
  { href: "/products?n=e&co=Off+white&fp=1", label: "Off white", color: "#d9d9d9" },
  { href: "/products?n=e&co=Oliva&fp=1", label: "Oliva", color: "#5c6f3a" },
  { href: "/products?n=e&co=Preto&fp=1", label: "Preto", color: "#111111" },
  { href: "/products?n=e&co=Vinho&fp=1", label: "Vinho", color: "#722F37" },
] as const;

const ROOT_PRODUCTS_MATERIAL_OPTIONS_VISIBLE = [
  { href: "/products?n=e&mt=Algodao&fp=1", label: "Algodao" },
  { href: "/products?n=e&mt=Algod%C3%A3o+eg%C3%ADpcio&fp=1", label: "Algodão egípcio" },
  { href: "/products?n=e&mt=Couro&fp=1", label: "Couro" },
  { href: "/products?n=e&mt=Couro+envernizado&fp=1", label: "Couro envernizado" },
] as const;

const ROOT_PRODUCTS_MATERIAL_OPTIONS_HIDDEN = [
  { href: "/products?n=e&mt=Couro+natural&fp=1", label: "Couro natural" },
  { href: "/products?n=e&mt=Denim&fp=1", label: "Denim" },
  { href: "/products?n=e&mt=Gabardine&fp=1", label: "Gabardine" },
  { href: "/products?n=e&mt=La+merino&fp=1", label: "La merino" },
  { href: "/products?n=e&mt=Linho&fp=1", label: "Linho" },
  { href: "/products?n=e&mt=Nylon&fp=1", label: "Nylon" },
  { href: "/products?n=e&mt=Nylon+t%C3%A9cnico&fp=1", label: "Nylon técnico" },
  { href: "/products?n=e&mt=Sarja&fp=1", label: "Sarja" },
] as const;

const ROOT_PRODUCTS_SIZE_OPTIONS_APPAREL = ["P", "M", "G", "GG"] as const;
const ROOT_PRODUCTS_SIZE_OPTIONS_NUMERIC = ["35", "36", "37", "38", "39", "40", "41", "42", "44", "Unico"] as const;

function sanitizeDisplayText(value: unknown): string {
  let text = String(value || "").trim();
  if (!text) return "";

  BROKEN_ENCODING_REPLACEMENTS.forEach(([broken, fixed]) => {
    text = text.split(broken).join(fixed);
  });
  QUESTION_MARK_TEXT_REPLACEMENTS.forEach(([pattern, fixed]) => {
    text = text.replace(pattern, fixed);
  });

  text = text.replace(/\uFFFD/g, "").trim();
  if (/^[\?\uFFFD]nico$/i.test(text)) return "Único";
  return text;
}

function shortenProductsTitle(value: unknown): string {
  const text = sanitizeDisplayText(value);
  if (!text) return "";

  const trimmedByClause = text.split(/\s+(?:com|para)\s+/i)[0]?.trim() || text;
  const words = trimmedByClause.split(/\s+/).filter(Boolean);
  if (words.length <= 6) return trimmedByClause;
  return words.slice(0, 6).join(" ");
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

function hasAnySearchParam(params: ProductsSearchParams): boolean {
  return Object.values(params).some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) => String(entry || "").trim().length > 0);
    }
    return String(value || "").trim().length > 0;
  });
}

function buildSearchSuggestionLinks(
  params: ProductsSearchParams,
  catalogProducts: ReadonlyArray<Pick<ExtendedProduct, "name">>
): Array<{ href: string; label: string; active: boolean }> {
  const queryValue = sanitizeDisplayText(params.q).trim();
  const normalizedQuery = normalizeText(queryValue);
  const stopWords = new Set(["de", "da", "do", "das", "dos", "e", "em", "com", "para", "a", "o", "as", "os"]);

  // If the query is only gender/modifier words with no substantive product keyword, skip suggestions
  const coreQuery = sanitizeDisplayText(
    queryValue
      .replace(/\b(masculino|feminino|tsebi|premium|basica|basico)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
  );
  if (!coreQuery) return [];

  const baseKeyword = coreQuery;
  const baseKeywordNormalized = normalizeText(baseKeyword);
  const queryTokens = normalizedQuery
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !stopWords.has(token));

  const catalogNames = catalogProducts
    .map((product) => sanitizeDisplayText(product.name).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const relevantNames = catalogNames.filter((name) => {
    if (!queryTokens.length) return true;
    return fuzzyMatchQueryAgainstSearchable(queryValue || normalizedQuery, [name]);
  });

  // No fallback to full catalog — if nothing matches, return no suggestions
  if (relevantNames.length === 0) return [];

  const dedupeNormalized = new Set<string>();
  const finalSuggestions: string[] = [];

  relevantNames.forEach((name) => {
    if (finalSuggestions.length >= 3) return;

    const displayWords = name.split(/\s+/).filter(Boolean);
    if (displayWords.length === 0) return;

    const normalizedWords = displayWords.map((word) => normalizeText(word));
    let anchorIndex = normalizedWords.findIndex((word) => word === baseKeywordNormalized || word.startsWith(baseKeywordNormalized));
    if (anchorIndex < 0 && queryTokens.length > 0) {
      anchorIndex = normalizedWords.findIndex((word) => queryTokens.some((token) => word === token || word.startsWith(token)));
    }
    if (anchorIndex < 0) anchorIndex = 0;

    const phraseWords: string[] = [displayWords[anchorIndex]];
    for (let index = anchorIndex + 1; index < displayWords.length && phraseWords.length < 3; index += 1) {
      phraseWords.push(displayWords[index]);
    }

    while (phraseWords.length > 1 && stopWords.has(normalizeText(phraseWords[phraseWords.length - 1]))) {
      phraseWords.pop();
    }
    const suggestion = sanitizeDisplayText(phraseWords.join(" ")).replace(/\s+/g, " ").trim();
    const normalizedSuggestion = normalizeText(suggestion);
    if (!normalizedSuggestion || normalizedSuggestion === normalizedQuery) return;
    if (dedupeNormalized.has(normalizedSuggestion)) return;

    dedupeNormalized.add(normalizedSuggestion);
    finalSuggestions.push(suggestion);
  });

  return finalSuggestions.map((term, index) => {
    const isActive = normalizedQuery ? normalizeText(term) === normalizedQuery : index === 0;
    return {
      href: buildProductsHref(params, { q: term }),
      label: term,
      active: isActive,
    };
  });
}

function renderRootProductsToolbar(
  filtersToggleId: string,
  mainCategoryLinks: ReadonlyArray<{ href: string; label: string; active: boolean }> = ROOT_PRODUCTS_MAIN_CATEGORY_LINKS,
  showActions: boolean = true,
  resultsCount?: number,
  searchQuery?: string,
  sortLinks?: ReadonlyArray<{ href: string; label: string; active: boolean }>,
  mobileFilterPanel?: React.ReactNode
) {
  return (
    <section className={styles.novidadesToolbarSection} aria-label="Filtros de produtos">
      <div className={styles.novidadesToolbarInner}>
        <div className={styles.novidadesFiltersLeft}>
          <ProductsToolbarSearch initialQuery={searchQuery} />
          <div className={styles.novidadesCategoriesRow}>
            {mainCategoryLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.novidadesMainCategoryLink} ${item.active ? styles.novidadesMainCategoryLinkActive : ""}`}
                scroll={false}
                prefetch={false}
              >
                {sanitizeDisplayText(item.label)}
              </Link>
            ))}
          </div>
        </div>
        {(showActions || (sortLinks && sortLinks.length > 0)) ? (
          <div className={styles.novidadesActionsRight}>
            {sortLinks && sortLinks.length > 0 && (
              <ProductsMobileSortPanel sortLinks={[...sortLinks]} />
            )}
            {mobileFilterPanel}
            {showActions && <>
            <details className={styles.novidadesSortGroup}>
              <summary className={styles.novidadesSortToggle}>
                <span>Ordenação</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesSortActionIcon}>
                  <path d="M8 6h8"></path>
                  <path d="M10 3l-2 3 2 3"></path>
                  <path d="M16 18H8"></path>
                  <path d="M14 15l2 3-2 3"></path>
                </svg>
              </summary>
              <div className={styles.novidadesSortMenu}>
                {ROOT_PRODUCTS_SORT_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${styles.novidadesFilterItem} ${item.active ? styles.novidadesFilterItemActive : ""}`}
                    scroll={false}
                    prefetch={false}
                  >
                    {sanitizeDisplayText(item.label)}
                  </Link>
                ))}
              </div>
            </details>
            <div className={styles.novidadesFiltersPopupGroup}>
              <input
                id={filtersToggleId}
                type="checkbox"
                className={styles.novidadesFiltersPopupCheckbox}
                aria-label="Abrir filtros"
              />
              <label
                htmlFor={filtersToggleId}
                className={`${styles.novidadesActionButton} ${styles.novidadesFiltersPopupToggle}`}
              >
                <span className={styles.novidadesFiltersLabel}>Filtros</span>
                <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.novidadesFilterActionIcon}>
                  <path d="M4 7h16"></path>
                  <circle cx="9" cy="7" r="1.8"></circle>
                  <path d="M4 12h16"></path>
                  <circle cx="15" cy="12" r="1.8"></circle>
                  <path d="M4 17h16"></path>
                  <circle cx="11.5" cy="17" r="1.8"></circle>
                </svg>
              </label>
              <div className={styles.novidadesFiltersPopupPanel} role="dialog" aria-label="Filtros">
                <Link href="/products?n=e&fp=1" className={styles.novidadesFiltersClear} scroll={false} prefetch={false}>
                  Limpar filtros
                </Link>
                <label htmlFor={filtersToggleId} className={styles.novidadesFiltersPopupClose} aria-label="Fechar filtros">
                  X
                </label>
                <div className={styles.novidadesFiltersPopupBody}>
                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Coleção</h3>
                    <div className={styles.novidadesFiltersTwoColumns}>
                      {ROOT_PRODUCTS_COLLECTION_LINKS.map((item) => (
                        <Link key={item.href} href={item.href} className={styles.novidadesFiltersOption} scroll={false} prefetch={false}>
                          <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(item.label)}</span>
                        </Link>
                      ))}
                    </div>
                  </section>

                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Cor</h3>
                    <div className={styles.novidadesFiltersExpandableBlock}>
                      <div className={styles.novidadesFiltersTwoColumns}>
                        {ROOT_PRODUCTS_COLOR_OPTIONS_VISIBLE.map((item) => (
                          <Link key={item.href} href={item.href} className={styles.novidadesFiltersOption} scroll={false} prefetch={false}>
                            <span
                              className={styles.novidadesFiltersColorDot}
                              aria-hidden="true"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(item.label)}</span>
                          </Link>
                        ))}
                      </div>
                      <details className={styles.novidadesFiltersMoreGroup}>
                        <summary className={styles.novidadesFiltersMoreToggle}>
                          <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                          <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                        </summary>
                        <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                          {ROOT_PRODUCTS_COLOR_OPTIONS_HIDDEN.map((item) => (
                            <Link key={item.href} href={item.href} className={styles.novidadesFiltersOption} scroll={false} prefetch={false}>
                              <span
                                className={styles.novidadesFiltersColorDot}
                                aria-hidden="true"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(item.label)}</span>
                            </Link>
                          ))}
                        </div>
                      </details>
                    </div>
                  </section>

                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Material</h3>
                    <div className={styles.novidadesFiltersExpandableBlock}>
                      <div className={styles.novidadesFiltersTwoColumns}>
                        {ROOT_PRODUCTS_MATERIAL_OPTIONS_VISIBLE.map((item) => (
                          <Link key={item.href} href={item.href} className={styles.novidadesFiltersOption} scroll={false} prefetch={false}>
                            <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(item.label)}</span>
                          </Link>
                        ))}
                      </div>
                      <details className={styles.novidadesFiltersMoreGroup}>
                        <summary className={styles.novidadesFiltersMoreToggle}>
                          <span className={styles.novidadesFiltersMoreTextMore}>Exibir mais</span>
                          <span className={styles.novidadesFiltersMoreTextLess}>Exibir menos</span>
                        </summary>
                        <div className={`${styles.novidadesFiltersTwoColumns} ${styles.novidadesFiltersCollapsibleGrid}`}>
                          {ROOT_PRODUCTS_MATERIAL_OPTIONS_HIDDEN.map((item) => (
                            <Link key={item.href} href={item.href} className={styles.novidadesFiltersOption} scroll={false} prefetch={false}>
                              <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(item.label)}</span>
                            </Link>
                          ))}
                        </div>
                      </details>
                    </div>
                  </section>

                  <section className={styles.novidadesFiltersSection}>
                    <h3 className={styles.novidadesFiltersSectionTitle}>Tamanho</h3>
                    <div className={styles.novidadesFiltersSizesWrap}>
                      {ROOT_PRODUCTS_SIZE_OPTIONS_APPAREL.map((size) => (
                        <Link key={size} href={`/products?n=e&sz=${encodeURIComponent(size)}&fp=1`} className={styles.novidadesFiltersSizeChip} scroll={false} prefetch={false}>
                          {size}
                        </Link>
                      ))}
                      <span className={styles.novidadesFiltersSizeDivider}>|</span>
                      {ROOT_PRODUCTS_SIZE_OPTIONS_NUMERIC.map((size) => (
                        <Link key={size} href={`/products?n=e&sz=${encodeURIComponent(size)}&fp=1`} className={styles.novidadesFiltersSizeChip} scroll={false} prefetch={false}>
                          {size}
                        </Link>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </>}
          </div>
        ) : typeof resultsCount === "number" ? (
          <div className={styles.novidadesActionsRight}>
            <span className={styles.novidadesResultsCount}>
              {resultsCount} {resultsCount === 1 ? "peça" : "peças"}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function resolveSortPatchFromLabel(label: string): string | null {
  const normalized = normalizeText(label);
  if (!normalized || normalized === "ordenacao") return null;
  if (normalized.includes("vendidos")) return "best_sellers";
  if (normalized.includes("recentes")) return "newest";
  if (normalized.includes("decrescente")) return "price_desc";
  if (normalized.includes("crescente")) return "price_asc";
  return null;
}

function buildExclusiveSuggestionFallbackCards(products: ExtendedProduct[]): ExclusiveSuggestionFallbackCard[] {
  const ranked = sortProducts(products, "best_sellers");
  const dedupe = new Set<string>();

  return ranked
    .map((product) => {
      const id = String(product.sku || product.id || "").trim();
      if (!id || dedupe.has(id)) return null;
      dedupe.add(id);
      const imagePair = buildHoverImagePair(product);
      const href = String(product.href || "").trim().startsWith("/")
        ? String(product.href || "").trim()
        : `/product/${encodeURIComponent(String(product.id || id).trim())}`;
      return {
        id,
        name: shortenProductsTitle(product.name) || id,
        image: imagePair.primary || "/images/placeholderreal.webp",
        href,
      } satisfies ExclusiveSuggestionFallbackCard;
    })
    .filter((entry): entry is ExclusiveSuggestionFallbackCard => Boolean(entry));
}

function renderProductsSelectedMark() {
  return (
    <span className={styles.novidadesFiltersSelectedMark} aria-hidden="true">
      <Image src="/images/logo-tsebi.png" alt="" className={styles.novidadesFiltersSelectedLogo} width={18} height={18} />
      <svg viewBox="0 0 12 12" className={styles.novidadesFiltersSelectedTick}>
        <path d="M2.2 6.2 4.8 8.8 9.8 3.8" />
      </svg>
    </span>
  );
}

function renderProductsFilterBody(
  params: ProductsSearchParams,
  collectionOptions: string[],
  colorOptions: string[],
  sizeOptions: string[],
  materialOptions: string[],
  collectionAvailability: Map<string, boolean>,
  colorAvailability: Map<string, boolean>,
  materialAvailability: Map<string, boolean>,
  sizeAvailability: Map<string, boolean>,
  exclusiveSuggestions: {
    query: string;
    contextHint: string;
    fallbackCards: ExclusiveSuggestionFallbackCard[];
  }
) {
  const activeGender = normalizeText(params.gender);
  const masculineHref =
    activeGender === "masculino" ? buildProductsHref(params, { gender: null }) : buildProductsHref(params, { gender: "Masculino" });
  const feminineHref =
    activeGender === "feminino" ? buildProductsHref(params, { gender: null }) : buildProductsHref(params, { gender: "Feminino" });
  const activeSort = normalizeSortParam(params.sort);
  const activeCollections = parseMultiSelectParam(params.collection);
  const activeColors = parseMultiSelectParam(params.color);
  const activeMaterials = parseMultiSelectParam(params.material);
  const activeSizes = parseMultiSelectParam(params.size);
  const activeCollectionsSet = new Set(activeCollections.map((entry) => normalizeText(entry)));
  const activeColorsSet = new Set(activeColors.map((entry) => normalizeText(entry)));
  const activeMaterialsSet = new Set(activeMaterials.map((entry) => normalizeText(entry)));
  const activeSizesSet = new Set(activeSizes.map((entry) => normalizeText(entry)));

  return (
    <>
      <div className={styles.productsSearchGenderToggle}>
        <Link
          href={masculineHref}
          className={`${styles.productsSearchGenderChip} ${activeGender === "masculino" ? styles.productsSearchGenderChipActive : ""}`}
          scroll={false}
          prefetch={false}
        >
          Homem
        </Link>
        <Link
          href={feminineHref}
          className={`${styles.productsSearchGenderChip} ${activeGender === "feminino" ? styles.productsSearchGenderChipActive : ""}`}
          scroll={false}
          prefetch={false}
        >
          Mulher
        </Link>
      </div>

      <ExclusiveSuggestions
        query={exclusiveSuggestions.query}
        contextHint={exclusiveSuggestions.contextHint}
        fallbackCards={exclusiveSuggestions.fallbackCards}
      />

      <details className={`${styles.productsSearchSidebarGroup} ${styles.productsSearchSidebarGroupSort}`}>
        <summary className={styles.productsSearchSidebarSummary}>Ordenar por</summary>
        <div className={styles.productsSearchSidebarBody}>
          {ROOT_PRODUCTS_SORT_LINKS.map((item) => {
            const sortPatch = resolveSortPatchFromLabel(item.label);
            if (!sortPatch) return null;
            const isActive = sortPatch === activeSort;
            return (
              <Link
                key={item.label}
                href={buildProductsHref(params, { sort: sortPatch })}
                className={`${styles.productsSearchSidebarOption} ${isActive ? styles.productsSearchSidebarOptionActive : ""}`}
                scroll={false}
                prefetch={false}
              >
                {sanitizeDisplayText(item.label)}
                {isActive ? renderProductsSelectedMark() : null}
              </Link>
            );
          })}
        </div>
      </details>

      <details className={styles.productsSearchSidebarGroup}>
        <summary className={styles.productsSearchSidebarSummary}>Coleção</summary>
        <div className={`${styles.productsSearchSidebarBody} ${styles.productsSearchSidebarBodyInline}`}>
          {collectionOptions.map((collectionOption) => {
            const isActive = activeCollectionsSet.has(normalizeText(collectionOption));
            const isUnavailable = !isActive && !collectionAvailability.get(normalizeText(collectionOption));
            const optionClassName = `${styles.productsSearchSidebarOption} ${isActive ? styles.productsSearchSidebarOptionActive : ""} ${isUnavailable ? styles.productsSearchSidebarOptionUnavailable : ""}`;
            if (isUnavailable) {
              return (
                <span key={collectionOption} className={optionClassName} aria-disabled="true">
                  {sanitizeDisplayText(collectionOption)}
                  {isActive ? renderProductsSelectedMark() : null}
                </span>
              );
            }
            return (
              <Link
                key={collectionOption}
                href={buildProductsHref(params, { collection: toggleMultiSelectOption(activeCollections, collectionOption) })}
                className={optionClassName}
                scroll={false}
                prefetch={false}
              >
                {sanitizeDisplayText(collectionOption)}
                {isActive ? renderProductsSelectedMark() : null}
              </Link>
            );
          })}
        </div>
      </details>

      <details className={styles.productsSearchSidebarGroup}>
        <summary className={styles.productsSearchSidebarSummary}>Cor</summary>
        <div className={styles.productsSearchSidebarBody}>
          {colorOptions.map((colorOption) => {
            const isActive = activeColorsSet.has(normalizeText(colorOption));
            const isUnavailable = !isActive && !colorAvailability.get(normalizeText(colorOption));
            const optionClassName = `${styles.productsSearchSidebarOption} ${styles.productsSearchSidebarColorOption} ${isActive ? styles.productsSearchSidebarOptionActive : ""} ${isUnavailable ? styles.productsSearchSidebarOptionUnavailable : ""}`;
            if (isUnavailable) {
              return (
                <span key={colorOption} className={optionClassName} aria-disabled="true">
                  <span className={styles.productsSearchSidebarColorDot} aria-hidden="true" style={{ backgroundColor: resolveColorSwatch(colorOption) }} />
                  <span>{sanitizeDisplayText(colorOption)}</span>
                  {isActive ? renderProductsSelectedMark() : null}
                </span>
              );
            }
            return (
              <Link
                key={colorOption}
                href={buildProductsHref(params, { color: toggleMultiSelectOption(activeColors, colorOption) })}
                className={optionClassName}
                scroll={false}
                prefetch={false}
              >
                <span className={styles.productsSearchSidebarColorDot} aria-hidden="true" style={{ backgroundColor: resolveColorSwatch(colorOption) }} />
                <span>{sanitizeDisplayText(colorOption)}</span>
                {isActive ? renderProductsSelectedMark() : null}
              </Link>
            );
          })}
        </div>
      </details>

      {materialOptions.length > 0 ? (
        <details className={styles.productsSearchSidebarGroup}>
          <summary className={styles.productsSearchSidebarSummary}>Material</summary>
          <div className={styles.productsSearchSidebarBody}>
            {materialOptions.map((material) => {
              const isActive = activeMaterialsSet.has(normalizeText(material));
              const isUnavailable = !isActive && !materialAvailability.get(normalizeText(material));
              const optionClassName = `${styles.productsSearchSidebarOption} ${isActive ? styles.productsSearchSidebarOptionActive : ""} ${isUnavailable ? styles.productsSearchSidebarOptionUnavailable : ""}`;
              if (isUnavailable) {
                return (
                  <span key={material} className={optionClassName} aria-disabled="true">
                    {sanitizeDisplayText(material)}
                    {isActive ? renderProductsSelectedMark() : null}
                  </span>
                );
              }
              return (
                <Link
                  key={material}
                  href={buildProductsHref(params, { material: toggleMultiSelectOption(activeMaterials, material) })}
                  className={optionClassName}
                  scroll={false}
                  prefetch={false}
                >
                  {sanitizeDisplayText(material)}
                  {isActive ? renderProductsSelectedMark() : null}
                </Link>
              );
            })}
          </div>
        </details>
      ) : null}

      <details className={styles.productsSearchSidebarGroup}>
        <summary className={styles.productsSearchSidebarSummary}>Tamanho</summary>
        <div className={styles.productsSearchSidebarBody}>
          {sizeOptions.map((size) => {
            const isActive = activeSizesSet.has(normalizeText(size));
            const isUnavailable = !isActive && !sizeAvailability.get(normalizeText(size));
            const optionClassName = `${styles.productsSearchSidebarOption} ${isActive ? styles.productsSearchSidebarOptionActive : ""} ${isUnavailable ? styles.productsSearchSidebarOptionUnavailable : ""}`;
            if (isUnavailable) {
              return (
                <span key={size} className={optionClassName} aria-disabled="true">
                  {sanitizeDisplayText(size)}
                  {isActive ? renderProductsSelectedMark() : null}
                </span>
              );
            }
            return (
              <Link
                key={size}
                href={buildProductsHref(params, { size: toggleMultiSelectOption(activeSizes, size) })}
                className={optionClassName}
                scroll={false}
                prefetch={false}
              >
                {sanitizeDisplayText(size)}
                {isActive ? renderProductsSelectedMark() : null}
              </Link>
            );
          })}
        </div>
      </details>
    </>
  );
}

function renderProductsSearchSidebar(
  params: ProductsSearchParams,
  collectionOptions: string[],
  colorOptions: string[],
  sizeOptions: string[],
  materialOptions: string[],
  collectionAvailability: Map<string, boolean>,
  colorAvailability: Map<string, boolean>,
  materialAvailability: Map<string, boolean>,
  sizeAvailability: Map<string, boolean>,
  exclusiveSuggestions: {
    query: string;
    contextHint: string;
    fallbackCards: ExclusiveSuggestionFallbackCard[];
  }
) {
  return (
    <div className={styles.productsSearchSidebarSlot}>
      <aside className={styles.productsSearchSidebar}>
        {renderProductsFilterBody(
          params,
          collectionOptions,
          colorOptions,
          sizeOptions,
          materialOptions,
          collectionAvailability,
          colorAvailability,
          materialAvailability,
          sizeAvailability,
          exclusiveSuggestions
        )}
      </aside>
    </div>
  );
}

function includesNormalized(haystack: unknown, needle: string): boolean {
  return normalizeText(haystack).includes(needle);
}

const FUZZY_STOP_WORDS = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "em",
  "com",
  "para",
  "a",
  "o",
  "as",
  "os",
]);

const QUERY_SYNONYM_GROUPS = [
  ["camisa", "camiseta", "tshirt", "t-shirt", "blusa", "blusao", "top"],
  ["calca", "calcas", "trouser", "trousers", "pants", "pant", "jeans", "pantalona"],
  ["jaqueta", "jaquetas", "casaco", "casacos", "blazer", "blazers", "outerwear"],
  ["bolsa", "bolsas", "bag", "bags"],
  ["carteira", "carteiras", "wallet", "wallets"],
  ["cinto", "cintos", "belt", "belts"],
  ["vestido", "vestidos", "dress", "dresses"],
  ["saia", "saias", "skirt", "skirts"],
  ["masculino", "homem", "masc", "male", "men", "man"],
  ["feminino", "mulher", "fem", "female", "women", "woman"],
] as const;

const GENDER_MASC_TERMS = ["masculino", "homem", "masc", "male", "men", "man"] as const;
const GENDER_FEM_TERMS = ["feminino", "mulher", "fem", "female", "women", "woman"] as const;

function tokenizeNormalized(value: unknown): string[] {
  const normalized = normalizeText(value).replace(/[^a-z0-9\s]/g, " ");
  if (!normalized) return [];
  return normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeTokenForMatch(token: string): string {
  let value = normalizeText(token).replace(/[^a-z0-9]/g, "");
  if (value.endsWith("s") && value.length > 4) value = value.slice(0, -1);
  if (value.endsWith("es") && value.length > 5) value = value.slice(0, -2);
  return value;
}

function levenshteinWithin(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  const alen = a.length;
  const blen = b.length;
  if (!alen) return blen;
  if (!blen) return alen;
  if (Math.abs(alen - blen) > maxDistance) return maxDistance + 1;

  let prev = Array.from({ length: blen + 1 }, (_, index) => index);
  for (let i = 1; i <= alen; i += 1) {
    const curr = [i];
    let rowMin = curr[0];
    for (let j = 1; j <= blen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      curr.push(value);
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    prev = curr;
  }

  return prev[blen];
}

function tokenMaxDistance(token: string): number {
  if (token.length <= 4) return 1;
  if (token.length <= 8) return 2;
  return 3;
}

function tokenIsMatch(queryTokenRaw: string, candidateTokenRaw: string): boolean {
  const queryToken = normalizeTokenForMatch(queryTokenRaw);
  const candidateToken = normalizeTokenForMatch(candidateTokenRaw);
  if (!queryToken || !candidateToken) return false;
  if (queryToken === candidateToken) return true;

  if (queryToken.length >= 3 && candidateToken.includes(queryToken)) return true;
  if (candidateToken.length >= 3 && queryToken.includes(candidateToken)) return true;

  const limit = Math.min(tokenMaxDistance(queryToken), tokenMaxDistance(candidateToken));
  return levenshteinWithin(queryToken, candidateToken, limit) <= limit;
}

function tokenSimilarityScore(queryTokenRaw: string, candidateTokenRaw: string): number {
  const queryToken = normalizeTokenForMatch(queryTokenRaw);
  const candidateToken = normalizeTokenForMatch(candidateTokenRaw);
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (candidateToken.startsWith(queryToken) || queryToken.startsWith(candidateToken)) return 0.95;
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) return 0.88;

  const limit = Math.min(tokenMaxDistance(queryToken), tokenMaxDistance(candidateToken));
  const distance = levenshteinWithin(queryToken, candidateToken, limit);
  if (distance > limit) return 0;
  return 0.6 + ((limit - distance) / Math.max(1, limit)) * 0.25;
}

function buildSynonymMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  QUERY_SYNONYM_GROUPS.forEach((group) => {
    const normalizedGroup = group.map((entry) => normalizeTokenForMatch(entry)).filter(Boolean);
    normalizedGroup.forEach((entry) => {
      map.set(entry, normalizedGroup);
    });
  });
  return map;
}

const QUERY_SYNONYM_MAP = buildSynonymMap();

function expandQueryToken(token: string): string[] {
  const normalized = normalizeTokenForMatch(token);
  if (!normalized) return [];
  const group = QUERY_SYNONYM_MAP.get(normalized);
  return group ? Array.from(new Set([normalized, ...group])) : [normalized];
}

function fuzzyMatchQueryAgainstSearchable(queryValue: string, searchableEntries: unknown[]): boolean {
  const queryTokens = tokenizeNormalized(queryValue)
    .map((token) => normalizeTokenForMatch(token))
    .filter((token) => token.length >= 2 && !FUZZY_STOP_WORDS.has(token));

  if (queryTokens.length === 0) return true;

  const searchableTokens = searchableEntries
    .flatMap((entry) => tokenizeNormalized(entry))
    .map((token) => normalizeTokenForMatch(token))
    .filter(Boolean);

  if (searchableTokens.length === 0) return false;

  return queryTokens.every((queryToken) => {
    const expanded = expandQueryToken(queryToken);
    return expanded.some((variant) => searchableTokens.some((candidate) => tokenIsMatch(variant, candidate)));
  });
}

function inferGenderFromFuzzyQuery(queryValue: string): "" | "masculino" | "feminino" {
  const queryTokens = tokenizeNormalized(queryValue)
    .map((token) => normalizeTokenForMatch(token))
    .filter(Boolean);
  if (queryTokens.length === 0) return "";

  const hasMasc = queryTokens.some((queryToken) =>
    GENDER_MASC_TERMS.some((candidate) => tokenIsMatch(queryToken, candidate))
  );
  const hasFem = queryTokens.some((queryToken) =>
    GENDER_FEM_TERMS.some((candidate) => tokenIsMatch(queryToken, candidate))
  );
  if (hasMasc && hasFem) return "";
  if (hasMasc) return "masculino";
  if (hasFem) return "feminino";
  return "";
}

function extractQueryTokensForRanking(queryValue: string): string[] {
  return tokenizeNormalized(queryValue)
    .map((token) => normalizeTokenForMatch(token))
    .filter((token) => token.length >= 2 && !FUZZY_STOP_WORDS.has(token));
}

function computeProductFuzzyScore(product: ExtendedProduct, queryValue: string): number {
  const queryTokens = extractQueryTokensForRanking(queryValue);
  if (queryTokens.length === 0) return 0;

  const fields: Array<{ values: unknown[]; weight: number }> = [
    { values: [product.name], weight: 6 },
    { values: [product.subcategory], weight: 5 },
    { values: [product.category], weight: 4 },
    { values: [product.material], weight: 3 },
    { values: [product.collection, ...(Array.isArray(product.collections) ? product.collections : [])], weight: 2.5 },
    { values: [product.gender], weight: 2 },
    { values: [product.sku], weight: 2 },
    { values: Array.isArray(product.tags) ? product.tags : [], weight: 3 },
  ];

  const tokenFields = fields
    .map((field) => ({
      weight: field.weight,
      tokens: field.values.flatMap((entry) => tokenizeNormalized(entry)).map((token) => normalizeTokenForMatch(token)).filter(Boolean),
    }))
    .filter((entry) => entry.tokens.length > 0);

  let score = 0;
  for (const queryToken of queryTokens) {
    const expanded = expandQueryToken(queryToken);
    let best = 0;
    for (const field of tokenFields) {
      for (const variant of expanded) {
        for (const candidateToken of field.tokens) {
          const similarity = tokenSimilarityScore(variant, candidateToken);
          if (!similarity) continue;
          const weighted = similarity * field.weight;
          if (weighted > best) best = weighted;
        }
      }
    }
    score += best;
  }

  const normalizedQuery = normalizeText(queryValue);
  const normalizedName = normalizeText(product.name);
  if (normalizedQuery && normalizedName === normalizedQuery) score += 20;
  else if (normalizedQuery && normalizedName.startsWith(normalizedQuery)) score += 12;
  else if (normalizedQuery && normalizedName.includes(normalizedQuery)) score += 8;

  if (Boolean(product.isBestSeller)) score += 0.35;
  if (Boolean(product.isNew)) score += 0.25;
  return score;
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
  if (view === "presentes-para-ele") return category ? `Presentes para ele - ${category}` : "Presentes para ele";
  if (view === "presentes-para-ela") return category ? `Presentes para ela - ${category}` : "Presentes para ela";

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
  const shortNovidades = normalizeText(params.n);
  const shortPresentes = normalizeText(params.p);
  const resolvedView =
    shortNovidades === "e" || shortNovidades === "ele" || shortNovidades === "m" || shortNovidades === "masculino"
      ? "novidades-para-ele"
      : shortNovidades === "a" || shortNovidades === "ela" || shortNovidades === "f" || shortNovidades === "feminino"
        ? "novidades-para-ela"
        : shortPresentes === "e" || shortPresentes === "ele" || shortPresentes === "m" || shortPresentes === "masculino"
          ? "presentes-para-ele"
          : shortPresentes === "a" || shortPresentes === "ela" || shortPresentes === "f" || shortPresentes === "feminino"
            ? "presentes-para-ela"
            : params.view;
  const view = normalizeText(resolvedView);
  const rawResolvedCategory = resolveNovidadesCategoryParam(params.category ?? params.c);
  const rawResolvedSubcategory = String(params.subcategory || "").trim();
  const normalizedCategory = normalizeText(rawResolvedCategory).replace(/\s+/g, "-");
  const normalizedSubcategory = normalizeText(rawResolvedSubcategory).replace(/\s+/g, "-");
  const mappedAccessorySubcategoryFromCategory = ACCESSORIES_SUBCATEGORY_ALIASES[normalizedCategory] || "";
  const mappedAccessorySubcategoryFromSubcategory = ACCESSORIES_SUBCATEGORY_ALIASES[normalizedSubcategory] || "";
  const mappedAccessoryCategory = ACCESSORIES_CATEGORY_ALIASES[normalizedCategory] || "";
  const hasAccessorySubcategory = Boolean(mappedAccessorySubcategoryFromCategory || mappedAccessorySubcategoryFromSubcategory);
  const resolvedCategory = mappedAccessoryCategory || (hasAccessorySubcategory ? "Accessories" : rawResolvedCategory);
  const resolvedColor = String(params.color ?? params.co ?? "").trim();
  const resolvedSize = String(params.size ?? params.sz ?? "").trim();
  const resolvedMaterial = String(params.material ?? params.mt ?? "").trim();
  const resolvedSubcategory =
    mappedAccessorySubcategoryFromSubcategory || rawResolvedSubcategory || mappedAccessorySubcategoryFromCategory;
  const baseParams = {
    ...params,
    view: resolvedView,
    category: resolvedCategory,
    subcategory: resolvedSubcategory,
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

  if (view === "presentes-para-ele") {
    return { ...baseParams, gender: params.gender ?? "Masculino" };
  }

  if (view === "presentes-para-ela") {
    return { ...baseParams, gender: params.gender ?? "Feminino" };
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
  const isGenderCatalogView =
    !view && (normalizedGender === "masculino" || normalizedGender === "feminino");
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

  if (view === "presentes-para-ele" || view === "presentes-para-ela") {
    return {
      mediaUrl: "https://media.tsebi.com.br/generation-57e63375-48cf-4bbf-a7b9-22ce3f1b5a6a.png",
      mediaType: "image",
      rotate180: false,
      objectPosition: "center 28%",
    };
  }

  if (isGenderCatalogView && categoryHeroEntry) {
    return {
      mediaUrl:
        normalizedGender === "masculino" ? categoryHeroEntry.mediaUrlMasculino : categoryHeroEntry.mediaUrlFeminino,
      mediaType: "image",
      objectPosition: categoryHeroEntry.objectPosition ?? "center center",
    };
  }

  if (isGenderCatalogView) {
    if (normalizedGender === "feminino") {
      return {
        mediaUrl: "https://media.tsebi.com.br/generation-8974f666-dacc-437b-a535-77e350085a50.png",
        mediaType: "image",
        objectPosition: "center 22%",
      };
    }

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
  if (view === "presentes-para-ele") return NOVIDADES_FILTERS_MASCULINO;
  if (view === "presentes-para-ela") return NOVIDADES_FILTERS_FEMININO;

  const gender = normalizeText(params.gender);
  if (gender === "masculino") return NOVIDADES_FILTERS_MASCULINO;
  if (gender === "feminino") return NOVIDADES_FILTERS_FEMININO;

  const category = normalizeText(params.category).replace(/\s+/g, "-");
  const subcategory = normalizeText(params.subcategory).replace(/\s+/g, "-");
  const accessoriesContext =
    Boolean(ACCESSORIES_CATEGORY_ALIASES[category]) || Boolean(ACCESSORIES_SUBCATEGORY_ALIASES[category]) || Boolean(ACCESSORIES_SUBCATEGORY_ALIASES[subcategory]);
  if (accessoriesContext) {
    return [
      {
        label: "Bolsas e Acessórios",
        category: "Accessories",
        subcategories: ACCESSORIES_TAB_SUBCATEGORIES,
      },
    ];
  }

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

function sortProducts(products: ExtendedProduct[], sortValue: NovidadesSortValue, queryValue = ""): ExtendedProduct[] {
  if (!sortValue) {
    const normalizedQuery = normalizeText(queryValue);
    if (!normalizedQuery) return products;

    const sortedByRelevance = [...products];
    sortedByRelevance.sort((a, b) => {
      const scoreDiff = computeProductFuzzyScore(b, queryValue) - computeProductFuzzyScore(a, queryValue);
      if (scoreDiff !== 0) return scoreDiff;
      const bestSellerDiff = Number(Boolean(b.isBestSeller)) - Number(Boolean(a.isBestSeller));
      if (bestSellerDiff !== 0) return bestSellerDiff;
      return parseDateValue(b.updatedAt || b.createdAt) - parseDateValue(a.updatedAt || a.createdAt);
    });
    return sortedByRelevance;
  }

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
  const normalizedNextView = normalizeText(nextView);
  const isNovidadesView = ["novidades-para-ele", "novidades-para-ela"].includes(normalizedNextView);
  const isPresentesView = ["presentes-para-ele", "presentes-para-ela"].includes(normalizedNextView);
  if (isNovidadesView) {
    search.set("n", normalizedNextView === "novidades-para-ele" ? "e" : "a");
  }
  if (isPresentesView) {
    search.set("p", normalizedNextView === "presentes-para-ele" ? "e" : "a");
  }

  NOVIDADES_PARAM_KEYS.forEach((key) => {
    if (isNovidadesView && ["view", "gender", "isNew", "isBestSeller", "isFeatured"].includes(key)) return;
    if (isPresentesView && ["view", "gender"].includes(key)) return;

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
  "bordo-accent": "#6d1f2c",
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

type VariantStockEntry = {
  color: string;
  size: string;
  qty: number;
};

function parseVariantStockEntries(product: ExtendedProduct): VariantStockEntry[] {
  const map =
    product?.variantStock && typeof product.variantStock === "object" && !Array.isArray(product.variantStock)
      ? product.variantStock
      : {};

  return Object.entries(map)
    .map(([key, value]) => {
      const parts = String(key || "").split("__");
      const color = sanitizeDisplayText(parts[0] || "");
      const size = sanitizeDisplayText(parts[1] || "");
      const qty = Math.max(0, Number(value || 0));
      if (!color || !size) return null;
      return { color, size, qty };
    })
    .filter((entry): entry is VariantStockEntry => Boolean(entry));
}

function productHasAnyStock(product: ExtendedProduct): boolean {
  const entries = parseVariantStockEntries(product);
  if (entries.length > 0) return entries.some((entry) => entry.qty > 0);
  return Math.max(0, Number(product.stock || 0)) > 0;
}

function productHasStockForColor(product: ExtendedProduct, colorValue: string): boolean {
  const target = normalizeText(colorValue);
  if (!target) return false;

  const entries = parseVariantStockEntries(product);
  if (entries.length > 0) {
    return entries.some((entry) => entry.qty > 0 && normalizeText(entry.color) === target);
  }

  const hasColor = Array.isArray(product.colors) && product.colors.some((entry) => normalizeText(entry) === target);
  return hasColor && productHasAnyStock(product);
}

function productHasStockForSize(product: ExtendedProduct, sizeValue: string): boolean {
  const target = normalizeText(sizeValue);
  if (!target) return false;

  const entries = parseVariantStockEntries(product);
  if (entries.length > 0) {
    return entries.some((entry) => entry.qty > 0 && normalizeText(entry.size) === target);
  }

  const hasSize = Array.isArray(product.sizes) && product.sizes.some((entry) => normalizeText(entry) === target);
  return hasSize && productHasAnyStock(product);
}

function productHasStockForVariant(product: ExtendedProduct, colorValue: string, sizeValue: string): boolean {
  const targetColor = normalizeText(colorValue);
  const targetSize = normalizeText(sizeValue);
  if (!targetColor || !targetSize) return false;

  const entries = parseVariantStockEntries(product);
  if (entries.length > 0) {
    return entries.some(
      (entry) => entry.qty > 0 && normalizeText(entry.color) === targetColor && normalizeText(entry.size) === targetSize
    );
  }

  const hasColor = Array.isArray(product.colors) && product.colors.some((entry) => normalizeText(entry) === targetColor);
  const hasSize = Array.isArray(product.sizes) && product.sizes.some((entry) => normalizeText(entry) === targetSize);
  return hasColor && hasSize && productHasAnyStock(product);
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

function isNumericSizeLabel(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (parseSizeNumericValue(raw) !== null) return true;
  return /^\d+\s*[/\-]\s*\d+$/.test(raw);
}

function isApparelSizeLabel(value: string): boolean {
  const normalized = normalizeText(value);
  return [
    "pp",
    "p",
    "m",
    "g",
    "gg",
    "xg",
    "xgg",
    "xxg",
    "xs",
    "s",
    "l",
    "xl",
    "xxl",
    "u",
    "unico",
    "único",
  ].includes(normalized);
}

type SearchSizeMode = "apparel" | "numeric" | "both";

function inferSearchSizeMode(params: ProductsSearchParams, productsContext: ExtendedProduct[], activeSizes: string[]): SearchSizeMode {
  const activeSizeMode = (() => {
    if (activeSizes.length === 0) return null;
    const hasNumeric = activeSizes.some((entry) => isNumericSizeLabel(entry));
    const hasApparel = activeSizes.some((entry) => isApparelSizeLabel(entry) || !isNumericSizeLabel(entry));
    if (hasNumeric && !hasApparel) return "numeric" as const;
    if (hasApparel && !hasNumeric) return "apparel" as const;
    return "both" as const;
  })();
  if (activeSizeMode) return activeSizeMode;

  const contextText = normalizeText([params.q, params.category, params.subcategory].filter(Boolean).join(" "));
  const numericKeywords = ["calca", "calça", "jeans", "sapato", "tenis", "tênis", "bota", "sandalia", "sandália", "mocassim", "loafer", "scarpin", "sneaker", "rasteira", "salto"];
  const apparelKeywords = ["camisa", "camiseta", "vestido", "jaqueta", "casaco", "blazer", "saia", "short", "bermuda", "top", "body", "tricot", "tricô", "macacao", "macacão", "polo"];
  if (numericKeywords.some((entry) => contextText.includes(normalizeText(entry)))) return "numeric";
  if (apparelKeywords.some((entry) => contextText.includes(normalizeText(entry)))) return "apparel";

  let numericProducts = 0;
  let apparelProducts = 0;

  productsContext.forEach((product) => {
    const sizes = Array.isArray(product.sizes) ? product.sizes.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
    if (sizes.length === 0) return;
    const hasNumeric = sizes.some((entry) => isNumericSizeLabel(entry));
    const hasApparel = sizes.some((entry) => isApparelSizeLabel(entry) || !isNumericSizeLabel(entry));
    if (hasNumeric) numericProducts += 1;
    if (hasApparel) apparelProducts += 1;
  });

  if (numericProducts > 0 && apparelProducts === 0) return "numeric";
  if (apparelProducts > 0 && numericProducts === 0) return "apparel";
  if (numericProducts >= apparelProducts * 1.25 && numericProducts > 0) return "numeric";
  if (apparelProducts >= numericProducts * 1.25 && apparelProducts > 0) return "apparel";
  return "both";
}

function buildSearchSidebarSizeOptions(
  params: ProductsSearchParams,
  productsContext: ExtendedProduct[],
  orderedSizes: OrderedSizeFilters,
  activeSizes: string[]
): string[] {
  const mode = inferSearchSizeMode(params, productsContext, activeSizes);
  const numericOthers = orderedSizes.others.filter((entry) => isNumericSizeLabel(entry));
  const apparelOthers = orderedSizes.others.filter((entry) => !isNumericSizeLabel(entry));
  const options =
    mode === "numeric"
      ? [...orderedSizes.numeric, ...numericOthers]
      : mode === "apparel"
        ? [...orderedSizes.apparel, ...apparelOthers]
        : [...orderedSizes.apparel, ...apparelOthers, ...orderedSizes.numeric, ...numericOthers];

  const dedupe = new Set<string>();
  const normalizedOptions: string[] = [];
  options.forEach((entry) => {
    const label = sanitizeDisplayText(entry).trim();
    const normalized = normalizeText(label);
    if (!label || !normalized || dedupe.has(normalized)) return;
    dedupe.add(normalized);
    normalizedOptions.push(label);
  });

  activeSizes.forEach((entry) => {
    const label = sanitizeDisplayText(entry).trim();
    const normalized = normalizeText(label);
    if (!label || !normalized || dedupe.has(normalized)) return;
    dedupe.add(normalized);
    normalizedOptions.push(label);
  });

  return normalizedOptions;
}

function getAvailableFilters(products: ExtendedProduct[]): AvailableFilters {
  const inStockProducts = products.filter((product) => productHasAnyStock(product));

  const collections = normalizeOptionValues(
    inStockProducts.flatMap((product) => {
      const entries = [sanitizeDisplayText(product.collection)];
      if (Array.isArray(product.collections)) {
        product.collections.forEach((entry) => entries.push(sanitizeDisplayText(entry)));
      }
      return entries;
    })
  );
  const colors = normalizeOptionValues(
    inStockProducts.flatMap((product) =>
      (Array.isArray(product.colors) ? product.colors : [])
        .map((item) => sanitizeDisplayText(item))
        .filter((color) => productHasStockForColor(product, color))
    )
  );
  const materials = normalizeOptionValues(inStockProducts.map((product) => sanitizeDisplayText(product.material)));
  const sizes = normalizeOptionValues(
    inStockProducts.flatMap((product) =>
      (Array.isArray(product.sizes) ? product.sizes : [])
        .map((item) => sanitizeDisplayText(item))
        .filter((size) => productHasStockForSize(product, size))
    )
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
      name: shortenProductsTitle(product.name || "Produto Tsebi"),
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
  const rawQuery = sanitizeDisplayText(params.q).trim();
  const query = normalizeText(rawQuery);
  const gender = normalizeText(params.gender);
  const inferredGenderFromQuery = !gender ? inferGenderFromFuzzyQuery(rawQuery || query) : "";
  const queryTokens = tokenizeNormalized(rawQuery || query)
    .flatMap((token) => expandQueryToken(token))
    .filter(Boolean);
  const hasNonGenderToken = queryTokens.some(
    (token) =>
      !GENDER_MASC_TERMS.some((candidate) => tokenIsMatch(token, candidate)) &&
      !GENDER_FEM_TERMS.some((candidate) => tokenIsMatch(token, candidate))
  );
  const genderOnlyQuery = Boolean(inferredGenderFromQuery) && query.length > 0 && !hasNonGenderToken;
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
    const effectiveGender = gender || inferredGenderFromQuery;
    if (effectiveGender && normalizeText(product.gender) !== effectiveGender) return false;
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
      const hasColorMatch = colors.some((color) => productHasStockForColor(product, color));
      if (!hasColorMatch) return false;
    }

    if (!ignoreAttributeFilters && sizes.length > 0) {
      const hasSizeMatch = sizes.some((size) => productHasStockForSize(product, size));
      if (!hasSizeMatch) return false;
    }

    if (!ignoreAttributeFilters && materials.length > 0) {
      const hasMaterialMatch = materials.some(
        (material) => normalizeText(product.material) === material && productHasAnyStock(product)
      );
      if (!hasMaterialMatch) return false;
    }

    if (!ignoreAttributeFilters && colors.length > 0 && sizes.length > 0) {
      const hasVariantMatch = colors.some((color) =>
        sizes.some((size) => productHasStockForVariant(product, color, size))
      );
      if (!hasVariantMatch) return false;
    }

    if (isNew !== null && Boolean(product.isNew) !== isNew) return false;
    if (isBestSeller !== null && Boolean(product.isBestSeller) !== isBestSeller) return false;
    if (isFeatured !== null && Boolean(product.isFeatured) !== isFeatured) return false;

    if (!query || genderOnlyQuery) return true;

    const searchable = [
      product.name,
      product.gender,
      product.category,
      product.collection,
      product.material,
      product.sku,
      product.subcategory,
      ...(Array.isArray(product.tags) ? product.tags : []),
      ...(Array.isArray(product.collections) ? product.collections : []),
    ];

    return fuzzyMatchQueryAgainstSearchable(rawQuery || query, searchable);
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const rawParams = await searchParams;
  const hasRawParams = hasAnySearchParam(rawParams);
  const renderRootToolbarOnly = false;
  if (!hasRawParams && renderRootToolbarOnly) {
    return (
      <main>
        <BodyClassName className="products-novidades-view" />
        {renderRootProductsToolbar("novidades-filtros-toggle-products-root")}
      </main>
    );
  }

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
  let products: ExtendedProduct[] = [];
  try {
    products = (await listProducts()) as ExtendedProduct[];
  } catch (error) {
    console.error("[products-page] failed to load products", error);
  }
  const inStockProducts = products.filter((product) => productHasAnyStock(product));
  const allStockFilters = getAvailableFilters(inStockProducts);
  const filteredForFacets = filterProducts(inStockProducts, params, { ignoreAttributeFilters: true });
  const availableFilters = getAvailableFilters(filteredForFacets);
  const filtered = filterProducts(products, params);
  const sortValue = normalizeSortParam(params.sort);
  const sorted = sortProducts(filtered, sortValue, String(params.q || ""));
  const title = buildPageTitle(params);
  const hasSearchQuery = String(params.q || "").trim().length > 0;
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
  const collectionOptions = sortOptionValues(normalizeOptionValues([...allStockFilters.collections, ...activeCollections]));
  const colorOptions = sortOptionValues(normalizeOptionValues([...allStockFilters.colors, ...activeColors]));
  const materialOptions = sortOptionValues(normalizeOptionValues([...allStockFilters.materials, ...activeMaterials]));
  const sizeOptions = sortOptionValues(normalizeOptionValues([...allStockFilters.sizes, ...activeSizes]));
  const visibleColors = colorOptions.slice(0, 4);
  const hiddenColors = colorOptions.slice(4);
  const visibleMaterials = materialOptions.slice(0, 4);
  const hiddenMaterials = materialOptions.slice(4);
  const orderedSizes = orderSizeFilters(sizeOptions);
  const sizeSequence = [...orderedSizes.apparel, ...orderedSizes.numeric, ...orderedSizes.others];
  const hasSizeSeparator = orderedSizes.apparel.length > 0 && orderedSizes.numeric.length > 0;
  const collectionAvailability = new Map(
    collectionOptions.map((option) => {
      const hasMatch =
        filterProducts(inStockProducts, {
          ...params,
          collection: sanitizeDisplayText(option).trim(),
        }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const colorAvailability = new Map(
    colorOptions.map((option) => {
      const hasMatch =
        filterProducts(inStockProducts, {
          ...params,
          color: sanitizeDisplayText(option).trim(),
        }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const materialAvailability = new Map(
    materialOptions.map((option) => {
      const hasMatch =
        filterProducts(inStockProducts, {
          ...params,
          material: sanitizeDisplayText(option).trim(),
        }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const sizeAvailability = new Map(
    sizeSequence.map((option) => {
      const hasMatch =
        filterProducts(inStockProducts, {
          ...params,
          size: sanitizeDisplayText(option).trim(),
        }).length > 0;
      return [normalizeText(option), hasMatch] as const;
    })
  );
  const activeFilterGroup =
    novidadesFilterGroups.find((group) => normalizeText(group.category) === activeCategory) ?? null;
  const novidadesTiles = buildNovidadesTiles(sorted, activeFilterGroup ? "category" : "default");
  const activeSortLabel = getSortLabel(sortValue);
  const novidadesBackLabel = "< Voltar";
  const shouldKeepCategoryOnBack = novidadesFilterGroups.length === 1;
  const fallbackSingleGroup = novidadesFilterGroups.length === 1 ? novidadesFilterGroups[0] : null;
  const allCategoriesHref =
    fallbackSingleGroup && !normalizeText(params.gender)
      ? buildProductsHref(params, {
          category: fallbackSingleGroup.category,
          subcategory: null,
        })
      : buildProductsHref(params, { category: null, subcategory: null });
  const isGenderMenuView =
    !normalizedView && (normalizeText(params.gender) === "feminino" || normalizeText(params.gender) === "masculino");
  const shouldUseExpandedToolbar = Boolean(activeFilterGroup) && !isGenderMenuView;
  const hasProductsToolbar = novidadesFilterGroups.length > 0;

  if ((heroConfig || hasProductsToolbar) && !hasSearchQuery) {
    const headerStackHeight = "calc(var(--top-bar-height, 38px) + var(--header-height, 84px))";
    const toolbarHeight = hasProductsToolbar
      ? shouldUseExpandedToolbar
        ? "var(--novidades-toolbar-height-expanded, 64px)"
        : "var(--novidades-toolbar-height, 40px)"
      : "0px";
    const toolbarAttachOffset = hasProductsToolbar ? "var(--novidades-toolbar-attach-offset, 10px)" : "0px";
    const attachedHeaderHeight = `calc(${headerStackHeight} - ${toolbarAttachOffset})`;
    const heroOffset = `calc(${attachedHeaderHeight} + ${toolbarHeight})`;
    const viewportHeight = `calc(100dvh - ${attachedHeaderHeight} - ${toolbarHeight})`;

    return (
      <main>
        <BodyClassName className="products-novidades-view" />

        {hasProductsToolbar ? (
          <section
            className={`${styles.novidadesToolbarSection} ${shouldUseExpandedToolbar ? styles.novidadesToolbarSectionExpanded : ""}`}
            aria-label="Filtros de produtos"
          >
            <div className={styles.novidadesToolbarInner}>
              <div className={styles.novidadesFiltersLeft}>
                {activeFilterGroup && !isGenderMenuView ? (
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
                ) : !activeFilterGroup ? (
                  <div className={styles.novidadesCategoriesRow}>
                    <a
                      href={allCategoriesHref}
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
                ) : null}

                {activeFilterGroup ? (
                  <div
                    className={`${styles.novidadesSubcategoriesRow} ${isGenderMenuView ? styles.novidadesSubcategoriesRowCompact : ""}`}
                  >
                    <a
                      href={buildProductsHref(params, {
                        category: shouldKeepCategoryOnBack ? activeFilterGroup.category : null,
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
                          {sanitizeDisplayText(subcategory)}
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className={styles.novidadesActionsRight}>
                <details className={styles.novidadesSortGroup}>
                  <summary className={styles.novidadesSortToggle}>
                    <span>{sanitizeDisplayText(activeSortLabel)}</span>
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
                          {sanitizeDisplayText(option.label)}
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
                        {collectionOptions.length > 0 ? (
                          <div className={styles.novidadesFiltersTwoColumns}>
                            {collectionOptions.map((collectionOption) => {
                              const isActive = activeCollectionsSet.has(normalizeText(collectionOption));
                              const isUnavailable = !isActive && !collectionAvailability.get(normalizeText(collectionOption));
                              const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                              if (isUnavailable) {
                                return (
                                  <span key={collectionOption} className={optionClassName} aria-disabled="true">
                                    <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(collectionOption)}</span>
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
                                  <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(collectionOption)}</span>
                                  {isActive ? renderProductsSelectedMark() : null}
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
                        {colorOptions.length > 0 ? (
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
                                      <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(colorOption)}</span>
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
                                    <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(colorOption)}</span>
                                    {isActive ? renderProductsSelectedMark() : null}
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
                                          <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(colorOption)}</span>
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
                                        <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(colorOption)}</span>
                                        {isActive ? renderProductsSelectedMark() : null}
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
                        {materialOptions.length > 0 ? (
                          <div className={styles.novidadesFiltersExpandableBlock}>
                            <div className={styles.novidadesFiltersTwoColumns}>
                              {visibleMaterials.map((materialOption) => {
                                const isActive = activeMaterialsSet.has(normalizeText(materialOption));
                                const isUnavailable = !isActive && !materialAvailability.get(normalizeText(materialOption));
                                const optionClassName = `${styles.novidadesFiltersOption} ${isActive ? styles.novidadesFiltersOptionActive : ""} ${isUnavailable ? styles.novidadesFiltersOptionUnavailable : ""}`;
                                if (isUnavailable) {
                                  return (
                                    <span key={materialOption} className={optionClassName} aria-disabled="true">
                                      <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(materialOption)}</span>
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
                                    <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(materialOption)}</span>
                                    {isActive ? renderProductsSelectedMark() : null}
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
                                          <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(materialOption)}</span>
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
                                        <span className={styles.novidadesFiltersOptionLabel}>{sanitizeDisplayText(materialOption)}</span>
                                        {isActive ? renderProductsSelectedMark() : null}
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
                                    {sanitizeDisplayText(sizeOption)}
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
                                  {sanitizeDisplayText(sizeOption)}
                                  {isActive ? renderProductsSelectedMark() : null}
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
                                    {sanitizeDisplayText(sizeOption)}
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
                                  {sanitizeDisplayText(sizeOption)}
                                  {isActive ? renderProductsSelectedMark() : null}
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

        {heroConfig ? (
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
              <Image
                src={heroConfig.mediaUrl}
                alt={title}
                fill
                sizes="100vw"
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
        ) : null}

        <section
          aria-label={`Produtos da seção ${title}`}
          className={styles.novidadesSection}
          style={!heroConfig ? { marginTop: heroOffset } : undefined}
        >
          <NovidadesGrid tiles={novidadesTiles} />
        </section>

        <LegacyFooter variant="light" />
      </main>
    );
  }

  if (hasSearchQuery || !hasRawParams) {
    const searchSuggestionLinks = buildSearchSuggestionLinks(params, sorted);
    const searchSidebarSizeOptions = buildSearchSidebarSizeOptions(params, filteredForFacets, orderedSizes, activeSizes);
    const searchSidebarMaterialOptions = materialOptions;
    const exclusiveSuggestionFallbackCards = buildExclusiveSuggestionFallbackCards(
      filteredForFacets.length > 0 ? filteredForFacets : products
    ).slice(0, 6);
    const exclusiveSuggestionContextHint = [
      String(params.q || "").trim(),
      String(params.gender || "").trim(),
      String(params.category || "").trim(),
      String(params.subcategory || "").trim(),
    ]
      .filter(Boolean)
      .join(" ");

    const searchGridItems: ProductsSearchGridItem[] = sorted.map((product, index) => {
      const productName = shortenProductsTitle(product.name) || product.id;
      const productHref = `/product/${encodeURIComponent(product.id)}`;
      const allImages = collectProductMedia(product).slice(0, 5);
      return {
        key: `${product.id}-${index}`,
        id: String(product.id || "").trim(),
        name: productName,
        href: productHref,
        category: String(product.category || "").trim(),
        currency: String(product.currency || "brl"),
        unitAmount: Number(product.unitAmount || 0),
        images: allImages,
        isEditorial: index > 0 && index % 9 === 0,
      };
    });

    const activeSearchSort = normalizeSortParam(params.sort);
    const toolbarSortLinks = [
      { href: buildProductsHref(params, { sort: null }), label: "Ordenação", active: !activeSearchSort },
      ...NOVIDADES_SORT_OPTIONS.map((option) => ({
        href: buildProductsHref(params, { sort: option.value }),
        label: option.label,
        active: option.value === activeSearchSort,
      })),
    ];
    const filterClearHref = buildProductsHref(params, {
      collection: null,
      color: null,
      size: null,
      material: null,
      gender: null,
      sort: null,
    });
    const mobileFilterPanel = (
      <ProductsMobileFilterPanel resultsCount={sorted.length} clearHref={filterClearHref}>
        {renderProductsFilterBody(
          params,
          collectionOptions,
          colorOptions,
          searchSidebarSizeOptions,
          searchSidebarMaterialOptions,
          collectionAvailability,
          colorAvailability,
          materialAvailability,
          sizeAvailability,
          {
            query: String(params.q || "").trim(),
            contextHint: exclusiveSuggestionContextHint,
            fallbackCards: exclusiveSuggestionFallbackCards,
          }
        )}
      </ProductsMobileFilterPanel>
    );

    return (
      <main>
        <BodyClassName className="products-novidades-view" />
        {renderRootProductsToolbar("novidades-filtros-toggle", searchSuggestionLinks, false, sorted.length, String(params.q || "").trim(), toolbarSortLinks, mobileFilterPanel)}
        <section className={styles.productsSearchLayout} aria-label="Resultado de busca">
          {renderProductsSearchSidebar(
            params,
            collectionOptions,
            colorOptions,
            searchSidebarSizeOptions,
            searchSidebarMaterialOptions,
            collectionAvailability,
            colorAvailability,
            materialAvailability,
            sizeAvailability,
            {
            query: String(params.q || "").trim(),
            contextHint: exclusiveSuggestionContextHint,
            fallbackCards: exclusiveSuggestionFallbackCards,
            }
          )}

          <div className={styles.productsSearchGridArea}>
            {sorted.length > 0 ? (
              <ProductsSearchGrid items={searchGridItems} />
            ) : (
              <p className={styles.productsSearchEmpty}>Nenhum produto encontrado para os filtros selecionados.</p>
            )}
          </div>
        </section>
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



