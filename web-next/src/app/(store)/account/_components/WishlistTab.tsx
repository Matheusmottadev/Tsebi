"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { del, get } from "@/lib/http";
import styles from "../account.module.css";

interface WishlistItem {
  id: string;
  productId?: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  currency?: string;
}

interface WishlistResponse {
  items?: WishlistItem[];
  wishlist?: WishlistItem[];
}

function formatBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function WishlistTab() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    get<WishlistResponse>("/api/wishlist")
      .then((res) => {
        setItems(res.items ?? res.wishlist ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const handleRemove = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    try {
      await del(`/api/wishlist/${encodeURIComponent(id)}`);
    } catch {
      // optimistic — revert on error if needed
    }
  };

  if (loading) return <div className={styles.loading}>Carregando lista de desejos…</div>;

  if (error || !items.length) {
    return (
      <div className={styles.emptyState}>
        <p className={styles.emptyTitle}>Sua lista de desejos está vazia</p>
        <p className={styles.emptyDesc}>
          Adicione peças favoritas para salvá-las aqui.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wishGrid}>
      {items.map((item) => (
        <div key={item.id} className={styles.wishCard}>
          <div className={styles.wishImgWrap}>
            {item.imageUrl ? (
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                style={{ objectFit: "cover" }}
              />
            ) : null}
            <button
              type="button"
              className={styles.wishRemove}
              onClick={() => handleRemove(item.id)}
              aria-label="Remover da lista"
            >
              ✕
            </button>
          </div>
          <p className={styles.wishName}>{item.name}</p>
          <p className={styles.wishPrice}>{formatBRL(item.price)}</p>
          <div className={styles.wishActions}>
            <button type="button" className={`${styles.btnPill} ${styles.btnPillFilled} ${styles.btnSmall}`}>
              Adicionar ao carrinho
            </button>
            <button type="button" className={`${styles.btnPill} ${styles.btnSmall}`}>
              Ver produto
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
