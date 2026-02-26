"use client";

import Link from "next/link";
import { useMemo } from "react";
import styles from "./page.module.css";

export default function CheckoutFailurePage() {
  const message = useMemo(() => {
    if (typeof window === "undefined") return "";
    const searchParams = new URLSearchParams(window.location.search);
    return String(searchParams.get("message") || "").trim();
  }, []);
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
    const params = new URLSearchParams();
    params.set("status", "failed");
    if (message) params.set("message", message);
    if (orderId) params.set("orderId", orderId);
    if (orderEmail) params.set("email", orderEmail);
    return `/payment-result?${params.toString()}`;
  }, [message, orderEmail, orderId]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.card}>
          <p className={styles.kicker}>Payment</p>
          <h1>Payment could not be completed</h1>
          <p>{message || "Please review your payment details and try again."}</p>
          <div className={styles.actions}>
            <Link href="/checkout" className={styles.primaryLink}>
              Try again
            </Link>
            <Link href={paymentResultHref} className={styles.secondaryLink}>
              Ver tela de resultado
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
