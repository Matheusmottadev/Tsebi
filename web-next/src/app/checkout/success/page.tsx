"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/lib/cart/cartStore";

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const clearCart = useCartStore((state) => state.clear);

  useEffect(() => {
    clearCart();
    router.replace("/");
  }, [clearCart, router]);

  return null;
}

