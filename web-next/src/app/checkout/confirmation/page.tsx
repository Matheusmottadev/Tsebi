"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import styles from "./confirmation.module.css";

type ConfirmationStatus = "processing" | "success" | "failed";

type ConfirmationItem = {
  id: string;
  name: string;
  variant: string;
  priceLabel: string;
  imageSrc: string;
  qty: number;
};

const CART_STORAGE_KEY = "tsebi.web_next.cart.v1";
const FALLBACK_FAILED_ERROR = "Pagamento recusado pelo emissor do cartao.";

function resolveStatus(value: string | null): ConfirmationStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "success") return "success";
  if (normalized === "failed") return "failed";
  return "processing";
}

function formatOrderId(value: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "#—";
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function formatCurrencyFromUnits(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatCurrencyFromCents(cents: number): string {
  return formatCurrencyFromUnits(Math.max(0, Number(cents || 0)) / 100);
}

function formatTotal(raw: string | null, fallback: string): string {
  const text = String(raw || "").trim();
  if (!text) return fallback || "R$ —";
  if (/r\$/i.test(text)) return text;

  const normalized = text.replace(/\s+/g, "").replace(",", ".");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return text;
  return formatCurrencyFromUnits(numeric);
}

function formatItemsCountLabel(value: number): string {
  const count = Math.max(0, Math.floor(Number(value || 0)));
  if (count <= 0) return "—";
  return `${count} ${count === 1 ? "peca" : "pecas"}`;
}

function resolveImageSrc(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const base = String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const path = value.startsWith("/") ? value : `/${value}`;
  return base ? `${base}${path}` : path;
}

function parseItemsCountFromQuery(raw: string | null): number | null {
  const text = String(raw || "").trim();
  if (!text) return null;

  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.floor(asNumber);

  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.reduce((sum, entry) => {
        const qty = Math.max(1, Math.floor(Number((entry as { qty?: number })?.qty || 1)));
        return sum + qty;
      }, 0);
    }
  } catch {}
  return null;
}

function parseItemsFromQuery(raw: string | null): ConfirmationItem[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    const source = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { items?: unknown[] })?.items)
        ? ((parsed as { items?: unknown[] }).items as unknown[])
        : [];

    return source
      .map((entry, index) => {
        const item = entry as {
          id?: string;
          name?: string;
          variant?: string;
          color?: string;
          size?: string;
          price?: string | number;
          qty?: number;
          image?: string;
          imageUrl?: string;
        };
        const name = String(item.name || "").trim();
        if (!name) return null;
        const color = String(item.color || "").trim();
        const size = String(item.size || "").trim();
        const variant = String(item.variant || "").trim() || [color, size].filter(Boolean).join(" · ") || "Sem variante";
        const qty = Math.max(1, Math.floor(Number(item.qty || 1)));

        let priceLabel = "R$ —";
        if (typeof item.price === "number" && Number.isFinite(item.price)) {
          priceLabel = formatCurrencyFromUnits(item.price);
        } else if (typeof item.price === "string" && String(item.price || "").trim()) {
          priceLabel = String(item.price || "").trim();
        }

        return {
          id: String(item.id || `query-${index}`),
          name,
          variant,
          priceLabel,
          imageSrc: resolveImageSrc(item.imageUrl || item.image || ""),
          qty,
        } satisfies ConfirmationItem;
      })
      .filter((entry): entry is ConfirmationItem => Boolean(entry));
  } catch {
    return [];
  }
}

