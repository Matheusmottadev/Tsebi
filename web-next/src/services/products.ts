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

function buildRecentProductsPath(ids: string[]): string {
  const validIds = ids.map((id) => String(id || "").trim()).filter(Boolean);
  const params = new URLSearchParams();
  params.set("ids", validIds.join(","));
  return `/api/products/recent?${params.toString()}`;
}

/**
 * GET /api/products or GET /api/products/recent
 * Auth: public.
 */
export async function listProducts(params: ListProductsParams = {}): Promise<Product[]> {
  const recentIds = Array.isArray(params.recentIds) ? params.recentIds : [];
  if (recentIds.length > 0) {
    const response = await get<{ products: Product[] }>(buildRecentProductsPath(recentIds));
    return Array.isArray(response.products) ? response.products : [];
  }
  return get<Product[]>("/api/products");
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

  const response = await get<SearchProductsResponse>(`/api/products/search?${search.toString()}`);
  return {
    query: String(response?.query || normalized),
    page: Math.max(1, Number(response?.page || page) || page),
    limit: Math.max(1, Number(response?.limit || limit) || limit),
    source: String(response?.source || "postgres"),
    found: Math.max(0, Number(response?.found || 0) || 0),
    products: Array.isArray(response?.products) ? response.products : [],
    suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
    suggestedQuery: response?.suggestedQuery ? String(response.suggestedQuery) : null,
    curatedProducts: Array.isArray(response?.curatedProducts) ? response.curatedProducts : []
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
  const response = await get<SearchSuggestionsResponse>(`/api/products/search/suggestions?${search.toString()}`);
  return {
    query: String(response?.query || normalized),
    suggestions: Array.isArray(response?.suggestions) ? response.suggestions : [],
    suggestedQuery: response?.suggestedQuery ? String(response.suggestedQuery) : null,
    curatedProducts: Array.isArray(response?.curatedProducts) ? response.curatedProducts : []
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

  const response = await get<PersonalizedProductsResponse>(`/api/recommendations?${search.toString()}`);
  return {
    title: String(response?.title || "Seleção personalizada"),
    source: response?.source === "best_sellers" ? "best_sellers" : "personalized",
    products: Array.isArray(response?.products) ? response.products : [],
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
    return await get<Product>(`/api/products/${encodeURIComponent(idOrSlug)}`);
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
  return get<ProductRecommendationsResponse>(
    `/api/products/${encodeURIComponent(idOrSlug)}/recommendations?limit=${safeLimit}`
  );
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
