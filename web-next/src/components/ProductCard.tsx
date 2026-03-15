"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { buildVariantSnapshot, canQuickAddWithoutSelection, getProductVariantOptions } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { collectProductMedia } from "@/lib/product-media";
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
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const isSwipingRef = useRef(false);

  const { colors, sizes } = useMemo(() => getProductVariantOptions(product), [product]);
  const images = useMemo(() => collectProductMedia(product).slice(0, 5), [product]);
  const quickAddEnabled = canQuickAddWithoutSelection(product);
  const quickAddVariant = useMemo(
    () => buildVariantSnapshot({ color: colors[0] || null, size: sizes[0] || null }),
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

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    isSwipingRef.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) > 30) {
      isSwipingRef.current = true;
      setActiveIndex((prev) =>
        deltaX < 0 ? Math.min(prev + 1, images.length - 1) : Math.max(prev - 1, 0)
      );
    }
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    if (isSwipingRef.current) {
      e.preventDefault();
      isSwipingRef.current = false;
    }
  };

  return (
    <article
      className={styles.card}
      onMouseEnter={() => images.length > 1 && setActiveIndex((prev) => (prev === 0 ? 1 : prev))}
      onMouseLeave={() => setActiveIndex(0)}
    >
      <Link
        href={`/product/${encodeURIComponent(product.id)}`}
        className={styles.imageLink}
        onClick={handleLinkClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {images.map((src, i) => (
          <ProductImage
            key={src}
            src={src}
            alt={i === 0 ? product.name : `${product.name} - foto ${i + 1}`}
            className={`${styles.image}${i === activeIndex ? ` ${styles.imageActive}` : ""}`}
            imageBaseUrl={imageBaseUrl}
            priority={priority && i === 0}
          />
        ))}
        {images.length > 1 && (
          <div className={styles.dots} aria-hidden="true">
            {images.map((_, i) => (
              <span
                key={i}
                className={`${styles.dot}${i === activeIndex ? ` ${styles.dotActive}` : i < activeIndex ? ` ${styles.dotDone}` : ""}`}
              />
            ))}
          </div>
        )}
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
