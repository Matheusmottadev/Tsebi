import { get, HttpError } from "@/lib/http";
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
