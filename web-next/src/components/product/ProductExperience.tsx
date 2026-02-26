"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { buildVariantSnapshot, getProductVariantOptions } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { getSmoothScrollEngine } from "@/lib/animation/smoothScrollEngine";
import type { Product } from "@/types";
import { Drawer } from "./Drawer";
import {
  GLOBAL_SIZES,
  buildProductSizeModel,
} from "./SizeModel";
import styles from "./ProductExperience.module.css";

type ProductExperienceProps = {
  product: Product;
  recommendations: Product[];
  imageBaseUrl?: string;
};

function normalizeImageList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => String(item || "").trim()).filter(Boolean);
}

function buildGalleryImages(product: Product, recommendations: Product[]): string[] {
  const fallbackGalleryPool = ["/images/placeholder.jpg"];

  const anyProduct = product as Product & {
    images?: unknown;
    gallery?: unknown;
    media?: unknown;
  };

  const images = [
    String(product.image || "").trim(),
    ...normalizeImageList(anyProduct.images),
    ...normalizeImageList(anyProduct.gallery),
    ...normalizeImageList(anyProduct.media),
    ...recommendations.map((item) => String(item.image || "").trim()).filter(Boolean),
    ...fallbackGalleryPool,
  ].filter(Boolean);

  const unique = Array.from(new Set(images));
  const fallback = String(product.image || "").trim();
  while (unique.length < 5 && fallback) unique.push(fallback);
  return unique.slice(0, 6);
}

function getProductMediaList(product: Product): string[] {
  const anyProduct = product as Product & {
    images?: unknown;
    gallery?: unknown;
    media?: unknown;
  };

  return Array.from(
    new Set(
      [
        String(product.image || "").trim(),
        ...normalizeImageList(anyProduct.images),
        ...normalizeImageList(anyProduct.gallery),
        ...normalizeImageList(anyProduct.media),
      ].filter(Boolean)
    )
  );
}

function resolveTailoredCardImages(item: Product, fallbackPool: string[]): { primary: string; secondary: string } {
  const media = getProductMediaList(item);
  const primary = media[0] || String(item.image || "").trim() || fallbackPool[0] || "/images/placeholder.jpg";
  const secondary =
    media.find((src) => src !== primary) ||
    fallbackPool.find((src) => src && src !== primary) ||
    primary;

  return { primary, secondary };
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return clampRange(value, 0, 1);
}

function resolveColorToken(rawColor: string): { cssColor: string; unknown: boolean } {
  const normalized = String(rawColor || "").trim().toLowerCase();
  const map: Record<string, string> = {
    preto: "#111111",
    pretoenvernizado: "#101010",
    branco: "#f3f3f1",
    offwhite: "#f5f1e8",
    bege: "#d4c2a1",
    marrom: "#6a4a34",
    azul: "#1d4f89",
    azulmarinho: "#22314f",
    cinza: "#8a8a8a",
    prata: "#c3c5c8",
    dourado: "#b6935e",
    verde: "#3d5f45",
    vermelho: "#8c2f2f",
    rosa: "#cf8ea5",
  };

  const key = normalized.replace(/[\s-_]/g, "");
  const cssColor = map[key];
  if (cssColor) return { cssColor, unknown: false };
  return { cssColor: "#7f7f7f", unknown: true };
}

function hasColorStock(product: Product, rawColor: string): boolean {
  const color = String(rawColor || "").trim().toLowerCase();
  const variants = Object.entries(product.variantStock || {});
  if (variants.length === 0) return true;

  for (const [key, qty] of variants) {
    const normalizedKey = key.toLowerCase();
    if (!normalizedKey.includes("color:")) continue;
    if (!normalizedKey.includes(color)) continue;
    if (Number(qty || 0) > 0) return true;
  }

  return false;
}

function emitProductHeaderVisibility(hidden: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("product-media-scroll-direction", {
      detail: { hidden },
    })
  );
}

function emitStickyBarVisibility(active: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("product-sticky-bar-visibility", {
      detail: { active },
    })
  );
}

const MEDIA_SCROLL_DELTA_GAIN = 1.9;
const MEDIA_SCROLL_EASING = 0.44;
type DrawerKey = "size-chart" | "details" | "materials" | "contact" | "store";

