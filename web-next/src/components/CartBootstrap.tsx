"use client";

import { useEffect } from "react";
import { useCartStore } from "@/lib/cart/cartStore";

export function CartBootstrap() {
  const hydrateFromStorage = useCartStore((state) => state.hydrateFromStorage);
  const hasHydrated = useCartStore((state) => state.hasHydrated);

  useEffect(() => {
    if (hasHydrated) return;
    hydrateFromStorage();
  }, [hasHydrated, hydrateFromStorage]);

  return null;
}
