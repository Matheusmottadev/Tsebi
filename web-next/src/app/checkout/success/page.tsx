"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import styles from "./page.module.css";

export default function CheckoutSuccessPage() {
  const orderId = useMemo(() => {
    if (typeof window === "undefined") return "";
    const searchParams = new URLSearchParams(window.location.search);
    return String(searchParams.get("orderId") || "").trim();
  }, []);
  const orderEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const searchParams = new URLSearchParams(window.location.search);
    return String(searchParams.get("email") || "").trim().toLowerCase();
  }, []);
  const paymentResultHref = useMemo(() => {
    if (!orderId && !orderEmail) return "/legacy/pages/payment-result.html";
    const params = new URLSearchParams();
    if (orderId) params.set("orderId", orderId);
    if (orderEmail) params.set("email", orderEmail);
    return `/legacy/pages/payment-result.html?${params.toString()}`;
  }, [orderId, orderEmail]);
  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const clear = useCartStore((state) => state.clear);

  useEffect(() => {
    if (!hasHydrated) return;
    clear();
  }, [hasHydrated, clear]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.kicker}>Payment</p>
          <h1>Payment confirmed</h1>
          <p>Payment received. Order is being processed.</p>
          {orderId ? <p className={styles.meta}>Order ID: {orderId}</p> : null}
          <div className={styles.actions}>
            <Link href={paymentResultHref} className={styles.primaryLink}>
              Ver resultado do pagamento
            </Link>
            <Link href="/" className={styles.primaryLink}>
              Back to home
            </Link>
            <Link href="/cart" className={styles.secondaryLink}>
              Back to cart
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
