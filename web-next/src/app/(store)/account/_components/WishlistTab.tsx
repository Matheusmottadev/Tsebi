"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "../account.module.css";
import { getFavorites, updateFavorites } from "@/services/auth";
import { listProducts } from "@/services/products";
import type { Product } from "@/types";

interface WishlistItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  currency?: string;
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function resolveWishlistImageSrc(imageUrl?: string | null): string | null {
  const raw = String(imageUrl || "").trim();
  if (!raw) return null;

  if (raw.startsWith("data:")) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  return `/${raw.replace(/^\.?\//, "")}`;
}

function resolveWishlistItem(product: Product): WishlistItem | null {
  const id = String(product.sku || product.id || "").trim();
  if (!id) return null;

  return {
    id,
    productId: String(product.id || id).trim(),
    name: String(product.name || "Produto Tsebi"),
    price: Number(product.unitAmount || 0),
    imageUrl: String(product.image || "").trim() || null,
    currency: String(product.currency || "BRL"),
  };
}

export function WishlistTab() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const favoritesResponse = await getFavorites({ cache: "no-store" });
        const favoriteIds = Array.isArray(favoritesResponse.favorites) ? favoritesResponse.favorites : [];

        if (favoriteIds.length === 0) {
          if (!cancelled) setItems([]);
          return;
        }

        const products = await listProducts({ recentIds: favoriteIds });
        if (cancelled) return;

        const productMap = new Map<string, WishlistItem>();
        products.forEach((product) => {
          const item = resolveWishlistItem(product);
          if (!item) return;
          productMap.set(item.id, item);
        });

        const orderedItems = favoriteIds
          .map((favoriteId) => productMap.get(String(favoriteId || "").trim()) || null)
          .filter((item): item is WishlistItem => Boolean(item));

        setItems(orderedItems);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRemove = async (id: string) => {
    const previousItems = items;
    const nextItems = previousItems.filter((item) => item.id !== id);
    setItems(nextItems);
    try {
      await updateFavorites(nextItems.map((item) => item.id));
    } catch {
      setItems(previousItems);
    }
  };

  if (loading) return <div className={styles.loading}>Carregando lista de desejos...</div>;

  if (error || !items.length) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>Sua lista de desejos esta vazia</p>
        <p className={styles.emptyDesc}>Adicione pecas favoritas para salva-las aqui.</p>
      </div>
    );
  }

  return (
    <div className={styles.wishGrid}>
      {items.map((item) => {
        const imageSrc = resolveWishlistImageSrc(item.imageUrl);

        return (
          <div key={item.id} className={styles.wishCard}>
            <div className={styles.wishImgWrap}>
              {imageSrc ? (
                <Link href={`/product/${encodeURIComponent(item.id)}`} aria-label={`Ver ${item.name}`}>
                  <img src={imageSrc} alt={item.name} className={styles.recImg} loading="lazy" />
                </Link>
              ) : null}
              <button
                type="button"
                className={styles.wishRemove}
                onClick={() => handleRemove(item.id)}
                aria-label="Remover da lista"
              >
                x
              </button>
            </div>
            <p className={styles.wishName}>{item.name}</p>
            <p className={styles.wishPrice}>{formatBRL(item.price)}</p>
            <div className={styles.wishActions}>
              <button type="button" className={`${styles.btnPill} ${styles.btnPillFilled} ${styles.btnSmall}`}>
                Adicionar ao carrinho
              </button>
              <Link href={`/product/${encodeURIComponent(item.id)}`} className={`${styles.btnPill} ${styles.btnSmall}`}>
                Ver produto
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
