import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutClient } from "@/components/checkout/CheckoutClient";
import { isCheckoutEnabled } from "@/lib/env";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Checkout | TSEBI",
  description: "Checkout migration safety page.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/checkout",
  },
};

export default function CheckoutPage() {
  const checkoutEnabled = isCheckoutEnabled();

  if (!checkoutEnabled) {
    return (
      <div className={styles.page}>
        <main className={styles.main}>
          <section className={styles.card}>
            <p className={styles.kicker}>Maintenance</p>
            <h1>Checkout disabled (maintenance)</h1>
            <p>Checkout is temporarily blocked while migration safety is active.</p>
            <Link href="/cart" className={styles.primaryLink}>
              Back to cart
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <CheckoutClient />
      </main>
    </div>
  );
}
