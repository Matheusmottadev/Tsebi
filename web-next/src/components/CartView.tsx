"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { ContinueShoppingLink } from "@/components/ContinueShoppingLink";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { isCheckoutEnabled } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { getMe } from "@/services/auth";
import { applyDiscountCode } from "@/services/coupons";
import type { CouponEvaluation } from "@/types";
import styles from "./CartView.module.css";

const COUPON_ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: "Código inválido.",
  CODE_NOT_FOUND: "Código não encontrado.",
  CODE_INACTIVE: "Este código está inativo.",
  CODE_NOT_AVAILABLE_NOW: "Código expirado ou ainda não disponível.",
  CODE_NOT_APPLICABLE: "Código não aplicável ao valor atual do carrinho.",
  ACCESS_CODE_EVALUATION_FAILED: "Erro ao validar o código. Tente novamente.",
};

function getVariantLabel(item: { variant: { variantName: string | null; color: string | null; size: string | null } }) {
  if (item.variant.variantName) return item.variant.variantName;

  const color = String(item.variant.color || "").trim();
  const size = String(item.variant.size || "").trim();
  if (color && size) return `${color} · Tamanho ${size}`;
  if (color) return color;
  if (size) return `Tamanho ${size}`;
  return null;
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
  const clearError = useCartStore((state) => state.clearError);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<CouponEvaluation | null>(null);
  const prevSubtotalRef = useRef(subtotal);

  const imageBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  useEffect(() => {
    let isMounted = true;

    async function loadAuthState() {
      try {
        const user = await getMe({ cache: "no-store" });
        if (!isMounted) return;
        setIsAuthenticated(Boolean(user));
        setAccountName(String(user?.name || "").trim() || String(user?.email || "").trim());
      } catch {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setAccountName("");
      }
    }

    loadAuthState();
    return () => {
      isMounted = false;
    };
  }, []);

  // Limpa cupom aplicado se o subtotal mudar (itens adicionados/removidos)
  useEffect(() => {
    if (prevSubtotalRef.current !== subtotal) {
      prevSubtotalRef.current = subtotal;
      if (appliedCoupon) {
        setAppliedCoupon(null);
        setCouponFeedback({ type: "error", message: "Carrinho alterado — reaplique o cupom." });
      }
    }
  }, [subtotal, appliedCoupon]);

  async function handleApplyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) {
      setCouponFeedback({ type: "error", message: "Digite um código para aplicar." });
      return;
    }
    setIsApplyingCoupon(true);
    setCouponFeedback(null);
    try {
      const result = await applyDiscountCode(code, { subtotalCents: subtotal });
      setAppliedCoupon(result);
      setCouponFeedback({ type: "success", message: `Cupom aplicado! Desconto de R$ ${(result.discountCents / 100).toFixed(2).replace(".", ",")}.` });
    } catch (err) {
      setAppliedCoupon(null);
      let errorCode = "UNKNOWN";
      if (err instanceof HttpError) {
        const payload = err.payload as Record<string, unknown> | null;
        errorCode = String(payload?.error || "UNKNOWN");
      }
      const message = COUPON_ERROR_MESSAGES[errorCode] ?? "Não foi possível aplicar o código.";
      setCouponFeedback({ type: "error", message });
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponFeedback(null);
  }

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
        <p>Adicione produtos para preparar sua finalizacao da compra.</p>
        <ContinueShoppingLink className={styles.emptyAction}>Continuar comprando</ContinueShoppingLink>
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
          <h1 className={styles.pageTitle}>Sua seleção.</h1>
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
        {appliedCoupon ? (
          <div className={styles.summaryLine}>
            <span>Desconto ({appliedCoupon.code})</span>
            <Price amountCents={-appliedCoupon.discountCents} currency={currency} className={styles.summaryDiscount} />
          </div>
        ) : null}
        <div className={styles.summaryLine}>
          <span>Entrega</span>
          <strong>A calcular</strong>
        </div>
        <div className={styles.summaryDivider} />
        <div className={styles.summaryTotal}>
          <span>Total</span>
          <Price
            amountCents={appliedCoupon ? Math.max(0, subtotal - appliedCoupon.discountCents) : subtotal}
            currency={currency}
            className={styles.summaryTotalValue}
          />
        </div>

        <div className={styles.coupon}>
          <label className={styles.couponLabel} htmlFor="cart-coupon">
            Código exclusivo
          </label>
          <div className={styles.couponRow}>
            <input
              id="cart-coupon"
              className={styles.couponInput}
              name="couponCode"
              type="text"
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value); setCouponFeedback(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") handleApplyCoupon(); }}
              placeholder="Insira seu código"
              disabled={isApplyingCoupon || Boolean(appliedCoupon)}
            />
            {appliedCoupon ? (
              <button type="button" className={styles.couponButton} onClick={handleRemoveCoupon}>
                Remover
              </button>
            ) : (
              <button type="button" className={styles.couponButton} onClick={handleApplyCoupon} disabled={isApplyingCoupon}>
                {isApplyingCoupon ? "..." : "Aplicar"}
              </button>
            )}
          </div>
          {couponFeedback ? (
            <p className={couponFeedback.type === "success" ? styles.couponSuccess : styles.couponError}>
              {couponFeedback.message}
            </p>
          ) : null}
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

        {isAuthenticated ? (
          <p className={styles.loggedHint}>Logado como {accountName || "Cliente TSEBI"}</p>
        ) : (
          <p className={styles.loginHint}>
            Tem uma conta?{" "}
            <Link href="/login?returnUrl=%2Fcheckout" className={styles.loginLink}>
              Entrar para finalizar
            </Link>
          </p>
        )}

        <div className={styles.summaryActions}>
          <ContinueShoppingLink className={styles.secondaryAction} />
        </div>

        <p className={styles.summaryNote}>Parcelamento em até 10x sem juros acima de R$ 5.000.</p>
      </aside>
    </section>
  );
}
