import type { CartItemVariantSnapshot, Product } from "@/types";

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeOption(value: string): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
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
