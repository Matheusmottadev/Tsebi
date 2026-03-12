"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { buildVariantSnapshot, getProductVariantOptions, getVariantStockQty } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { getSmoothScrollEngine } from "@/lib/animation/smoothScrollEngine";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { quoteShipping } from "@/services/orders";
import type { Product } from "@/types";
import { Drawer } from "./Drawer";
import {
  GLOBAL_SIZES,
} from "./SizeModel";
import styles from "./ProductExperience.module.css";

type ProductExperienceProps = {
  product: Product;
  recommendations: Product[];
  imageBaseUrl?: string;
};

function normalizeImageList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((item) => normalizeImageValue(item)).filter(Boolean);
}

function normalizeImageValue(input: unknown): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  const clean = raw.replace(/^\.?\//, "");
  return clean.startsWith("images/") ? `/${clean}` : `/${clean}`;
}

function buildSkuImageFallbacks(product: Product): string[] {
  const sku = String(product.sku || "").trim();
  if (!sku) return [];
  return [1, 2, 3, 4, 5].map((index) => `/images/product/${sku}-${index}.jpg`);
}

function buildGalleryImages(product: Product): string[] {
  const anyProduct = product as Product & {
    images?: unknown;
    gallery?: unknown;
    galleryImages?: unknown;
    media?: unknown;
    image_url?: unknown;
    metadata?: unknown;
  };

  const metadata =
    anyProduct.metadata && typeof anyProduct.metadata === "object" && !Array.isArray(anyProduct.metadata)
      ? (anyProduct.metadata as Record<string, unknown>)
      : {};

  const metadataImages = normalizeImageList(metadata.images);
  const metadataGallery = normalizeImageList(metadata.gallery);
  const metadataGalleryImages = normalizeImageList(metadata.galleryImages);
  const metadataMedia = normalizeImageList(metadata.media);
  const metadataSecondary = normalizeImageValue(metadata.secondaryImage);

  const skuFallbacks = buildSkuImageFallbacks(product);
  const images = [
    normalizeImageValue(product.image),
    normalizeImageValue(anyProduct.image_url),
    normalizeImageValue((product as Product & { secondaryImage?: unknown }).secondaryImage),
    metadataSecondary,
    ...normalizeImageList((product as Product & { galleryImages?: unknown }).galleryImages),
    ...normalizeImageList(anyProduct.images),
    ...normalizeImageList(anyProduct.gallery),
    ...normalizeImageList(anyProduct.galleryImages),
    ...normalizeImageList(anyProduct.media),
    ...metadataImages,
    ...metadataGallery,
    ...metadataGalleryImages,
    ...metadataMedia,
    ...skuFallbacks,
  ].filter(Boolean);

  const unique = Array.from(new Set(images));
  if (unique.length === 0) return ["/images/placeholderreal.webp"];
  while (unique.length < 5) {
    unique.push(`/images/placeholderreal.webp?v=${unique.length + 1}`);
  }
  return unique.slice(0, 5);
}

function getProductMediaList(product: Product): string[] {
  const anyProduct = product as Product & {
    images?: unknown;
    gallery?: unknown;
    galleryImages?: unknown;
    media?: unknown;
  };

  return Array.from(
    new Set(
      [
        String(product.image || "").trim(),
        String(product.secondaryImage || "").trim(),
        ...normalizeImageList((product as Product & { galleryImages?: unknown }).galleryImages),
        ...normalizeImageList(anyProduct.images),
        ...normalizeImageList(anyProduct.gallery),
        ...normalizeImageList(anyProduct.galleryImages),
        ...normalizeImageList(anyProduct.media),
      ].filter(Boolean)
    )
  );
}

