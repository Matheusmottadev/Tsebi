import type { Metadata } from "next";
import { CartView } from "@/components/CartView";
import styles from "./page.module.css";

export const revalidate = 3600;

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
        <CartView />
      </main>
    </div>
  );
}
