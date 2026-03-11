import { BodyClassName } from "@/components/BodyClassName";
import { LegacyHome } from "@/components/home-legacy/LegacyHome";
import { listProducts } from "@/services/products";
import type { Product } from "@/types";
import styles from "@/app/home-legacy/page.module.css";

export const revalidate = 60;

async function loadProducts(): Promise<Product[]> {
  try {
    return await listProducts();
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const products = await loadProducts();
  return (
    <div className={styles.route}>
      <BodyClassName className="home-legacy-page" />
      <LegacyHome products={products} />
    </div>
  );
}
