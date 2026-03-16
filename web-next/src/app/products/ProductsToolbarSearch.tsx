"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Props = { initialQuery?: string };

export function ProductsToolbarSearch({ initialQuery = "" }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const q = query.trim();
      if (!q) return;
      const next = new URLSearchParams(searchParams?.toString() || "");
      next.set("q", q);
      router.push(`/products?${next.toString()}`);
    },
    [query, router, searchParams]
  );

  return (
    <form
      className={styles.productsToolbarSearch}
      role="search"
      aria-label="Buscar produtos"
      onSubmit={handleSubmit}
    >
      <span className={styles.productsToolbarSearchIcon} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
      </span>
      <input
        className={styles.productsToolbarSearchInput}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
        placeholder=""
      />
    </form>
  );
}
