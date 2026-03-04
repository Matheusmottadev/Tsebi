import type { Metadata } from "next";
import { LegacyHome } from "@/components/home-legacy/LegacyHome";
import { BodyClassName } from "@/components/BodyClassName";
import { listProducts } from "@/services/products";
import type { Product } from "@/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Tsebi Brasil",
  description: "Moda autoral premium com Peças exclusivas, acabamento impecavel e coleções de luxo.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Tsebi Brasil",
    description: "Moda autoral premium com Peças exclusivas, acabamento impecavel e coleções de luxo.",
    url: "/",
    type: "website",
  },
};

async function loadProducts(): Promise<Product[]> {
  try {
    return await listProducts();
  } catch {
    return [];
  }
}

export default async function HomeLegacyPage() {
  const products = await loadProducts();
  return (
    <div className={styles.route}>
      <BodyClassName className="home-legacy-page" />
      <LegacyHome products={products} />
    </div>
  );
}

