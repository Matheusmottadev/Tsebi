import { get, HttpError, post } from "@/lib/http";
import type { Product } from "@/types";

/*
Endpoint mapping used in this file:
- GET /api/products
- GET /api/products/:id
- GET /api/products/:id/recommendations
- GET /api/products/recent?ids=...
*/

export interface ListProductsParams {
  recentIds?: string[];
}

export interface ProductRecommendationsResponse {
  base: Product;
  recommendations: Product[];
}

export interface SearchProductsParams {
  limit?: number;
  page?: number;
  category?: string;
  collection?: string;
  gender?: string;
  inStock?: boolean;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc";
}

export interface SearchProductsResponse {
  query: string;
  page: number;
  limit: number;
  source: string;
  found: number;
  products: Product[];
  suggestions?: string[];
  suggestedQuery?: string | null;
  curatedProducts?: Product[];
}

export interface SearchSuggestionsResponse {
  query: string;
  suggestions: string[];
  suggestedQuery: string | null;
  curatedProducts: Product[];
}

export interface SearchEventPayload {
  type: "search_view" | "suggestion_click" | "result_click" | "did_you_mean_click" | "zero_result";
  query?: string;
  suggestion?: string;
  productSku?: string;
  position?: number;
  resultsCount?: number;
  pagePath?: string;
  source?: string;
}

export interface RecommendationSignalPayload {
  topCategory?: string;
  topClickedSku?: string;
  topPriceBand?: "low" | "mid" | "high" | "";
  searches?: string[];
  recentViewed?: string[];
  cartSkus?: string[];
}

export interface PersonalizedProductsResponse {
  title: string;
  source: "personalized" | "best_sellers";
  placement?: string;
  actorKey?: string;
  products: Product[];
  items?: Array<{
    product_id: string;
    name: string;
    price: number;
    image_url: string;
    category: string;
    link: string;
  }>;
}

const STOREFRONT_REVALIDATE_SECONDS = 60;

const STOREFRONT_CACHE_OPTIONS = {
  next: { revalidate: STOREFRONT_REVALIDATE_SECONDS },
} as const;

function buildRecentProductsPath(ids: string[]): string {
  const validIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  const params = new URLSearchParams();
  params.set("ids", validIds.join(","));
  return `/api/products/recent?${params.toString()}`;
}

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isSingleSizeAccessoryProduct(product: Product): boolean {
  const anyProduct = product as Product & { subcategory?: unknown; tags?: unknown };
  const tags = Array.isArray(anyProduct.tags) ? anyProduct.tags.map((entry) => String(entry || "")) : [];
  const haystack = [
    product.category,
    String(anyProduct.subcategory || ""),
    product.name,
    product.sku,
    ...tags,
  ]
    .map((entry) => normalizeText(entry))
    .join(" ");

  const isAccessoryCategory =
    normalizeText(product.category) === "accessories" || normalizeText(product.category) === "acessorios";
  const hasSingleSizeKeywords = /\b(bolsa|bolsas|bag|bags|cinto|cintos|belt|belts|carteira|carteiras|wallet|wallets)\b/.test(
    haystack
  );

  return isAccessoryCategory && hasSingleSizeKeywords;
}

function forceSingleSize(product: Product): Product {
  const currentSizes = Array.isArray(product.sizes) ? product.sizes : [];
  const hasOnlySingleSize =
    currentSizes.length === 1 && ["unico", "único"].includes(normalizeText(currentSizes[0]));
  if (hasOnlySingleSize) return product;

  const nextProduct: Product = {
    ...product,
    sizes: ["Unico"],
  };

  const variantStockEntries = Object.entries(product.variantStock || {});
  if (variantStockEntries.length === 0) return nextProduct;

  const byColor = new Map<string, number>();
  variantStockEntries.forEach(([key, rawQty]) => {
    const qty = Math.max(0, Number(rawQty || 0));
    if (!qty) return;
    const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
    const color = String(parts[0] || "").trim();
    if (!color) return;
    byColor.set(color, (byColor.get(color) || 0) + qty);
  });

  if (byColor.size === 0) return nextProduct;

  const nextVariantStock: Record<string, number> = {};
  byColor.forEach((qty, color) => {
    nextVariantStock[`${color}__Unico`] = qty;
  });
  nextProduct.variantStock = nextVariantStock;
  return nextProduct;
}