function readCartFromLocalStorage(): { items: ConfirmationItem[]; totalLabel: string; itemCount: number } {
  if (typeof window === "undefined") return { items: [], totalLabel: "R$ —", itemCount: 0 };
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return { items: [], totalLabel: "R$ —", itemCount: 0 };

    const parsed = JSON.parse(raw) as { items?: unknown[] } | null;
    const source = Array.isArray(parsed?.items) ? parsed.items : [];
    let totalCents = 0;
    let itemCount = 0;

    const items = source
      .map((entry, index) => {
        const item = entry as {
          key?: string;
          name?: string;
          unitAmount?: number;
          qty?: number;
          imageUrl?: string;
          variant?: { color?: string | null; size?: string | null; variantName?: string | null };
        };
        const name = String(item.name || "").trim();
        if (!name) return null;

        const qty = Math.max(1, Math.floor(Number(item.qty || 1)));
        const unitAmount = Math.max(0, Math.floor(Number(item.unitAmount || 0)));
        const subtotalCents = qty * unitAmount;
        totalCents += subtotalCents;
        itemCount += qty;

        const variantName = String(item.variant?.variantName || "").trim();
        const color = String(item.variant?.color || "").trim();
        const size = String(item.variant?.size || "").trim();
        const variant = variantName || [color, size].filter(Boolean).join(" · ") || "Sem variante";

        return {
          id: String(item.key || `local-${index}`),
          name,
          variant: qty > 1 ? `${variant} · Qtd ${qty}` : variant,
          priceLabel: formatCurrencyFromCents(subtotalCents),
          imageSrc: resolveImageSrc(item.imageUrl || ""),
          qty,
        } satisfies ConfirmationItem;
      })
      .filter((entry): entry is ConfirmationItem => Boolean(entry));

    return {
      items,
      totalLabel: totalCents > 0 ? formatCurrencyFromCents(totalCents) : "R$ —",
      itemCount,
    };
  } catch {
    return { items: [], totalLabel: "R$ —", itemCount: 0 };
  }
}

