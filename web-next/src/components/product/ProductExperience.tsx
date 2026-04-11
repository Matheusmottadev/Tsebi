"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ProductImage } from "@/components/ProductImage";
import { Price } from "@/components/Price";
import { LegacyFooter } from "@/components/home-legacy/LegacyFooter";
import { collectProductMedia } from "@/lib/product-media";
import { buildVariantSnapshot, getProductVariantOptions, getVariantStockQty } from "@/lib/cart/cartItem";
import { useCartStore } from "@/lib/cart/cartStore";
import { getSmoothScrollEngine } from "@/lib/animation/smoothScrollEngine";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { getRecommendations, listProducts } from "@/services/products";
import type { Product, ProductAvailabilityStatus } from "@/types";
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
  return collectProductMedia(product).filter((entry) => entry.startsWith("/images/product/")).slice(0, 5);
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

function normalizeAvailabilityStatus(value: unknown, fallbackStock: number): ProductAvailabilityStatus {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "esgotado") return "esgotado";
  if (normalized === "esgotando") return "esgotando";
  if (normalized === "disponivel") return "disponivel";
  return Math.max(0, Number(fallbackStock || 0)) <= 0 ? "esgotado" : "disponivel";
}

function resolveAvailabilityStatusLabel(status: ProductAvailabilityStatus): string {
  if (status === "esgotado") return "Esgotado";
  if (status === "esgotando") return "Esgotando";
  return "Disponivel";
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
const MOBILE_TAILORED_LIMIT = 6;
type DrawerKey = "size-chart" | "details" | "materials" | "contact";

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

function buildMobileTailoredRecommendations(base: Product, primary: Product[], catalog: Product[], limit: number): Product[] {
  const seen = new Set<string>([String(base.id || "").trim()]);
  const merged: Product[] = [];

  for (const item of primary) {
    const key = String(item?.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) return merged;
  }

  const fallback = [...catalog]
    .filter((item) => {
      const key = String(item?.id || "").trim();
      return Boolean(key) && !seen.has(key);
    })
    .sort((a, b) => scoreRelatedProduct(base, b) - scoreRelatedProduct(base, a));

  for (const item of fallback) {
    const key = String(item?.id || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged.slice(0, limit);
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
  const tailoredProducts = useMemo(
    () =>
      [...recommendations]
        .sort((a, b) => scoreRelatedProduct(product, b) - scoreRelatedProduct(product, a))
        .slice(0, 4),
    [product, recommendations]
  );
  const mobileTailoredSeed = useMemo(
    () =>
      [...recommendations]
        .sort((a, b) => scoreRelatedProduct(product, b) - scoreRelatedProduct(product, a))
        .slice(0, MOBILE_TAILORED_LIMIT),
    [product, recommendations]
  );
  const [mobileTailoredProducts, setMobileTailoredProducts] = useState<Product[]>(mobileTailoredSeed);
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

  const galleryImages = useMemo(() => {
    const trimmedColor = String(selectedColor || "").trim();
    if (trimmedColor) {
      const colorUrls = (product.colorImages?.[trimmedColor] ?? [])
        .map((u) => normalizeImageValue(String(u || "").trim()))
        .filter(Boolean);
      if (colorUrls.length > 0) return colorUrls;
    }
    return buildGalleryImages(product);
  }, [product, selectedColor]);
  const [feedback, setFeedback] = useState("");
  const [stickyToastMessage, setStickyToastMessage] = useState("");
  const [openDrawer, setOpenDrawer] = useState<DrawerKey | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [activeMobileImageIndex, setActiveMobileImageIndex] = useState(0);
  const privateCareHref = "/account#private-care";
  const panelExpandedRef = useRef(false);
  const panelForcedOpenRef = useRef(false);
  const gallerySentinelRef = useRef<HTMLDivElement | null>(null);
  const mobileSheetRef = useRef<HTMLElement | null>(null);
  const mobileTailoredTrackRef = useRef<HTMLDivElement | null>(null);
  const mobileGalleryItemRefs = useRef<Array<HTMLElement | null>>([]);
  const sheetTouchStartY = useRef(0);

  const colorRequired = colors.length > 0;
  const sizeRequired = sizes.length > 0;
  const availabilityStatus = useMemo(
    () => normalizeAvailabilityStatus(product.availabilityStatus, Number(product.stock || 0)),
    [product.availabilityStatus, product.stock]
  );
  const availabilityStatusLabel = useMemo(() => resolveAvailabilityStatusLabel(availabilityStatus), [availabilityStatus]);
  const isSoldOutByAvailability = availabilityStatus === "esgotado";
  const isSingleUniqueSizeProduct = sizeRequired && sizes.length === 1 && isUniqueSizeLabel(sizes[0]);
  const hasValidColorSelection = !colorRequired || Boolean(String(selectedColor || "").trim());
  const hasValidSizeSelection = !sizeRequired || Boolean(String(selectedSize || "").trim());
  const canBuy = hasValidColorSelection && hasValidSizeSelection && !isSoldOutByAvailability;
  const selectedColorLabel = hasValidColorSelection ? selectedColor : "Selecione";
  const drawerSizes = useMemo(() => (sizes.length > 0 ? sizes : [...GLOBAL_SIZES]), [sizes]);

  const expandMobilePanel = useCallback((options?: { manual?: boolean }) => {
    if (options?.manual) {
      panelForcedOpenRef.current = true;
    }
    panelExpandedRef.current = true;
    document.body.style.overflow = "hidden";
    setPanelExpanded(true);
  }, []);

  const collapseMobilePanel = useCallback((options?: { manual?: boolean }) => {
    if (options?.manual) {
      panelForcedOpenRef.current = false;
    }
    panelExpandedRef.current = false;
    document.body.style.overflow = "";
    setPanelExpanded(false);
  }, []);

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
    setMobileTailoredProducts(mobileTailoredSeed);
  }, [mobileTailoredSeed]);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth > 767) return;
    if (mobileTailoredSeed.length >= MOBILE_TAILORED_LIMIT) return;

    let cancelled = false;

    const loadMobileTailoredProducts = async () => {
      let rankedRecommendations: Product[] = [];
      let catalog: Product[] = [];

      try {
        const recommendationResponse = await getRecommendations(product.id, MOBILE_TAILORED_LIMIT);
        const fetchedRecommendations = Array.isArray(recommendationResponse?.recommendations)
          ? recommendationResponse.recommendations
          : [];
        rankedRecommendations = [...fetchedRecommendations]
          .filter((item) => String(item?.id || "").trim() && String(item.id) !== String(product.id))
          .sort((a, b) => scoreRelatedProduct(product, b) - scoreRelatedProduct(product, a))
          .slice(0, MOBILE_TAILORED_LIMIT);

        if (rankedRecommendations.length >= MOBILE_TAILORED_LIMIT) {
          if (!cancelled) setMobileTailoredProducts(rankedRecommendations);
          return;
        }
      } catch {
        // Ignore and fall back to catalog below.
      }

      try {
        catalog = await listProducts();
      } catch {
        catalog = [];
      }

      try {
        const combinedRecommendations = buildMobileTailoredRecommendations(product, rankedRecommendations, catalog, MOBILE_TAILORED_LIMIT);

        if (!cancelled) {
          setMobileTailoredProducts(combinedRecommendations);
        }
      } catch {
        if (!cancelled) {
          const fallbackRecommendations = buildMobileTailoredRecommendations(product, [], catalog, MOBILE_TAILORED_LIMIT);
          setMobileTailoredProducts(fallbackRecommendations);
        }
      }
    };

    void loadMobileTailoredProducts();

    return () => {
      cancelled = true;
    };
  }, [product, mobileTailoredSeed]);

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

  useEffect(() => {
    setPanelExpanded(false);
    setActiveMobileImageIndex(0);
    panelExpandedRef.current = false;
    panelForcedOpenRef.current = false;
    if (mobileSheetRef.current) mobileSheetRef.current.scrollTop = 0;
    document.body.style.overflow = "";
  }, [product.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth > 767) return;

    let rafId = 0;

    const updateActiveImage = () => {
      const items = mobileGalleryItemRefs.current.filter(Boolean) as HTMLElement[];
      if (items.length === 0) return;

      const anchorY = Math.round(window.innerHeight * 0.34);
      let nextIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (const item of items) {
        const rect = item.getBoundingClientRect();
        const index = Number(item.dataset.galleryIndex ?? -1);
        if (index < 0) continue;

        if (anchorY >= rect.top && anchorY <= rect.bottom) {
          nextIndex = index;
          closestDistance = 0;
          break;
        }

        const distance = Math.min(Math.abs(anchorY - rect.top), Math.abs(anchorY - rect.bottom));
        if (distance < closestDistance) {
          closestDistance = distance;
          nextIndex = index;
        }
      }

      setActiveMobileImageIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const onScroll = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(updateActiveImage);
    };

    updateActiveImage();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [galleryImages.length, product.id]);

  const renderMobileGalleryDots = () => {
    if (galleryImages.length <= 1) return null;

    return (
      <div className={styles.mobileGalleryDots} aria-hidden="true">
        {galleryImages.map((_, i) => (
          <span
            key={i}
            className={`${styles.mobileGalleryDot}${i === activeMobileImageIndex ? ` ${styles.mobileGalleryDotActive}` : i < activeMobileImageIndex ? ` ${styles.mobileGalleryDotDone}` : ""}`}
          />
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    // After collapse transition ends → reset internal scroll to top
    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName !== "transform") return;
      const sheet = mobileSheetRef.current;
      if (!sheet) return;
      if (!panelExpandedRef.current) {
        sheet.scrollTop = 0;
      }
    };

    const check = () => {
      if (window.innerWidth > 767) return;
      if (panelForcedOpenRef.current) return;
      const sentinel = gallerySentinelRef.current;
      if (!sentinel) return;
      const rect = sentinel.getBoundingClientRect();
      const shouldExpand = rect.top <= window.innerHeight - 192 - 64;
      if (shouldExpand === panelExpandedRef.current) return;
      if (shouldExpand) {
        expandMobilePanel();
        return;
      }
      collapseMobilePanel();
    };

    const sheet = mobileSheetRef.current;
    sheet?.addEventListener("transitionend", onTransitionEnd);
    window.addEventListener("scroll", check, { passive: true });
    check();
    return () => {
      window.removeEventListener("scroll", check);
      sheet?.removeEventListener("transitionend", onTransitionEnd);
      document.body.style.overflow = "";
    };
  }, [collapseMobilePanel, expandMobilePanel, product.id, galleryImages.length]);

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

  // Reseta galeria ao trocar cor
  useEffect(() => {
    setActiveMobileImageIndex(0);
    resetMediaMotion();
  }, [selectedColor, resetMediaMotion]);

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
      if (metrics.maxMediaScroll <= 0) {
        refreshMetrics();
        if (metricsRef.current.maxMediaScroll <= 0) return;
      }
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
  }, [openDrawer, refreshMetrics, resetMediaMotion, startMediaAnimation]);

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

  const scrollMobileTailored = useCallback((direction: -1 | 1) => {
    const track = mobileTailoredTrackRef.current;
    if (!track) return;
    const amount = track.clientWidth;
    track.scrollBy({ left: amount * direction, behavior: "smooth" });
  }, []);

  const runBuyFlow = useCallback((source: "main" | "sticky" = "main") => {
    if (isSoldOutByAvailability) {
      if (source === "sticky") {
        showStickyToast("Produto esgotado.");
      } else {
        setFeedback("Produto esgotado.");
      }
      return;
    }

    if (!canBuy) {
      if (source === "sticky") {
        showStickyToast("Você precisa escolher o tamanho e cor da peça", true);
      } else {
        setFeedback("Selecione cor e tamanho para continuar.");
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
  }, [
    addItem,
    canBuy,
    clearError,
    isSoldOutByAvailability,
    product.currency,
    product.id,
    product.image,
    product.name,
    product.unitAmount,
    selectedColor,
    selectedSize,
    showStickyToast,
  ]);

  const handleBuy = (source: "main" | "sticky" = "main") => {
    if (typeof window !== "undefined" && window.innerWidth <= 767 && source === "main" && !panelExpandedRef.current) {
      expandMobilePanel({ manual: true });
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          runBuyFlow(source);
        });
      });
      return;
    }

    runBuyFlow(source);
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
          <button
            type="button"
            className={styles.stickyBuyButton}
            onClick={() => handleBuy("sticky")}
            disabled={isSoldOutByAvailability}
          >
            {isSoldOutByAvailability ? "Esgotado" : "Adicionar"}
          </button>
        </div>
      </div>
      {stickyToastMessage ? (
        <div className={styles.stickySelectionWarning} role="status" aria-live="polite">
          {stickyToastMessage}
        </div>
      ) : null}
      <main className={styles.main} ref={mainRef}>
        <section className={styles.mobileHeroStack} aria-label="Galeria do produto">
          {renderMobileGalleryDots()}
          <figure
            className={styles.mobileHeroFigure}
            ref={(node) => { mobileGalleryItemRefs.current[0] = node; }}
            data-gallery-index={0}
          >
            <ProductImage
              src={galleryImages[0] || product.image || ""}
              alt={`${product.name} - foto principal`}
              width={1280}
              height={1700}
              className={styles.mobileHeroImage}
              imageBaseUrl={imageBaseUrl}
              priority
            />
          </figure>

          {/* Fixed bottom panel — collapsed: name+price+buy / expanded: full info */}
          <section
            ref={mobileSheetRef}
            className={`${styles.mobileIntroCard}${panelExpanded ? ` ${styles.mobileIntroCardExpanded}` : ""}`}
            aria-label="Informações do produto"
            onTouchStart={(e) => { sheetTouchStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              const dy = sheetTouchStartY.current - e.changedTouches[0].clientY;
              const sheet = mobileSheetRef.current;
              if (!panelExpandedRef.current && dy > 40) {
                // Swipe up on collapsed panel → expand
                expandMobilePanel({ manual: true });
              } else if (panelExpandedRef.current && dy < -40 && (sheet?.scrollTop ?? 0) <= 2) {
                // Swipe down from top of expanded panel → collapse
                collapseMobilePanel({ manual: true });
              }
            }}
          >
            <button
              type="button"
              className={styles.mobileSheetHandleButton}
              aria-label="Expandir informações do produto"
              onClick={() => expandMobilePanel({ manual: true })}
            >
              <span className={styles.mobileSheetHandleBar} aria-hidden="true" />
            </button>
            <p className={styles.mobileCollection}>{product.collection || "Colecao atual"}</p>
            <h1 className={styles.mobileTitle}>{product.name}</h1>
            <Price amountCents={product.unitAmount} currency={product.currency} className={styles.mobilePrice} />
            {/* Collapsed CTA — hidden when expanded */}
            <button
              type="button"
              className={styles.mobileIntroBuyButton}
              onClick={() => handleBuy("main")}
              disabled={isSoldOutByAvailability}
            >
              {isSoldOutByAvailability ? "Esgotado" : "Adicionar ao carrinho"}
            </button>

            {/* Expanded content */}
            <div className={styles.mobileExpandedBody}>
              {colors.length > 0 ? (
                <>
                  <div className={styles.colorRow}>
                    <span>Cor</span>
                    <span>{selectedColorLabel}</span>
                  </div>
                  <div className={styles.swatches}>
                    {colors.map((color) => {
                      const token = resolveColorToken(color);
                      const isAvailable = !isSoldOutByAvailability && hasColorStock(product, color);
                      return (
                        <button
                          key={color}
                          type="button"
                          className={`${styles.swatch}${selectedColor === color ? ` ${styles.swatchActive}` : ""}${!isAvailable ? ` ${styles.swatchDisabled}` : ""}`}
                          aria-label={`Selecionar cor ${color}`}
                          onClick={() => { if (!isAvailable) return; setSelectedColor(color); }}
                          disabled={!isAvailable}
                          style={{ backgroundColor: token.cssColor }}
                        />
                      );
                    })}
                  </div>
                </>
              ) : null}

              {!isSingleUniqueSizeProduct ? (
                <div className={styles.sizeSelectorRow}>
                  <button type="button" className={styles.sizeTrigger} onClick={() => setOpenDrawer("size-chart")}>
                    <span>{selectedSize ? `Tamanho: ${selectedSize}` : "Selecionar tamanho"}</span>
                    <span className={styles.chevron}>&#8964;</span>
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className={styles.buyButton}
                onClick={() => handleBuy("main")}
                disabled={isSoldOutByAvailability}
              >
                {isSoldOutByAvailability ? "Esgotado" : "Adicionar ao carrinho"}
              </button>

              {feedback ? <p className={styles.feedback}>{feedback}</p> : null}

              <div className={styles.infoRows}>
                <button type="button" onClick={() => setOpenDrawer("details")}>Detalhes do produto</button>
                {!isSingleUniqueSizeProduct ? (
                  <button type="button" onClick={() => setOpenDrawer("size-chart")}>Tabela de tamanhos</button>
                ) : null}
                <button type="button" onClick={() => setOpenDrawer("materials")}>Materiais e cuidados</button>
                <button type="button" onClick={() => setOpenDrawer("contact")}>Frete e devolução</button>
              </div>

              {mobileTailoredProducts.length > 0 ? (
                <section className={styles.mobileTailored} aria-label="Tem a sua cara">
                  <header className={styles.tailoredHeader}>
                    <h2>Tem a sua cara</h2>
                  </header>
                  <div className={styles.mobileTailoredCarousel}>
                    <button
                      type="button"
                      className={`${styles.mobileTailoredArrow} ${styles.mobileTailoredArrowPrev}`}
                      onClick={() => scrollMobileTailored(-1)}
                      aria-label="Ver produtos anteriores"
                    >
                      &#8249;
                    </button>
                    <div className={styles.mobileTailoredTrack} ref={mobileTailoredTrackRef}>
                      {mobileTailoredProducts.map((item) => {
                        const cardImages = resolveTailoredCardImages(item, galleryImages);
                        return (
                          <a
                            key={item.id}
                            href={`/product/${encodeURIComponent(item.id)}`}
                            className={`${styles.tailoredCard} ${styles.mobileTailoredCard}`}
                          >
                            <div className={styles.tailoredMedia}>
                              <ProductImage src={cardImages.primary} alt={item.name} width={900} height={1200} className={`${styles.tailoredImage} ${styles.tailoredImagePrimary}`} imageBaseUrl={imageBaseUrl} />
                              <ProductImage src={cardImages.secondary} alt={`${item.name} - segunda foto`} width={900} height={1200} className={`${styles.tailoredImage} ${styles.tailoredImageSecondary}`} imageBaseUrl={imageBaseUrl} />
                            </div>
                            <div className={styles.mobileTailoredMeta}>
                              <p className={styles.tailoredName}>{item.name}</p>
                              <Price amountCents={item.unitAmount} currency={item.currency} className={styles.tailoredPrice} />
                              {Array.isArray(item.colors) && item.colors.length > 0 ? (
                                <div className={styles.mobileTailoredColors} aria-label="Cores disponíveis">
                                  {item.colors.slice(0, 5).map((color) => {
                                    const token = resolveColorToken(color);
                                    return (
                                      <span
                                        key={`${item.id}-${color}`}
                                        className={styles.mobileTailoredColorDot}
                                        title={color}
                                        aria-label={color}
                                        style={{ backgroundColor: token.cssColor }}
                                      />
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className={`${styles.mobileTailoredArrow} ${styles.mobileTailoredArrowNext}`}
                      onClick={() => scrollMobileTailored(1)}
                      aria-label="Ver próximos produtos"
                    >
                      &#8250;
                    </button>
                  </div>
                </section>
              ) : null}

              <div className={styles.mobilePanelFooter}>
                <LegacyFooter variant="light" />
              </div>
            </div>
          </section>

          {galleryImages.slice(1).length > 0 ? (
            <div className={styles.mobileGalleryStack}>
              {galleryImages.slice(1).map((src, index) => (
                <figure
                  key={`mobile-${src}-${index}`}
                  className={styles.mobileGalleryItem}
                  ref={(node) => { mobileGalleryItemRefs.current[index + 1] = node; }}
                  data-gallery-index={index + 1}
                >
                  <ProductImage
                    src={src}
                    alt={`${product.name} - foto ${index + 2}`}
                    width={1280}
                  height={1700}
                  className={styles.mobileGalleryImage}
                  imageBaseUrl={imageBaseUrl}
                />
                </figure>
              ))}
            </div>
          ) : null}

          {/* Sentinel: triggers panel expansion when end of gallery is reached */}
          <div ref={gallerySentinelRef} className={styles.mobileGallerySentinel} aria-hidden="true" />
        </section>

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
            <div className={styles.desktopIntroBlock}>
              <p className={styles.sku}>{product.sku}</p>
              <h1 className={styles.title}>{product.name}</h1>
              <Price amountCents={product.unitAmount} currency={product.currency} className={styles.price} />
            </div>
            <div className={styles.colorRow}>
              <span>Cor</span>
              <span>{selectedColorLabel}</span>
            </div>

            <div className={styles.swatches}>
              {colors.map((color) => {
                const token = resolveColorToken(color);
                const isAvailable = !isSoldOutByAvailability && hasColorStock(product, color);
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
            <button
              type="button"
              className={styles.buyButton}
              onClick={() => handleBuy("main")}
              ref={buyButtonRef}
              disabled={isSoldOutByAvailability}
            >
              {isSoldOutByAvailability ? "Esgotado" : "Adicionar ao carrinho"}
            </button>

            {feedback ? <p className={styles.feedback}>{feedback}</p> : null}


            <div className={styles.infoRows}>
              <button type="button" onClick={() => setOpenDrawer("details")}>Detalhes do produto</button>
              <button type="button" onClick={() => setOpenDrawer("materials")}>Materiais e cuidados</button>
              <button type="button" onClick={() => setOpenDrawer("contact")}>Frete e devolução grátis</button>
              <button
                type="button"
                className={styles.lastServiceOption}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.location.href = privateCareHref;
                  }
                }}
              >
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
            const disabled = isSoldOutByAvailability || stock <= 0;
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
                <small>{availabilityStatusLabel}</small>
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
            <li>Código de rastreio enviado por e-mail após faturamento.</li>
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
            <li>Troca e devolução em até 7 dias corridos após recebimento.</li>
            <li>Produto deve retornar sem uso, com etiqueta e embalagem original.</li>
            <li>Estorno aprovado e processado em até 10 dias úteis após conferência do item devolvido.</li>
            <li>Itens personalizados podem ter regras específicas de arrependimento.</li>
          </ul>
          <p className={styles.drawerParagraph}>
            Se precisar de suporte durante o envio ou devolução, nossa equipe acompanha cada etapa em tempo real.
          </p>
        </section>
      </Drawer>

      <Drawer
        open={false}
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