function normalizeProductForStorefront(product: Product): Product {
  if (!isSingleSizeAccessoryProduct(product)) return product;
  return forceSingleSize(product);
}

function normalizeProductsForStorefront(products: Product[]): Product[] {
  return (Array.isArray(products) ? products : []).map((product) => normalizeProductForStorefront(product));
}

/**
 * GET /api/products or GET /api/products/recent
 * Auth: public.
 */
export async function listProducts(params: ListProductsParams = {}): Promise<Product[]> {
  const recentIds = Array.isArray(params.recentIds) ? params.recentIds : [];
  if (recentIds.length > 0) {
    const response = await get<{ products: Product[] }>(buildRecentProductsPath(recentIds), STOREFRONT_CACHE_OPTIONS);
    return normalizeProductsForStorefront(Array.isArray(response.products) ? response.products : []);
  }
  const response = await get<Product[]>("/api/products", STOREFRONT_CACHE_OPTIONS);
  return normalizeProductsForStorefront(response);
}

/**
 * GET /api/products/search
 * Auth: public.
 */
export async function searchProducts(query: string, params: SearchProductsParams = {}): Promise<Product[]> {
  const result = await searchProductsDetailed(query, params);
  return result.products;
}

/**
 * GET /api/products/search
 * Auth: public.
 */
export async function searchProductsDetailed(
  query: string,
  params: SearchProductsParams = {}
): Promise<SearchProductsResponse> {
  const normalized = String(query || "").trim();
  if (!normalized) {
    return { query: "", page: 1, limit: 8, source: "none", found: 0, products: [], suggestions: [], suggestedQuery: null, curatedProducts: [] };
  }

  const limit = Math.max(1, Math.min(24, Number(params.limit || 8) || 8));
  const page = Math.max(1, Number(params.page || 1) || 1);
  const search = new URLSearchParams();
  search.set("q", normalized);
  search.set("limit", String(limit));
  search.set("page", String(page));
  if (params.category) search.set("category", String(params.category));
  if (params.collection) search.set("collection", String(params.collection));
  if (params.gender) search.set("gender", String(params.gender));
  if (typeof params.inStock === "boolean") search.set("inStock", params.inStock ? "true" : "false");
  if (params.sort) search.set("sort", params.sort);

  const response = await get<SearchProductsResponse>(`/api/products/search?${search.toString()}`, STOREFRONT_CACHE_OPTIONS);
  return {
    query: String(response?.query || normalized),
    page: Math.max(1, Number(response?.page || page) || page),
    limit: Math.max(1, Number(response?.limit || limit) || limit),
    source: String(response?.source || "postgres"),
    found: Math.max(0, Number(response?.found || 0) || 0),
    products: normalizeProductsForStorefront(Array.isArray(response?.products) ? response.products : []),
    suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
    suggestedQuery: response?.suggestedQuery ? String(response.suggestedQuery) : null,
    curatedProducts: normalizeProductsForStorefront(Array.isArray(response?.curatedProducts) ? response.curatedProducts : [])
  };
}

/**
 * GET /api/products/search/suggestions
 * Auth: public.
 */
export async function searchProductSuggestions(query: string, limit = 8): Promise<SearchSuggestionsResponse> {
  const normalized = String(query || "").trim();
  if (normalized.length < 2) {
    return { query: normalized, suggestions: [], suggestedQuery: null, curatedProducts: [] };
  }
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 8));
  const search = new URLSearchParams();
  search.set("q", normalized);
  search.set("limit", String(safeLimit));
  const response = await get<SearchSuggestionsResponse>(
    `/api/products/search/suggestions?${search.toString()}`,
    STOREFRONT_CACHE_OPTIONS
  );
  return {
    query: String(response?.query || normalized),
    suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
    suggestedQuery: response?.suggestedQuery ? String(response.suggestedQuery) : null,
    curatedProducts: normalizeProductsForStorefront(Array.isArray(response?.curatedProducts) ? response.curatedProducts : [])
  };
}

/**
 * GET /api/recommendations
 * Auth: public (session-aware if available)
 */