export default function CheckoutConfirmationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [localItems, setLocalItems] = useState<ConfirmationItem[]>([]);
  const [localItemCount, setLocalItemCount] = useState(0);
  const [localTotalLabel, setLocalTotalLabel] = useState("R$ —");

  const status = resolveStatus(searchParams.get("status"));
  const orderId = formatOrderId(searchParams.get("orderId"));
  const email = String(searchParams.get("email") || "").trim();
  const error = String(searchParams.get("error") || "").trim() || FALLBACK_FAILED_ERROR;
  const installments = String(searchParams.get("installments") || searchParams.get("parcelas") || "").trim();
  const queryItemsRaw = searchParams.get("items");
  const queryTotalRaw = searchParams.get("total");

  const queryItems = useMemo(() => parseItemsFromQuery(queryItemsRaw), [queryItemsRaw]);
  const queryItemsCount = useMemo(() => parseItemsCountFromQuery(queryItemsRaw), [queryItemsRaw]);

  useEffect(() => {
    const data = readCartFromLocalStorage();
    setLocalItems(data.items);
    setLocalItemCount(data.itemCount);
    setLocalTotalLabel(data.totalLabel);
  }, []);

  const totalLabel = formatTotal(queryTotalRaw, localTotalLabel);
  const processingItemsLabel = queryItemsCount != null
    ? formatItemsCountLabel(queryItemsCount)
    : formatItemsCountLabel(localItemCount);
  const successItems = queryItems.length > 0 ? queryItems : localItems;
  const totalPaidLabel = installments ? `${totalLabel} - ${installments}` : totalLabel;

  if (status === "processing") {
    return (
      <main className={`${styles.page} ${styles.processingScreen}`}>
        <img src="/images/logo-tsebi.png" alt="Tsebi" className={styles.runningLogo} />
        <h1 className={styles.processingTitle}>
          Processando
          <span className={styles.dots}>
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </h1>
        <p className={styles.processingSub}>Aguarde enquanto confirmamos seu pedido com seguranca</p>
        <div className={styles.processingDivider} />
        <section className={styles.processingMetaGrid} aria-label="Resumo do processamento">
          <article className={styles.metaCard}>
            <p className={styles.metaLabel}>Pedido</p>
            <p className={styles.metaValue}>{orderId}</p>
          </article>
          <article className={styles.metaCard}>
            <p className={styles.metaLabel}>Itens</p>
            <p className={styles.metaValue}>{processingItemsLabel}</p>
          </article>
          <article className={styles.metaCard}>
            <p className={styles.metaLabel}>Total</p>
            <p className={styles.metaValue}>{totalLabel}</p>
          </article>
        </section>
      </main>
    );
  }

  if (status === "failed") {
    return (
      <main className={`${styles.page} ${styles.splitScreen}`}>
        <section className={`${styles.leftPanel} ${styles.leftFailed}`}>
          <div className={styles.leftTop}>
            <p className={styles.brand}>TSEBI</p>
          </div>
          <div className={styles.leftBottom}>
            <p className={styles.quote}>Tente novamente.</p>
          </div>
        </section>

        <section className={styles.rightPanel}>
          <div className={`${styles.rightInner} ${styles.failedInner}`}>
            <img src="/images/logo-tsebi.png" alt="Tsebi" className={`${styles.statusLogo} ${styles.failedLogo}`} />
            <h1 className={styles.title}>Algo deu errado.</h1>
            <p className={styles.subtitle}>
              Nao foi possivel processar seu pagamento. Verifique os dados do cartao e tente novamente.
            </p>

            <section className={styles.errorBox}>
              <p className={styles.errorLabel}>MOTIVO</p>
              <p className={styles.errorText}>{error}</p>
            </section>

            <button type="button" className={styles.btnPrimary} onClick={() => router.back()}>
              Tentar novamente
            </button>
            <Link href="/checkout" className={styles.btnOutline}>
              Escolher outra forma de pagamento
            </Link>
            <Link href="/cart" className={styles.btnGhost}>
              Voltar ao carrinho
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`${styles.page} ${styles.splitScreen}`}>
      <section className={`${styles.leftPanel} ${styles.leftSuccess}`}>
        <div className={styles.leftTop}>
          <p className={styles.brand}>TSEBI</p>
        </div>
        <div className={styles.leftBottom}>
          <p className={styles.quote}>Cada peca e um principio.</p>
          <p className={styles.tagline}>FORMA, PRINCIPIO E EXCELENCIA</p>
        </div>
      </section>

      <section className={styles.rightPanel}>
        <div className={styles.rightInner}>
          <img src="/images/logo-tsebi.png" alt="Tsebi" className={styles.statusLogo} />
          <h1 className={styles.title}>Pedido confirmado.</h1>
          <p className={styles.subtitle}>
            Obrigada pela sua confianca.
            <br />
            {email || "Em breve voce recebera os detalhes por email."}
          </p>

          <section className={styles.detailsBox}>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Pedido</span>
              <span className={styles.detailValue}>{orderId}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Status</span>
              <span className={styles.detailValue}>Confirmado</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Entrega estimada</span>
              <span className={styles.detailValue}>5 a 8 dias uteis</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Confirmacao enviada</span>
              <span className={styles.detailValue}>{email || "cliente@email.com"}</span>
            </div>
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Total pago</span>
              <span className={styles.detailValue}>{totalPaidLabel}</span>
            </div>
          </section>

          {successItems.length > 0 ? (
            <section className={styles.itemsBox}>
              {successItems.map((item) => (
                <article key={item.id} className={styles.itemRow}>
                  <div className={styles.itemThumb}>
                    {item.imageSrc ? <img src={item.imageSrc} alt={item.name} /> : null}
                  </div>
                  <div className={styles.itemInfo}>
                    <p className={styles.itemName}>{item.name}</p>
                    <p className={styles.itemMeta}>{item.variant}</p>
                  </div>
                  <p className={styles.itemPrice}>{item.priceLabel}</p>
                </article>
              ))}
            </section>
          ) : null}

          <Link href="/" className={styles.btnOutline}>
            Explorar colecao
          </Link>
          <Link href="/account" className={styles.btnGhost}>
            Acompanhar pedido
          </Link>
        </div>
      </section>
    </main>
  );
}
