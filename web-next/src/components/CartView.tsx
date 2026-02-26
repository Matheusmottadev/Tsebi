"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { isCheckoutEnabled } from "@/lib/env";
import { getMe } from "@/services/auth";
import styles from "./CartView.module.css";

function getVariantLabel(item: { variant: { variantName: string | null; color: string | null; size: string | null } }) {
  if (item.variant.variantName) return item.variant.variantName;

  const parts = [item.variant.color, item.variant.size].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(" / ");
}

export function CartView() {
  const checkoutEnabled = isCheckoutEnabled();
  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const items = useCartStore(cartSelectors.items);
  const subtotal = useCartStore(cartSelectors.subtotal);
  const currency = useCartStore(cartSelectors.currency) || "brl";
  const lastError = useCartStore(cartSelectors.lastError);
  const setQty = useCartStore((state) => state.setQty);
  const removeItem = useCartStore((state) => state.removeItem);
  const clear = useCartStore((state) => state.clear);
  const clearError = useCartStore((state) => state.clearError);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const imageBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  useEffect(() => {
    let isMounted = true;

    async function loadAuthState() {
      try {
        const user = await getMe({ cache: "no-store" });
        if (!isMounted) return;
        setIsAuthenticated(Boolean(user));
      } catch {
        if (!isMounted) return;
        setIsAuthenticated(false);
      }
    }

    loadAuthState();
    return () => {
      isMounted = false;
    };
  }, []);

  if (!hasHydrated) {
    return (
      <section className={styles.empty}>
        <h2>Carregando carrinho...</h2>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className={styles.empty}>
        <h2>Seu carrinho esta vazio</h2>
        <p>Adicione produtos para preparar sua finalizacao de compra.</p>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      {lastError ? (
        <div className={styles.errorBox} role="alert">
          <span>{lastError}</span>
          <button type="button" onClick={clearError}>
            Fechar
          </button>
        </div>
      ) : null}

      <div className={styles.items}>
        {items.map((item) => (
          <article key={item.key} className={styles.itemCard}>
            <div className={styles.imageWrap}>
              <ProductImage
                src={item.imageUrl || ""}
                alt={item.name}
                width={220}
                height={280}
                className={styles.image}
                imageBaseUrl={imageBaseUrl}
              />
            </div>

            <div className={styles.itemContent}>
              <h3>{item.name}</h3>
              {getVariantLabel(item) ? <p className={styles.variant}>{getVariantLabel(item)}</p> : null}
              <Price amountCents={item.unitAmount} currency={item.currency} className={styles.unitPrice} />

              <div className={styles.rowActions}>
                <div className={styles.qtyControl}>
                  <button
                    type="button"
                    onClick={() =>
                      setQty({
                        productId: item.productId,
                        variantId: item.variant.variantId,
                        qty: item.qty - 1,
                      })
                    }
                  >
                    -
                  </button>
                  <span>{item.qty}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setQty({
                        productId: item.productId,
                        variantId: item.variant.variantId,
                        qty: item.qty + 1,
                      })
                    }
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removeItem({ productId: item.productId, variantId: item.variant.variantId })}
                >
                  Remover
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <aside className={styles.summary}>
        <h2>Resumo do pedido</h2>
        {!checkoutEnabled ? <p className={styles.checkoutBanner}>Checkout desativado (manutencao)</p> : null}
        <div className={styles.summaryLine}>
          <span>Subtotal</span>
          <Price amountCents={subtotal} currency={currency} />
        </div>
        <p className={styles.checkoutHint}>
          {checkoutEnabled ? "Checkout em modo de teste para migracao." : "A integracao de checkout esta desativada nesta fase."}
        </p>
        {checkoutEnabled ? (
          <>
            <Link href="/checkout" className={styles.checkoutLink}>
              {isAuthenticated ? "Ir para o checkout" : "Comprar sem Login"}
            </Link>
            {!isAuthenticated ? (
              <Link href="/login?returnUrl=%2Fcheckout" className={styles.continueLink}>
                Fazer Login
              </Link>
            ) : null}
          </>
        ) : (
          <button type="button" className={styles.checkoutButton} disabled>
            Ir para checkout
          </button>
        )}
        <div className={styles.summaryActions}>
          <Link href="/products" className={styles.continueLink}>
            Continuar comprando
          </Link>
          <button type="button" className={styles.clearButton} onClick={clear}>
            Limpar carrinho
          </button>
        </div>
      </aside>
    </section>
  );
}