function resolveTailoredCardImages(item: Product, fallbackPool: string[]): { primary: string; secondary: string } {
  const media = getProductMediaList(item);
  const primary = media[0] || String(item.image || "").trim() || fallbackPool[0] || "/images/placeholderreal.webp";
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

function normalizeText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isUniqueSizeLabel(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized === "unico" || normalized === "unique";
}

function normalizePostalCode(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function formatPostalCode(value: string): string {
  const digits = normalizePostalCode(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function extractRangeFromUnknown(value: unknown): { minDays: number; maxDays: number } | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const day = Math.max(1, Math.round(value));
    return { minDays: day, maxDays: day };
  }

  const text = String(value || "").trim();
  if (!text) return null;
  const matches = text.match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const values = matches
    .map((entry) => Number(entry))
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .map((entry) => Math.round(entry));
  if (values.length === 0) return null;
  const minDays = Math.min(...values);
  const maxDays = Math.max(...values);
  return { minDays, maxDays };
}

function resolveQuoteDeadlineRange(quote: {
  deadlineDays?: number | null;
  rawPayload?: unknown;
  deadlineMinDays?: number | null;
  deadlineMaxDays?: number | null;
}): { minDays: number; maxDays: number } | null {
  const explicitMin = Number(quote.deadlineMinDays);
  const explicitMax = Number(quote.deadlineMaxDays);
  if (Number.isFinite(explicitMin) && explicitMin > 0 && Number.isFinite(explicitMax) && explicitMax > 0) {
    return { minDays: Math.min(explicitMin, explicitMax), maxDays: Math.max(explicitMin, explicitMax) };
  }

  const direct = extractRangeFromUnknown(quote.deadlineDays);
  if (direct) return direct;

  if (quote.rawPayload && typeof quote.rawPayload === "object" && !Array.isArray(quote.rawPayload)) {
    const payload = quote.rawPayload as Record<string, unknown>;
    const candidates: unknown[] = [
      payload.custom_delivery_range,
      payload.delivery_range,
      payload.range,
      payload.custom_delivery_time,
      payload.delivery_time,
      payload.deadline,
      payload.time,
    ];
    for (const candidate of candidates) {
      const parsed = extractRangeFromUnknown(candidate);
      if (parsed) return parsed;
    }
  }

  return null;
}

function formatDeliveryDeadline(range: { minDays: number; maxDays: number } | null): string {
  if (!range) return "Prazo sob consulta";
  const minDays = Math.max(1, Math.round(Number(range.minDays || 0)));
  const maxDays = Math.max(minDays, Math.round(Number(range.maxDays || minDays)));
  if (minDays === maxDays) {
    if (minDays === 1) return "1 dia util";
    return `${minDays} dias uteis`;
  }
  return `de ${minDays} a ${maxDays} dias uteis`;
}

function formatMoneyCentsBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(cents || 0) / 100);
}

function resolveColorToken(rawColor: string): { cssColor: string; unknown: boolean } {
  const normalized = normalizeText(rawColor).replace(/[\s-_]/g, "");
  const map: Record<string, string> = {
    preto: "#111111",
    preta: "#111111",
    pretoenvernizado: "#101010",
    branco: "#f3f3f1",
    branca: "#f3f3f1",
    offwhite: "#f5f1e8",
    bege: "#d4c2a1",
    marrom: "#6a4a34",
    marromescuro: "#4b3629",
    azul: "#1d4f89",
    azulmarinho: "#22314f",
    cinza: "#8a8a8a",
    grafite: "#555a63",
    prata: "#c3c5c8",
    dourado: "#b6935e",
    verde: "#3d5f45",
    vermelho: "#8c2f2f",
    rosa: "#cf8ea5",
  };

  const cssColor = map[normalized];
  if (cssColor) return { cssColor, unknown: false };
  return { cssColor: "#7f7f7f", unknown: true };
}

function parseVariantColorFromKey(rawKey: string): string {
  const key = String(rawKey || "").trim();
  if (!key) return "";

  if (key.includes("__")) {
    const [color] = key.split("__");
    return String(color || "").trim();
  }

  if (key.includes("|")) {
    const parts = key.split("|").map((item) => String(item || "").trim());
    const colorPair = parts.find((part) => part.toLowerCase().startsWith("color:"));
    if (colorPair) return colorPair.slice("color:".length).trim();
    if (parts.length === 2) return parts[0] || "";
  }

  if (key.toLowerCase().startsWith("color:")) {
    return key.slice("color:".length).trim();
  }

  return "";
}

