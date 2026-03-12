"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { ContinueShoppingLink } from "@/components/ContinueShoppingLink";
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
  const [couponCode, setCouponCode] = useState("");

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

      <div className={styles.itemsColumn}>
        <header className={styles.pageHeader}>
          <p className={styles.eyebrow}>SACOLA</p>
          <h1 className={styles.pageTitle}>Sua selecao.</h1>
        </header>

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
                <h3 className={styles.itemName}>{item.name}</h3>
                {getVariantLabel(item) ? <p className={styles.variant}>{getVariantLabel(item)}</p> : null}

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

              <Price amountCents={item.unitAmount} currency={item.currency} className={styles.itemPrice} />
            </article>
          ))}
        </div>
      </div>

      <aside className={styles.summary}>
        <p className={styles.summaryEyebrow}>RESUMO</p>
        {!checkoutEnabled ? <p className={styles.checkoutBanner}>Checkout desativado (manutencao)</p> : null}
        <div className={styles.summaryLine}>
          <span>Subtotal</span>
          <Price amountCents={subtotal} currency={currency} className={styles.summaryValue} />
        </div>
        <div className={styles.summaryLine}>
          <span>Entrega</span>
          <strong>A calcular</strong>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryTotal}>
          <span>Total</span>
          <Price amountCents={subtotal} currency={currency} className={styles.summaryTotalValue} />
        </div>

        <div className={styles.coupon}>
          <label className={styles.couponLabel} htmlFor="cart-coupon">
            Codigo exclusivo
          </label>
          <div className={styles.couponRow}>
            <input
              id="cart-coupon"
              className={styles.couponInput}
              name="couponCode"
              type="text"
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Insira seu codigo"
            />
            <button type="button" className={styles.couponButton}>
              Aplicar
            </button>
          </div>
        </div>

        {checkoutEnabled ? (
          <Link href="/checkout" className={styles.primaryAction}>
            Finalizar compra
          </Link>
        ) : (
          <button type="button" className={styles.primaryAction} disabled>
            Finalizar compra
          </button>
        )}

        {!isAuthenticated ? (
          <p className={styles.loginHint}>
            Tem uma conta?{" "}
            <Link href="/login?returnUrl=%2Fcheckout" className={styles.loginLink}>
              Entrar para finalizar
            </Link>
          </p>
        ) : null}

        <div className={styles.summaryActions}>
          <ContinueShoppingLink className={styles.secondaryAction} />
          <button type="button" className={styles.secondaryAction} onClick={clear}>
            Limpar sacola
          </button>
        </div>

        <p className={styles.summaryNote}>Parcelamento em ate 10x sem juros acima de R$ 5.000.</p>
      </aside>
    </section>
  );
}
