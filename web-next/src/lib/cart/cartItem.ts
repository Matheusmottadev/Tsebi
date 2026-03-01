import type { CartItemVariantSnapshot, Product } from "@/types";

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeOption(value: string): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

export function buildVariantStockKey(color?: string | null, size?: string | null): string | null {
  const safeColor = normalizeOption(color || "");
  const safeSize = normalizeOption(size || "");
  if (!safeColor || !safeSize) return null;
  return `${safeColor}__${safeSize}`;
}

export function getProductVariantOptions(product: Product): {
  colors: string[];
  sizes: string[];
  hasVariantChoices: boolean;
} {
  const colors = uniqueValues(Array.isArray(product.colors) ? product.colors : []);
  const sizes = uniqueValues(Array.isArray(product.sizes) ? product.sizes : []);
  const hasVariantChoices = colors.length > 0 || sizes.length > 0;
  return { colors, sizes, hasVariantChoices };
}

export function canQuickAddWithoutSelection(product: Product): boolean {
  const { colors, sizes } = getProductVariantOptions(product);
  return colors.length <= 1 && sizes.length <= 1;
}

export function buildVariantSnapshot(params: {
  color?: string | null;
  size?: string | null;
}): CartItemVariantSnapshot | null {
  const color = normalizeOption(params.color || "");
  const size = normalizeOption(params.size || "");
  if (!color && !size) return null;

  const variantId = `color:${color || "-"}|size:${size || "-"}`;
  const variantName = [color, size].filter(Boolean).join(" / ");

  return {
    variantId,
    variantName: variantName || null,
    color,
    size,
  };
}

export function getVariantStockQty(product: Product, params: { color?: string | null; size?: string | null }): number {
  const key = buildVariantStockKey(params.color || null, params.size || null);
  const map =
    product?.variantStock && typeof product.variantStock === "object" && !Array.isArray(product.variantStock)
      ? product.variantStock
      : {};

  if (key && Object.prototype.hasOwnProperty.call(map, key)) {
    return Math.max(0, Number(map[key] || 0));
  }

  return Math.max(0, Number(product.stock || 0));
}