function hasColorStock(product: Product, rawColor: string): boolean {
  const color = normalizeText(rawColor);
  if (!color) return Math.max(0, Number(product.stock || 0)) > 0;

  const variants = Object.entries(product.variantStock || {});
  if (variants.length === 0) return true;

  let parsedVariantKeys = 0;
  for (const [key, qty] of variants) {
    const availableQty = Math.max(0, Number(qty || 0));
    if (availableQty <= 0) continue;

    const variantColor = parseVariantColorFromKey(key);
    if (!variantColor) continue;
    parsedVariantKeys += 1;

    if (normalizeText(variantColor) === color) return true;
  }

  if (parsedVariantKeys > 0) return false;

  // Fallback de seguranca para formatos antigos/invalidos de chave.
  return Math.max(0, Number(product.stock || 0)) > 0;
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
  const buyButtonRef = useRef<HTMLButtonElement | null>(null);
  const stickyToastTimerRef = useRef<number | null>(null);
  const addItem = useCartStore((state) => state.addItem);
  const clearError = useCartStore((state) => state.clearError);
  const { sizes, colors } = useMemo(() => getProductVariantOptions(product), [product]);
  const galleryImages = useMemo(() => buildGalleryImages(product), [product]);
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
  const [selectedColor, setSelectedColor] = useState("");
  const [feedback, setFeedback] = useState("");
  const [stickyToastMessage, setStickyToastMessage] = useState("");
  const [openDrawer, setOpenDrawer] = useState<DrawerKey | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [deliveryZip, setDeliveryZip] = useState("");
  const [isDeliveryLoading, setIsDeliveryLoading] = useState(false);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliverySummary, setDeliverySummary] = useState<{
    priceCents: number;
    deadlineRange: { minDays: number; maxDays: number } | null;
    serviceName: string;
    carrierName: string;
  } | null>(null);

  const colorRequired = colors.length > 0;
  const sizeRequired = sizes.length > 0;
  const isSingleUniqueSizeProduct = sizeRequired && sizes.length === 1 && isUniqueSizeLabel(sizes[0]);
  const hasValidColorSelection = !colorRequired || Boolean(String(selectedColor || "").trim());
  const hasValidSizeSelection = !sizeRequired || Boolean(String(selectedSize || "").trim());
  const canBuy = hasValidColorSelection && hasValidSizeSelection;
  const selectedColorLabel = hasValidColorSelection ? selectedColor : "Selecione";
  const drawerSizes = useMemo(() => (sizes.length > 0 ? sizes : [...GLOBAL_SIZES]), [sizes]);

  const getDrawerStockBySize = useCallback(
    (size: string) => {
      const normalizedSize = String(size || "").trim();
      if (!normalizedSize) return 0;
      const variantEntries = Object.entries(product.variantStock || {});
      if (variantEntries.length === 0) return Math.max(0, Number(product.stock || 0));

      const selectedColorStock = getVariantStockQty(product, {
        color: selectedColor || null,
        size: normalizedSize,
      });
      if (selectedColorStock > 0) return selectedColorStock;

      return variantEntries.reduce((sum, [rawKey, rawQty]) => {
        const key = String(rawKey || "").trim();
        if (!key) return sum;
        const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
        if (parts.length !== 2) return sum;
        const variantSize = String(parts[1] || "").trim().toLowerCase();
        if (variantSize !== normalizedSize.toLowerCase()) return sum;
        return sum + Math.max(0, Number(rawQty || 0));
      }, 0);
    },
    [product, selectedColor]
  );

  useEffect(() => {
    void trackCommerceEvent({
      eventName: "view_item",
      anonId: getOrCreateAnonId(),
      productId: String(product.sku || product.id || "").trim(),
      category: String(product.category || "").trim(),
      price: Number(product.priceValue || product.unitAmount || 0),
      currency: String(product.currency || "brl"),
      source: "product_page",
      attributes: {
        material: product.material,
        collection: product.collection,
      },
    });
  }, [product]);

  useEffect(() => {
    setSelectedColor((current) => (colors.includes(current) ? current : ""));
  }, [colors]);

  useEffect(() => {
    setSelectedSize((current) => (sizes.includes(current) ? current : ""));
  }, [sizes]);

  useEffect(() => {
    if (!isSingleUniqueSizeProduct) return;
    setSelectedSize("Unico");
  }, [isSingleUniqueSizeProduct]);

  useEffect(() => {
    return () => {
      if (stickyToastTimerRef.current) {
        window.clearTimeout(stickyToastTimerRef.current);
      }
    };
  }, []);

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
    const buyButtonElement = buyButtonRef.current;
    if (!buyButtonElement || typeof window === "undefined") return;

    if (typeof window.IntersectionObserver !== "function") {
      const syncSticky = () => {
        const rect = buyButtonElement.getBoundingClientRect();
        const outsideViewport = rect.bottom <= 0 || rect.top >= window.innerHeight;
        setShowStickyBar(outsideViewport);
      };

      syncSticky();
      window.addEventListener("scroll", syncSticky, { passive: true });
      window.addEventListener("resize", syncSticky, { passive: true });
      return () => {
        window.removeEventListener("scroll", syncSticky);
        window.removeEventListener("resize", syncSticky);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setShowStickyBar(!entry.isIntersecting);
      },
      {
        root: null,
        threshold: 0.01,
      }
    );

    observer.observe(buyButtonElement);
    return () => {
      observer.disconnect();
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

  const showStickyToast = useCallback((message: string, scrollToTop = false) => {
    if (typeof window !== "undefined") {
      if (scrollToTop) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    setStickyToastMessage(String(message || "").trim());
    if (stickyToastTimerRef.current) {
      window.clearTimeout(stickyToastTimerRef.current);
    }
    stickyToastTimerRef.current = window.setTimeout(() => {
      setStickyToastMessage("");
    }, 6000);
  }, []);

  const handleBuy = (source: "main" | "sticky" = "main") => {
    if (!canBuy) {
      if (source === "sticky") {
        showStickyToast("Você precisa escolher o tamanho e cor da peça", true);
      } else {
        setFeedback("Selecione cor e tamanho para continuar.");
        window.setTimeout(() => setFeedback(""), 1800);
      }
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

    if (source === "sticky") {
      showStickyToast(result.ok ? "Produto adicionado ao carrinho." : result.error || "Não foi possível adicionar.");
    }
    setFeedback(result.ok ? "Produto adicionado ao carrinho." : result.error || "Não foi possível adicionar.");
    window.setTimeout(() => setFeedback(""), 1800);
  };

  const handleApplySizeFromChart = (size: string) => {
    setSelectedSize(size);
    setOpenDrawer(null);
  };

  const handleEstimateDelivery = useCallback(async () => {
    const normalizedZip = normalizePostalCode(deliveryZip);
    if (normalizedZip.length !== 8) {
      setDeliverySummary(null);
      setDeliveryError("Informe um CEP valido com 8 digitos.");
      return;
    }

    setIsDeliveryLoading(true);
    setDeliveryError("");

    try {
      const response = await quoteShipping({ destinationZip: normalizedZip });
      const quotes = Array.isArray(response?.data?.quotes) ? response.data.quotes : [];
      if (quotes.length === 0) {
        setDeliverySummary(null);
        setDeliveryError("Nao foi possivel calcular para este CEP.");
        return;
      }

      const bestQuote = [...quotes].sort((a, b) => {
        const aRange = resolveQuoteDeadlineRange(a as unknown as { deadlineDays?: number | null; rawPayload?: unknown });
        const bRange = resolveQuoteDeadlineRange(b as unknown as { deadlineDays?: number | null; rawPayload?: unknown });
        const aMinDays = aRange ? aRange.minDays : Number.POSITIVE_INFINITY;
        const bMinDays = bRange ? bRange.minDays : Number.POSITIVE_INFINITY;
        if (aMinDays !== bMinDays) return aMinDays - bMinDays;
        return Number(a.priceCents || 0) - Number(b.priceCents || 0);
      })[0];

      setDeliverySummary({
        priceCents: Number(bestQuote.priceCents || 0),
        deadlineRange: resolveQuoteDeadlineRange(bestQuote as unknown as { deadlineDays?: number | null; rawPayload?: unknown }),
        serviceName: String(bestQuote.serviceName || ""),
        carrierName: String(bestQuote.carrierName || ""),
      });
      setDeliveryError("");
    } catch {
      setDeliverySummary(null);
      setDeliveryError("Nao foi possivel calcular agora. Tente novamente.");
    } finally {
      setIsDeliveryLoading(false);
    }
  }, [deliveryZip]);

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
          <button type="button" className={styles.stickyBuyButton} onClick={() => handleBuy("sticky")}>
            Adicionar
          </button>
        </div>
      </div>
      {stickyToastMessage ? (
        <div className={styles.stickySelectionWarning} role="status" aria-live="polite">
          {stickyToastMessage}
        </div>
      ) : null}
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
              <span>{selectedColorLabel}</span>
            </div>

            <div className={styles.swatches}>
              {colors.map((color) => {
                const token = resolveColorToken(color);
                const isAvailable = hasColorStock(product, color);
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

            {!isSingleUniqueSizeProduct ? (
              <div className={styles.sizeSelectorRow}>
                <button type="button" className={styles.sizeTrigger} onClick={() => setOpenDrawer("size-chart")}>
                  <span>{selectedSize ? `Tamanho: ${selectedSize}` : "Selecionar tamanho"}</span>
                  <span className={styles.chevron}>&#8964;</span>
                </button>
                <button type="button" className={styles.sizeTableButton} onClick={() => setOpenDrawer("size-chart")}>
                  Tabela de tamanhos
                </button>
              </div>
            ) : null}
            <button type="button" className={styles.buyButton} onClick={() => handleBuy("main")} ref={buyButtonRef}>
              Adicionar ao carrinho
            </button>

            {feedback ? <p className={styles.feedback}>{feedback}</p> : null}
            <section className={styles.deliveryEstimate} aria-label="Previsao de entrega">
              <h3 className={styles.deliveryTitle}>Previsao de entrega</h3>
              <div className={styles.deliveryForm}>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="Digite seu CEP"
                  value={formatPostalCode(deliveryZip)}
                  onChange={(event) => {
                    setDeliveryZip(normalizePostalCode(event.target.value));
                    setDeliveryError("");
                  }}
                  className={styles.deliveryInput}
                  aria-label="CEP para calcular entrega"
                />
                <button
                  type="button"
                  className={styles.deliveryButton}
                  onClick={() => void handleEstimateDelivery()}
                  disabled={isDeliveryLoading}
                >
                  {isDeliveryLoading ? "Calculando..." : "Calcular"}
                </button>
              </div>
              {deliverySummary ? (
                <p className={styles.deliveryResult}>
                  {formatDeliveryDeadline(deliverySummary.deadlineRange)} - {formatMoneyCentsBRL(deliverySummary.priceCents)}
                  {deliverySummary.serviceName ? ` (${deliverySummary.serviceName})` : ""}
                </p>
              ) : null}
              {deliveryError ? <p className={styles.deliveryError}>{deliveryError}</p> : null}
            </section>

            <div className={styles.infoRows}>
              <button type="button" onClick={() => setOpenDrawer("details")}>Detalhes do produto</button>
              <button type="button" onClick={() => setOpenDrawer("materials")}>Materiais e cuidados</button>
              <button type="button" onClick={() => setOpenDrawer("contact")}>Frete e devolução grátis</button>
              <button type="button" className={styles.lastServiceOption} onClick={() => setOpenDrawer("store")}>
                Marque um atendimento com nossa equipe
              </button>
            </div>
          </div>
          <p className={styles.signatureQuote}>
            <span>Construída para Presença.</span>
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
          {drawerSizes.map((size) => {
            const stock = getDrawerStockBySize(size);
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
          <li>Coleção: {product.collection}</li>
          <li>gênero: {product.gender}</li>
          <li>Código SKU: {product.sku}</li>
          <li>Modelagem: contemporânea com foco em alfaiataria e conforto.</li>
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
        title="Frete e devolução grátis"
        productImage={galleryImages[0] || product.image}
        productName={product.name}
        imageBaseUrl={imageBaseUrl}
        onClose={() => setOpenDrawer(null)}
      >
        <section className={styles.drawerSplitSection}>
          <h4>Frete</h4>
          <p className={styles.drawerParagraph}>
            Frete grátis para todo o Brasil em compras elegiveis. Trabalhamos com transportadoras parceiras e
            acompanhamento completo até a entrega.
          </p>
          <p className={styles.drawerParagraph}>
            Para capitais e regioes metropolitanas, o prazo medio e de 2 a 5 dias úteis. Para demais localidades,
            o prazo medio e de 4 a 8 dias úteis, podendo variar conforme o CEP.
          </p>
          <ul className={styles.drawerList}>
            <li>Prazo medio: 2 a 8 dias úteis, conforme CEP e disponibilidade.</li>
            <li>Código de rastreio enviado por e-mail apos faturamento.</li>
            <li>Duas tentativas de entrega no endereço informado; depois disso o pedido retorna ao centro logístico.</li>
            <li>Em caso de avaria no recebimento, recuse a entrega e entre em contato imediatamente.</li>
          </ul>
        </section>

        <section className={styles.drawerSplitSection}>
          <h4>devolução</h4>
          <p className={styles.drawerParagraph}>
            Nossa Política segue o Código de Defesa do Consumidor (Lei 8.078/90) para compras online.
          </p>
          <ul className={styles.drawerList}>
            <li>Troca e devolução em até 7 dias corridos apos recebimento.</li>
            <li>Produto deve retornar sem uso, com etiqueta e embalagem original.</li>
            <li>Estorno aprovado e processado em até 10 dias úteis apos conferencia do item devolvido.</li>
            <li>Itens personalizados podem ter regras específicas de arrependimento.</li>
          </ul>
          <p className={styles.drawerParagraph}>
            Se precisar de suporte durante o envio ou devolução, nossa equipe acompanha cada etapa em tempo real.
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
          <p>Nossa equipe acompanha sua escolha de tamanho, combinação e finalização do pedido.</p>
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


