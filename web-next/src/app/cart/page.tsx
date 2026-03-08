import type { Metadata } from "next";
import { CartView } from "@/components/CartView";
import { ContinueShoppingLink } from "@/components/ContinueShoppingLink";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Carrinho | TSEBI",
  description: "Revise os produtos selecionados antes de finalizar a compra.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/cart",
  },
};

export default function CartPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Carrinho</p>
          <h1>Sua sacola</h1>
          <p>Ajuste quantidades e revise o subtotal. O checkout segue desativado nesta fase.</p>
          <ContinueShoppingLink className={styles.backLink} />
        </section>

        <CartView />
      </main>
    </div>
  );
}
