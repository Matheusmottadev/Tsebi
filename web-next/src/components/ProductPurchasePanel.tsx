"use client";

import { useMemo, useState } from "react";
import { buildVariantSnapshot, getProductVariantOptions, getVariantStockQty } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { Price } from "@/components/Price";
import type { Product } from "@/types";
import styles from "./ProductPurchasePanel.module.css";

type ProductPurchasePanelProps = {
  product: Product;
};

function clampQty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.floor(value)));
}

export function ProductPurchasePanel({ product }: ProductPurchasePanelProps) {
  const addItem = useCartStore((state) => state.addItem);
  const clearError = useCartStore((state) => state.clearError);
  const { colors, sizes, hasVariantChoices } = useMemo(() => getProductVariantOptions(product), [product]);

  const [selectedColor, setSelectedColor] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");

  const colorRequired = colors.length > 0;
  const sizeRequired = sizes.length > 0;
  const variantSelected = (!colorRequired || Boolean(selectedColor)) && (!sizeRequired || Boolean(selectedSize));
  const selectedVariantStock = useMemo(
    () => getVariantStockQty(product, { color: selectedColor || null, size: selectedSize || null }),
    [product, selectedColor, selectedSize]
  );

  const canAdd = hasVariantChoices ? variantSelected && selectedVariantStock > 0 : selectedVariantStock > 0;

  const handleAddToCart = () => {
    if (!canAdd) return;
    clearError();
    const variant = buildVariantSnapshot({
      color: selectedColor || null,
      size: selectedSize || null,
    });

    const result = addItem({
      item: {
        productId: product.id,
        name: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        imageUrl: product.image || null,
        variant,
      },
      qty: clampQty(qty),
    });

    setMessage(result.ok ? "Added to cart" : result.error || "Could not add item");
    window.setTimeout(() => setMessage(""), 1700);
  };

  return (
    <>
      <p className={styles.collection}>{product.collection}</p>
      <h1 className={styles.title}>{product.name}</h1>
      <Price amountCents={product.unitAmount} currency={product.currency} className={styles.price} />

      <p className={styles.metaLine}>
        <strong>Category:</strong> {product.category}
      </p>
      <p className={styles.metaLine}>
        <strong>Material:</strong> {product.material}
      </p>
      <p className={styles.metaLine}>
        <strong>Gender:</strong> {product.gender}
      </p>

      <div className={styles.variantArea}>
        {colorRequired ? (
          <label className={styles.field}>
            <span>Color</span>
            <select value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)}>
              <option value="">Select color</option>
              {colors.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {sizeRequired ? (
          <label className={styles.field}>
            <span>Size</span>
            <select value={selectedSize} onChange={(event) => setSelectedSize(event.target.value)}>
              <option value="">Select size</option>
              {sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className={styles.buyRow}>
        <label className={styles.qtyField}>
          <span>Qty</span>
          <input
            type="number"
            min={1}
            max={99}
            value={qty}
            onChange={(event) => setQty(clampQty(Number(event.target.value || 1)))}
          />
        </label>

        <button type="button" className={styles.addToCartButton} onClick={handleAddToCart} disabled={!canAdd}>
          Add to cart
        </button>
      </div>

      {message ? <p className={styles.message}>{message}</p> : null}
      {hasVariantChoices && !variantSelected ? <p className={styles.hint}>Select required options before adding to cart.</p> : null}
      {canAdd ? <p className={styles.hint}>In stock: {selectedVariantStock}</p> : null}
      {variantSelected && selectedVariantStock <= 0 ? <p className={styles.hint}>Selected variant is out of stock.</p> : null}
    </>
  );
}