export async function getPersonalizedProducts(
  userId = "",
  limit = 8,
  signals: RecommendationSignalPayload = {},
  options: { anonId?: string; placement?: string } = {}
): Promise<PersonalizedProductsResponse> {
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 8));
  const search = new URLSearchParams();
  search.set("limit", String(safeLimit));
  search.set("placement", String(options.placement || "search"));
  const normalizedUserId = String(userId || "").trim();
  if (normalizedUserId) search.set("userId", normalizedUserId);
  const normalizedAnonId = String(options.anonId || "").trim();
  if (normalizedAnonId) search.set("anon_id", normalizedAnonId);
  const hasSignals =
    Boolean(signals.topCategory || signals.topClickedSku || signals.topPriceBand) ||
    (Array.isArray(signals.searches) && signals.searches.length > 0) ||
    (Array.isArray(signals.recentViewed) && signals.recentViewed.length > 0) ||
    (Array.isArray(signals.cartSkus) && signals.cartSkus.length > 0);
  if (hasSignals) {
    search.set("signals", JSON.stringify(signals));
  }

  const response = await get<PersonalizedProductsResponse>(`/api/recommendations?${search.toString()}`, {
    cache: "no-store",
  });
  return {
    title: String(response?.title || "Selecao personalizada"),
    source: response?.source === "best_sellers" ? "best_sellers" : "personalized",
    placement: response?.placement ? String(response.placement) : undefined,
    actorKey: response?.actorKey ? String(response.actorKey) : undefined,
    products: normalizeProductsForStorefront(Array.isArray(response?.products) ? response.products : []),
    items: Array.isArray(response?.items) ? response.items : undefined,
  };
}

/**
 * POST /api/products/search/events
 * Auth: public.
 */
export async function trackSearchEvent(payload: SearchEventPayload): Promise<void> {
  await post<{ ok: boolean }>("/api/products/search/events", {
    ...payload,
    pagePath: payload.pagePath || (typeof window !== "undefined" ? window.location.pathname : "")
  });
}

/**
 * GET /api/products/recent (if ids provided), fallback to GET /api/products.
 * Auth: public.
 */
export async function getRecentProducts(ids: string[] = []): Promise<Product[]> {
  const recentIds = Array.isArray(ids) ? ids : [];
  return listProducts(recentIds.length > 0 ? { recentIds } : {});
}

/**
 * GET /api/products/:id
 * Auth: public.
 */
export async function getProductBySlugOrId(idOrSlug: string): Promise<Product | null> {
  try {
    const response = await get<Product>(`/api/products/${encodeURIComponent(idOrSlug)}`, STOREFRONT_CACHE_OPTIONS);
    return normalizeProductForStorefront(response);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/**
 * Alias for storefront migration naming.
 * GET /api/products/:id
 * Auth: public.
 */
export async function getProduct(idOrSlug: string): Promise<Product | null> {
  return getProductBySlugOrId(idOrSlug);
}

/**
 * GET /api/products/:id/recommendations
 * Auth: public.
 */
export async function listProductRecommendations(idOrSlug: string, limit = 4): Promise<ProductRecommendationsResponse> {
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 4));
  const response = await get<ProductRecommendationsResponse>(
    `/api/products/${encodeURIComponent(idOrSlug)}/recommendations?limit=${safeLimit}`,
    STOREFRONT_CACHE_OPTIONS
  );
  return {
    ...response,
    base: normalizeProductForStorefront(response.base),
    recommendations: normalizeProductsForStorefront(Array.isArray(response.recommendations) ? response.recommendations : []),
  };
}

/**
 * Alias for storefront migration naming.
 * GET /api/products/:id/recommendations
 * Auth: public.
 */
export async function getRecommendations(idOrSlug: string, limit = 4): Promise<ProductRecommendationsResponse> {
  return listProductRecommendations(idOrSlug, limit);
}

/**
 * Derived from GET /api/products
 * Auth: public.
 * TODO: replace with dedicated backend endpoint when available.
 */
export async function listCategories(): Promise<string[]> {
  const products = await listProducts();
  return Array.from(new Set(products.map((item) => String(item.category || "").trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
}

/**
 * Derived from GET /api/products
 * Auth: public.
 * TODO: replace with dedicated backend endpoint when available.
 */
export async function listCollections(): Promise<string[]> {
  const products = await listProducts();
  return Array.from(new Set(products.map((item) => String(item.collection || "").trim()).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b)
  );
}
