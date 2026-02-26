import { get } from "@/lib/http";
import type { Product } from "@/types";

export type ApiSmokeCheckResult = {
  supported: true;
  reachable: boolean;
  message: string;
  productCount: number;
};

export async function smokeCheckApi(): Promise<ApiSmokeCheckResult> {
  const products = await get<Product[]>("/api/products");
  const productCount = Array.isArray(products) ? products.length : 0;
  return {
    supported: true,
    reachable: true,
    message: `API reachable via GET /api/products (${productCount} products).`,
    productCount,
  };
}
