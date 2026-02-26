import type { CartItem, CartSnapshot } from "@/types";

export const CART_STORAGE_KEY = "tsebi.web_next.cart.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : null;
}

function asPositiveInt(value: unknown, fallback = 1): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function parseCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) return null;
  const variant = isRecord(value.variant) ? value.variant : {};

  const productId = asString(value.productId).trim();
  const name = asString(value.name).trim();
  const currency = asString(value.currency).trim().toLowerCase();
  const unitAmount = Math.max(0, Math.floor(Number(value.unitAmount || 0)));
  const qty = asPositiveInt(value.qty, 1);
  const variantId = asNullableString(variant.variantId);
  const key = asString(value.key).trim() || `${productId}::${variantId || "base"}`;

  if (!productId || !name || !currency) return null;

  return {
    key,
    productId,
    name,
    unitAmount,
    currency,
    imageUrl: asNullableString(value.imageUrl),
    qty,
    variant: {
      variantId,
      variantName: asNullableString(variant.variantName),
      size: asNullableString(variant.size),
      color: asNullableString(variant.color),
    },
  };
}

function parseCartSnapshot(value: unknown): CartSnapshot | null {
  if (!isRecord(value)) return null;
  if (Number(value.version) !== 1) return null;

  const itemsRaw = Array.isArray(value.items) ? value.items : [];
  const items = itemsRaw.map(parseCartItem).filter((item): item is CartItem => Boolean(item));
  const currency = asNullableString(value.currency);

  return {
    version: 1,
    currency: currency ? currency.toLowerCase() : null,
    items,
  };
}

export function readCartSnapshot(): CartSnapshot | null {
  if (!isBrowser()) return null;

  let raw = "";
  try {
    raw = window.localStorage.getItem(CART_STORAGE_KEY) || "";
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    const snapshot = parseCartSnapshot(parsed);
    if (!snapshot) {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return null;
    }
    return snapshot;
  } catch {
    try {
      window.localStorage.removeItem(CART_STORAGE_KEY);
    } catch {}
    return null;
  }
}

export function writeCartSnapshot(snapshot: CartSnapshot): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

export function clearCartSnapshot(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {}
}
