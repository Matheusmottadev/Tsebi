"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { buildVariantSnapshot, canQuickAddWithoutSelection, getProductVariantOptions } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { buildHoverImagePair } from "@/lib/product-media";
import type { Product } from "@/types";
import { Price } from "@/components/Price";
import { ProductImage } from "@/components/ProductImage";
import styles from "./ProductCard.module.css";

type ProductCardProps = {
  product: Product;
  imageBaseUrl?: string;
  priority?: boolean;
};

export function ProductCard({ product, imageBaseUrl, priority = false }: ProductCardProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [feedback, setFeedback] = useState("");

  const { colors, sizes } = useMemo(() => getProductVariantOptions(product), [product]);
  const imagePair = useMemo(() => buildHoverImagePair(product), [product]);
  const quickAddEnabled = canQuickAddWithoutSelection(product);
  const quickAddVariant = useMemo(
    () =>
      buildVariantSnapshot({
        color: colors[0] || null,
        size: sizes[0] || null,
      }),
    [colors, sizes]
  );

  const handleQuickAdd = () => {
    const result = addItem({
      item: {
        productId: product.id,
        name: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        imageUrl: product.image || null,
        variant: quickAddVariant,
      },
      qty: 1,
    });

    setFeedback(result.ok ? "Added" : result.error || "Could not add");
    window.setTimeout(() => setFeedback(""), 1200);
  };

  return (
    <article className={styles.card}>
      <Link href={`/product/${encodeURIComponent(product.id)}`} className={styles.imageLink}>
        <ProductImage
          src={imagePair.primary}
          alt={product.name}
          className={`${styles.image} ${styles.imagePrimary}`}
          imageBaseUrl={imageBaseUrl}
          priority={priority}
        />
        <ProductImage
          src={imagePair.secondary}
          alt={`${product.name} - segunda foto`}
          className={`${styles.image} ${styles.imageSecondary}`}
          imageBaseUrl={imageBaseUrl}
          priority={priority}
        />
      </Link>
      <div className={styles.content}>
        <p className={styles.collection}>{product.collection}</p>
        <h3 className={styles.title}>
          <Link href={`/product/${encodeURIComponent(product.id)}`}>{product.name}</Link>
        </h3>
        <Price amountCents={product.unitAmount} currency={product.currency} className={styles.price} />
        <div className={styles.actions}>
          {quickAddEnabled ? (
            <button type="button" className={styles.quickAddButton} onClick={handleQuickAdd}>
              Quick add
            </button>
          ) : (
            <Link href={`/product/${encodeURIComponent(product.id)}`} className={styles.detailsLink}>
              Select options
            </Link>
          )}
          {feedback ? <span className={styles.feedback}>{feedback}</span> : null}
        </div>
      </div>
    </article>
  );
}
