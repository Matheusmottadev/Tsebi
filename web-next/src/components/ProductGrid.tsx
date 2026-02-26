import type { Product } from "@/types";
import { ProductCard } from "@/components/ProductCard";
import styles from "./ProductGrid.module.css";

type ProductGridProps = {
  products: Product[];
  title?: string;
  description?: string;
  imageBaseUrl?: string;
  emptyMessage?: string;
};

export function ProductGrid({
  products,
  title,
  description,
  imageBaseUrl,
  emptyMessage = "Nenhum produto disponivel no momento.",
}: ProductGridProps) {
  const safeProducts = Array.isArray(products) ? products : [];

  return (
    <section className={styles.section}>
      {title ? <h2 className={styles.title}>{title}</h2> : null}
      {description ? <p className={styles.description}>{description}</p> : null}
      {safeProducts.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <div className={styles.grid}>
          {safeProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} imageBaseUrl={imageBaseUrl} priority={index < 2} />
          ))}
        </div>
      )}
    </section>
  );
}