function buildDescription(product: Product): string {
  return `${product.name} combina design autoral e acabamento premium em ${product.material}. Desenvolvido para um visual elegante com conforto no uso diario.`;
}

function scoreRelatedProduct(base: Product, candidate: Product): number {
  if (candidate.id === base.id) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (candidate.collection === base.collection) score += 5;
  if (candidate.category === base.category) score += 4;
  if (candidate.material === base.material) score += 3;
  if (candidate.gender === base.gender) score += 2;
  if (candidate.colors.some((color) => base.colors.includes(color))) score += 2;
  if (candidate.sizes.some((size) => base.sizes.includes(size))) score += 1;
  return score;
}

export function ProductExperience({ product, recommendations, imageBaseUrl }: ProductExperienceProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const mediaPanelRef = useRef<HTMLElement | null>(null);
  const mediaTrackRef = useRef<HTMLDivElement | null>(null);
  const stickyShowDelayRef = useRef<number | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const clearError = useCartStore((state) => state.clearError);
  const { sizes, colors } = useMemo(() => getProductVariantOptions(product), [product]);
  const galleryImages = useMemo(() => buildGalleryImages(product, recommendations), [product, recommendations]);
  const sizeModel = useMemo(() => buildProductSizeModel(product), [product]);
  const tailoredProducts = useMemo(
    () =>
      [...recommendations]
        .sort((a, b) => scoreRelatedProduct(product, b) - scoreRelatedProduct(product, a))
        .slice(0, 8),
    [product, recommendations]
  );
  const metricsRef = useRef({
    sectionTop: 0,
    sectionHeight: 0,
    sectionBottom: 0,
    viewportHeight: 0,
    maxMediaScroll: 0,
  });
  const smoothStateRef = useRef({ targetScroll: 0, currentScroll: 0, reducedMotion: false });
  const mediaMotionRef = useRef({ current: 0, target: 0, rafId: 0 });

  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState(() => String(colors[0] || "Preto"));
  const [feedback, setFeedback] = useState("");
  const [openDrawer, setOpenDrawer] = useState<DrawerKey | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);

  const canBuy = sizes.length === 0 || Boolean(selectedSize);

  useEffect(() => {
    const nextColor = String(colors[0] || "Preto");
    const rafId = window.requestAnimationFrame(() => {
      setSelectedColor((current) => (current === nextColor ? current : nextColor));
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [colors]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    const resetToTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    resetToTop();
    const rafId = window.requestAnimationFrame(resetToTop);
    const timeoutId = window.setTimeout(resetToTop, 80);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [product.id]);

  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement || typeof window === "undefined") return;

    if (typeof window.IntersectionObserver !== "function") {
      const rafId = window.requestAnimationFrame(() => setShowStickyBar(false));
      return () => window.cancelAnimationFrame(rafId);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        const heroVisible = entry.isIntersecting && entry.intersectionRatio > 0.08;
        if (heroVisible) {
          if (stickyShowDelayRef.current) {
            window.clearTimeout(stickyShowDelayRef.current);
            stickyShowDelayRef.current = null;
          }
          setShowStickyBar(false);
          return;
        }

        if (stickyShowDelayRef.current) return;
        stickyShowDelayRef.current = window.setTimeout(() => {
          setShowStickyBar(true);
          stickyShowDelayRef.current = null;
        }, 120);
      },
      {
        root: null,
        threshold: [0, 0.08, 0.2, 0.4],
      }
    );

    observer.observe(mainElement);
    return () => {
      observer.disconnect();
      if (stickyShowDelayRef.current) {
        window.clearTimeout(stickyShowDelayRef.current);
        stickyShowDelayRef.current = null;
      }
    };
  }, [product.id]);

  useEffect(() => {
    emitStickyBarVisibility(showStickyBar);
    return () => {
      emitStickyBarVisibility(false);
    };
  }, [showStickyBar]);

  const syncMediaTransform = useCallback((offset: number) => {
    const mediaPanel = mediaPanelRef.current;
    if (!mediaPanel) return;
    mediaPanel.style.setProperty("--media-offset", `${-offset.toFixed(2)}px`);
  }, []);

  const resetMediaMotion = useCallback(() => {
    const mediaState = mediaMotionRef.current;
    if (mediaState.rafId) {
      window.cancelAnimationFrame(mediaState.rafId);
      mediaState.rafId = 0;
    }
    mediaState.current = 0;
    mediaState.target = 0;
    syncMediaTransform(0);
  }, [syncMediaTransform]);

  const refreshMetrics = useCallback(() => {
    const mainElement = mainRef.current;
    const mediaElement = mediaPanelRef.current;
    const mediaTrack = mediaTrackRef.current;
    if (!mainElement || !mediaElement || !mediaTrack || typeof window === "undefined") return;

    const sectionTop = mainElement.getBoundingClientRect().top + window.scrollY;
    const sectionHeight = mainElement.offsetHeight;
    const rawMaxScroll = Math.max(0, mediaTrack.scrollHeight - mediaElement.clientHeight);
    const maxMediaScroll = rawMaxScroll < 2 ? 0 : rawMaxScroll;
    metricsRef.current = {
      sectionTop,
      sectionHeight,
      sectionBottom: sectionTop + sectionHeight,
      viewportHeight: window.innerHeight,
      maxMediaScroll,
    };

    const mediaState = mediaMotionRef.current;
    mediaState.current = clampRange(mediaState.current, 0, maxMediaScroll);
    mediaState.target = clampRange(mediaState.target, 0, maxMediaScroll);
    syncMediaTransform(mediaState.current);
  }, [syncMediaTransform]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    resetMediaMotion();
  }, [product.id, galleryImages.length, resetMediaMotion]);

  const startMediaAnimation = useCallback(() => {
    const step = () => {
      const mediaState = mediaMotionRef.current;
      const delta = mediaState.target - mediaState.current;
      const eased = smoothStateRef.current.reducedMotion
        ? mediaState.target
        : mediaState.current + delta * MEDIA_SCROLL_EASING;
      mediaState.current = Math.abs(delta) < 0.12 ? mediaState.target : eased;
      syncMediaTransform(mediaState.current);

      if (Math.abs(mediaState.target - mediaState.current) < 0.12) {
        mediaState.current = mediaState.target;
        mediaState.rafId = 0;
        return;
      }

      mediaState.rafId = window.requestAnimationFrame(step);
    };

    const mediaState = mediaMotionRef.current;
    if (mediaState.rafId) return;
    mediaState.rafId = window.requestAnimationFrame(step);
  }, [syncMediaTransform]);

  useEffect(() => {
    const engine = getSmoothScrollEngine({ easing: 0.08 });
    const unsubscribe = engine.subscribe((state) => {
      smoothStateRef.current = state;
      const mainElement = mainRef.current;
      if (!mainElement) return;

      const metrics = metricsRef.current;
      const progressBase = metrics.viewportHeight > 0 ? (state.currentScroll - metrics.sectionTop) / metrics.viewportHeight : 0;
      mainElement.style.setProperty("--scroll-progress", clamp01(progressBase).toFixed(4));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    refreshMetrics();
    // Re-run after initial paint/layout settling to avoid stale dimensions on first render.
    const rafId = window.requestAnimationFrame(() => {
      refreshMetrics();
    });
    const timeoutId = window.setTimeout(() => {
      refreshMetrics();
    }, 120);
    const onResize = () => refreshMetrics();
    window.addEventListener("resize", onResize, { passive: true });

    const mediaTrack = mediaTrackRef.current;
    const observer =
      mediaTrack && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            refreshMetrics();
          })
        : null;
    if (observer && mediaTrack) observer.observe(mediaTrack);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [galleryImages.length, refreshMetrics]);

  useEffect(() => {
    const mainElement = mainRef.current;
    const mediaElement = mediaPanelRef.current;
    if (!mainElement || !mediaElement) return;

    const onWheel = (event: WheelEvent) => {
      if (openDrawer) return;
      if (smoothStateRef.current.reducedMotion) return;
      if (window.innerWidth <= 1000) return;
      if (Math.abs(event.deltaY) < 0.5) return;

      const metrics = metricsRef.current;
      if (metrics.maxMediaScroll <= 0) return;
      const viewportTop = window.scrollY;
      const sectionTop = metrics.sectionTop;
      const sectionBottom = metrics.sectionBottom;
      const isSectionRelevant = viewportTop + window.innerHeight > sectionTop && viewportTop < sectionBottom;
      if (!isSectionRelevant) return;

      const normalizedDelta =
        Math.sign(event.deltaY) * Math.min(48, Math.abs(event.deltaY)) * MEDIA_SCROLL_DELTA_GAIN;
      const atSectionTop = window.scrollY <= sectionTop + 1;
      const mediaState = mediaMotionRef.current;

      const mediaAtTop = mediaState.target <= 0.5;
      const mediaAtBottom = mediaState.target >= metrics.maxMediaScroll - 0.5;
      const isScrollingDown = normalizedDelta > 0;
      const isScrollingUp = normalizedDelta < 0;

      const shouldConsumeDown = isScrollingDown && atSectionTop && !mediaAtBottom;
      const shouldConsumeUp = isScrollingUp && atSectionTop && !mediaAtTop;

      if (!shouldConsumeDown && !shouldConsumeUp) return;

      event.preventDefault();
      emitProductHeaderVisibility(shouldConsumeDown);

      if (isScrollingDown && window.scrollY < sectionTop) {
        window.scrollTo({ top: sectionTop });
        return;
      }

      mediaState.target = clampRange(mediaState.target + normalizedDelta, 0, metrics.maxMediaScroll);
      startMediaAnimation();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      resetMediaMotion();
      window.removeEventListener("wheel", onWheel as EventListener);
    };
  }, [openDrawer, resetMediaMotion, startMediaAnimation]);

  const handleBuy = () => {
    if (!canBuy) {
      setFeedback("Selecione um tamanho para continuar.");
      window.setTimeout(() => setFeedback(""), 1800);
      return;
    }

    clearError();
    const variant = buildVariantSnapshot({ color: selectedColor || null, size: selectedSize || null });
    const result = addItem({
      item: {
        productId: product.id,
        name: product.name,
        unitAmount: product.unitAmount,
        currency: product.currency,
        imageUrl: product.image || null,
        variant,
      },
      qty: 1,
    });

    setFeedback(result.ok ? "Produto adicionado ao carrinho." : result.error || "Nao foi possivel adicionar.");
    window.setTimeout(() => setFeedback(""), 1800);
  };

  const handleApplySizeFromChart = (size: string) => {
    setSelectedSize(size);
    setOpenDrawer(null);
  };

  return (
    <div className={styles.page}>
      <div className={`${styles.stickyProductBar}${showStickyBar ? ` ${styles.stickyProductBarVisible}` : ""}`} aria-hidden={!showStickyBar}>
        <div className={styles.stickyProductInner}>
          <div className={styles.stickyMeta}>
            <ProductImage
              src={galleryImages[0] || product.image || ""}
              alt={product.name}
              width={80}
              height={80}
              className={styles.stickyThumb}
              imageBaseUrl={imageBaseUrl}
            />
            <div className={styles.stickyText}>
              <p className={styles.stickyName}>{product.name}</p>
              <Price amountCents={product.unitAmount} currency={product.currency} className={styles.stickyPrice} />
            </div>
          </div>
          <button type="button" className={styles.stickyBuyButton} onClick={handleBuy}>
            Adicionar
          </button>
        </div>
      </div>
      <main className={styles.main} ref={mainRef}>
        <section className={styles.mediaPanel} ref={mediaPanelRef}>
          <div className={styles.mediaTrack} ref={mediaTrackRef}>
            {galleryImages.map((src, index) => (
              <figure key={`${src}-${index}`} className={styles.mediaSlide}>
                <ProductImage
                  src={src}
                  alt={`${product.name} - foto ${index + 1}`}
                  width={1280}
                  height={1700}
                  className={styles.mainImage}
                  imageBaseUrl={imageBaseUrl}
                  priority={index === 0}
                />
              </figure>
            ))}
          </div>
        </section>

        <section className={styles.infoPanel}>
          <div className={styles.infoInner}>
            <p className={styles.sku}>{product.sku}</p>
            <h1 className={styles.title}>{product.name}</h1>
            <Price amountCents={product.unitAmount} currency={product.currency} className={styles.price} />
            <div className={styles.colorRow}>
              <span>Cor</span>
              <span>{selectedColor}</span>
            </div>

            <div className={styles.swatches}>
              {(colors.length > 0 ? colors : [selectedColor]).map((color) => {
                const token = resolveColorToken(color);
                const isAvailable = !token.unknown && hasColorStock(product, color);
                return (
                  <button
                    key={color}
                    type="button"
                    className={`${styles.swatch}${selectedColor === color ? ` ${styles.swatchActive}` : ""}${!isAvailable ? ` ${styles.swatchDisabled}` : ""}`}
                    aria-label={`Selecionar cor ${color}`}
                    onClick={() => {
                      if (!isAvailable) return;
                      setSelectedColor(color);
                    }}
                    disabled={!isAvailable}
                    style={{
                      backgroundColor: token.cssColor,
                    }}
                  />
                );
              })}
            </div>

            <div className={styles.sizeSelectorRow}>
              <button type="button" className={styles.sizeTrigger} onClick={() => setOpenDrawer("size-chart")}>
                <span>{selectedSize ? `Tamanho: ${selectedSize}` : "Selecionar tamanho"}</span>
                <span className={styles.chevron}>⌄</span>
              </button>
              <button type="button" className={styles.sizeTableButton} onClick={() => setOpenDrawer("size-chart")}>
                Tabela de tamanhos
              </button>
            </div>
            <button type="button" className={styles.buyButton} onClick={handleBuy}>
              Adicionar ao carrinho
            </button>

            {feedback ? <p className={styles.feedback}>{feedback}</p> : null}

            <div className={styles.infoRows}>
              <button type="button" onClick={() => setOpenDrawer("details")}>Detalhes do produto</button>
              <button type="button" onClick={() => setOpenDrawer("materials")}>Materiais e cuidados</button>
              <button type="button" onClick={() => setOpenDrawer("contact")}>Frete e devolucao gratis</button>
              <button type="button" className={styles.lastServiceOption} onClick={() => setOpenDrawer("store")}>
                Marque um atendimento com nossa equipe
              </button>
            </div>
          </div>
          <p className={styles.signatureQuote}>
            <span>Construida para presenca.</span>
            <span>Pensada para durar.</span>
          </p>
        </section>
      </main>
      {tailoredProducts.length > 0 ? (
        <section className={styles.tailoredSection} aria-label="Tem a sua cara">
          <header className={styles.tailoredHeader}>
            <h2>Tem a sua cara</h2>
          </header>
          <div className={styles.tailoredGrid}>
            {tailoredProducts.map((item) => {
              const cardImages = resolveTailoredCardImages(item, galleryImages);
              return (
                <a key={item.id} href={`/product/${encodeURIComponent(item.id)}`} className={styles.tailoredCard}>
                  <div className={styles.tailoredMedia}>
                    <ProductImage
                      src={cardImages.primary}
                      alt={item.name}
                      width={900}
                      height={1200}
                      className={`${styles.tailoredImage} ${styles.tailoredImagePrimary}`}
                      imageBaseUrl={imageBaseUrl}
                    />
                    <ProductImage
                      src={cardImages.secondary}
                      alt={`${item.name} - segunda foto`}
                      width={900}
                      height={1200}
                      className={`${styles.tailoredImage} ${styles.tailoredImageSecondary}`}
                      imageBaseUrl={imageBaseUrl}
                    />
                    <div className={styles.tailoredMetaOverlay}>
                      <p className={styles.tailoredName}>{item.name}</p>
                      <Price amountCents={item.unitAmount} currency={item.currency} className={styles.tailoredPrice} />
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <Drawer
        open={openDrawer === "size-chart"}
        title="Tabela de tamanhos"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <p className={styles.drawerIntro}>Sistema global. Selecione seu tamanho:</p>
        <div className={styles.drawerSizeGrid}>
          {GLOBAL_SIZES.map((size) => {
            const stock = Number(sizeModel.sizes[size] || 0);
            const disabled = stock <= 0;
            const isSelected = selectedSize === size;
            return (
              <button
                type="button"
                key={size}
                onClick={() => handleApplySizeFromChart(size)}
                disabled={disabled}
                className={`${styles.drawerSizeButton}${isSelected ? ` ${styles.drawerSizeButtonSelected}` : ""}`}
              >
                <span>{size}</span>
                <small>{disabled ? "Sem estoque" : `${stock} em estoque`}</small>
              </button>
            );
          })}
        </div>
      </Drawer>

      <Drawer
        open={openDrawer === "details"}
        title="Detalhes do produto"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <p className={styles.drawerParagraph}>{buildDescription(product)}</p>
        <section className={styles.modelHighlight}>
          <p><strong>Modelo:</strong> 1,82m e veste tamanho M.</p>
          <p><strong>Modelagem:</strong> Regular.</p>
          <p><strong>Recomendação:</strong> escolha seu tamanho habitual.</p>
        </section>
        <ul className={styles.drawerList}>
          <li>Categoria: {product.category}</li>
          <li>Colecao: {product.collection}</li>
          <li>Genero: {product.gender}</li>
          <li>Codigo SKU: {product.sku}</li>
          <li>Modelagem: contemporanea com foco em alfaiataria e conforto.</li>
        </ul>
      </Drawer>

      <Drawer
        open={openDrawer === "materials"}
        title="Materiais e cuidados"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <p className={styles.drawerParagraph}>Material principal: {product.material}.</p>
        <p className={styles.drawerParagraph}>
          Recomendamos limpeza especializada e armazenamento em local seco, ao abrigo de luz solar direta.
        </p>
        <ul className={styles.drawerList}>
          <li>Evite atrito constante com superficies asperas.</li>
          <li>Guardar em capa protetora, longe de umidade.</li>
          <li>Passar a peca pelo avesso em baixa temperatura.</li>
        </ul>
      </Drawer>

      <Drawer
        open={openDrawer === "contact"}
        title="Frete e devolucao gratis"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <section className={styles.drawerSplitSection}>
          <h4>Frete</h4>
          <p className={styles.drawerParagraph}>
            Frete gratis para todo o Brasil em compras elegiveis. Trabalhamos com transportadoras parceiras e
            acompanhamento completo ate a entrega.
          </p>
          <p className={styles.drawerParagraph}>
            Para capitais e regioes metropolitanas, o prazo medio e de 2 a 5 dias uteis. Para demais localidades,
            o prazo medio e de 4 a 8 dias uteis, podendo variar conforme o CEP.
          </p>
          <ul className={styles.drawerList}>
            <li>Prazo medio: 2 a 8 dias uteis, conforme CEP e disponibilidade.</li>
            <li>Codigo de rastreio enviado por e-mail apos faturamento.</li>
            <li>Duas tentativas de entrega no endereco informado; depois disso o pedido retorna ao centro logístico.</li>
            <li>Em caso de avaria no recebimento, recuse a entrega e entre em contato imediatamente.</li>
          </ul>
        </section>

        <section className={styles.drawerSplitSection}>
          <h4>Devolucao</h4>
          <p className={styles.drawerParagraph}>
            Nossa politica segue o Codigo de Defesa do Consumidor (Lei 8.078/90) para compras online.
          </p>
          <ul className={styles.drawerList}>
            <li>Troca e devolucao em ate 7 dias corridos apos recebimento.</li>
            <li>Produto deve retornar sem uso, com etiqueta e embalagem original.</li>
            <li>Estorno aprovado e processado em ate 10 dias uteis apos conferencia do item devolvido.</li>
            <li>Itens personalizados podem ter regras especificas de arrependimento.</li>
          </ul>
          <p className={styles.drawerParagraph}>
            Se precisar de suporte durante o envio ou devolucao, nossa equipe acompanha cada etapa em tempo real.
          </p>
        </section>
      </Drawer>

      <Drawer
        open={openDrawer === "store"}
        title="Marque um atendimento com nossa equipe"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <section className={styles.privateCarePanel}>
          <h3>Atendimento privado</h3>
          <p>Nossa equipe acompanha sua escolha de tamanho, combinacao e finalizacao do pedido.</p>
          <div className={styles.privateCareGrid}>
            <label>
              Nome
              <input type="text" placeholder="Seu nome" />
            </label>
            <label>
              WhatsApp
              <input type="tel" placeholder="(11) 99999-9999" />
            </label>
          </div>
          <label className={styles.privateCareMessage}>
            Mensagem
            <textarea rows={4} placeholder="Conte como podemos ajudar no seu atendimento." />
          </label>
          <div className={styles.privateCareActions}>
            <a href="/account#private-care">Abrir atendimento privado</a>
            <a href="/login">Entrar ou criar conta</a>
          </div>
        </section>
      </Drawer>
    </div>
  );
}
