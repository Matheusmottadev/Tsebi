import { create } from "zustand";
import { clearCartSnapshot, readCartSnapshot, writeCartSnapshot } from "@/lib/cart/storage";
import type { AddCartItemInput, CartItem, CartItemVariantSnapshot, CartSnapshot } from "@/types";

type SetQtyOptions = {
  productId: string;
  variantId?: string | null;
  qty: number;
};

type RemoveItemOptions = {
  productId: string;
  variantId?: string | null;
};

type AddItemOptions = {
  item: AddCartItemInput;
  qty?: number;
};

type AddItemResult = {
  ok: boolean;
  error?: string;
};

export type CartStore = {
  items: CartItem[];
  currency: string | null;
  hasHydrated: boolean;
  lastError: string | null;
  hydrateFromStorage: () => void;
  clearError: () => void;
  addItem: (options: AddItemOptions) => AddItemResult;
  removeItem: (options: RemoveItemOptions) => void;
  setQty: (options: SetQtyOptions) => void;
  replaceItems: (items: CartItem[], currency?: string | null) => void;
  clear: () => void;
};

function normalizeCurrency(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeVariant(input?: Partial<CartItemVariantSnapshot> | null): CartItemVariantSnapshot {
  return {
    variantId: input?.variantId ? String(input.variantId).trim() : null,
    variantName: input?.variantName ? String(input.variantName).trim() : null,
    size: input?.size ? String(input.size).trim() : null,
    color: input?.color ? String(input.color).trim() : null,
  };
}

function buildItemKey(productId: string, variantId: string | null): string {
  return `${productId}::${variantId || "base"}`;
}

function persistSnapshot(items: CartItem[], currency: string | null): void {
  const snapshot: CartSnapshot = {
    version: 1,
    currency,
    items,
  };
  writeCartSnapshot(snapshot);
}

function findItemIndex(items: CartItem[], productId: string, variantId: string | null): number {
  return items.findIndex(
    (item) => item.productId === productId && (item.variant.variantId || null) === (variantId || null)
  );
}

function buildCurrencyError(current: string, incoming: string): string {
  return `Currency mismatch: cart is '${current.toUpperCase()}' and item is '${incoming.toUpperCase()}'.`;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  currency: null,
  hasHydrated: false,
  lastError: null,

  hydrateFromStorage: () => {
    const snapshot = readCartSnapshot();
    if (!snapshot) {
      set({ items: [], currency: null, hasHydrated: true, lastError: null });
      return;
    }

    set({
      items: snapshot.items,
      currency: snapshot.currency,
      hasHydrated: true,
      lastError: null,
    });
  },

  clearError: () => set({ lastError: null }),

  addItem: ({ item, qty = 1 }) => {
    const productId = String(item.productId || "").trim();
    const name = String(item.name || "").trim();
    const currency = normalizeCurrency(item.currency);
    const unitAmount = Math.max(0, Math.floor(Number(item.unitAmount || 0)));
    const safeQty = Math.max(1, Math.floor(Number(qty || 1)));

    if (!productId || !name || !currency) {
      const error = "Invalid item.";
      set({ lastError: error });
      return { ok: false, error };
    }

    const currentCurrency = get().currency;
    if (currentCurrency && currentCurrency !== currency) {
      const error = buildCurrencyError(currentCurrency, currency);
      set({ lastError: error });
      return { ok: false, error };
    }

    const variant = normalizeVariant(item.variant);
    const variantId = variant.variantId;
    const key = buildItemKey(productId, variantId);

    const currentItems = get().items;
    const nextItems = [...currentItems];
    const index = findItemIndex(nextItems, productId, variantId);

    if (index >= 0) {
      const existing = nextItems[index];
      nextItems[index] = {
        ...existing,
        qty: existing.qty + safeQty,
      };
    } else {
      nextItems.push({
        key,
        productId,
        name,
        unitAmount,
        currency,
        imageUrl: item.imageUrl ? String(item.imageUrl) : null,
        qty: safeQty,
        variant,
      });
    }

    const nextCurrency = currentCurrency || currency;
    persistSnapshot(nextItems, nextCurrency);
    set({ items: nextItems, currency: nextCurrency, lastError: null });
    return { ok: true };
  },

  removeItem: ({ productId, variantId = null }) => {
    const currentItems = get().items;
    const nextItems = currentItems.filter(
      (item) => !(item.productId === productId && (item.variant.variantId || null) === (variantId || null))
    );
    const nextCurrency = nextItems[0]?.currency || null;
    if (nextItems.length === 0) {
      clearCartSnapshot();
    } else {
      persistSnapshot(nextItems, nextCurrency);
    }
    set({ items: nextItems, currency: nextCurrency, lastError: null });
  },

  setQty: ({ productId, variantId = null, qty }) => {
    const safeQty = Math.max(0, Math.floor(Number(qty || 0)));
    if (safeQty <= 0) {
      get().removeItem({ productId, variantId });
      return;
    }

    const nextItems = get().items.map((item) =>
      item.productId === productId && (item.variant.variantId || null) === (variantId || null)
        ? { ...item, qty: safeQty }
        : item
    );
    const nextCurrency = nextItems[0]?.currency || null;
    persistSnapshot(nextItems, nextCurrency);
    set({ items: nextItems, currency: nextCurrency, lastError: null });
  },

  replaceItems: (items, currency = null) => {
    const normalizedItems = Array.isArray(items) ? items : [];
    const nextCurrency = normalizedItems[0]?.currency || currency || null;
    if (normalizedItems.length === 0) {
      clearCartSnapshot();
      set({ items: [], currency: null, lastError: null });
      return;
    }
    persistSnapshot(normalizedItems, nextCurrency);
    set({ items: normalizedItems, currency: nextCurrency, lastError: null });
  },

  clear: () => {
    clearCartSnapshot();
    set({ items: [], currency: null, lastError: null });
  },
}));

export const cartSelectors = {
  items: (state: CartStore) => state.items,
  itemCount: (state: CartStore) => state.items.reduce((sum, item) => sum + Math.max(0, item.qty), 0),
  subtotal: (state: CartStore) =>
    state.items.reduce((sum, item) => sum + Math.max(0, item.qty) * Math.max(0, item.unitAmount), 0),
  currency: (state: CartStore) => state.currency,
  hasHydrated: (state: CartStore) => state.hasHydrated,
  lastError: (state: CartStore) => state.lastError,
};
