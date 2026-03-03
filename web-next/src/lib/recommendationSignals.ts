import { readCartSnapshot } from "@/lib/cart/storage";

const STORAGE_KEY = "tsebi.recommendation.signals.v1";

type RecommendationSignalState = {
  searches: string[];
  productClicks: string[];
  viewedSkus: string[];
  categoryDurations: Record<string, number>;
  priceBandHits: Record<string, number>;
  updatedAt: string;
};

export type RecommendationSignalPayload = {
  topCategory: string;
  topClickedSku: string;
  topPriceBand: "low" | "mid" | "high" | "";
  searches: string[];
  recentViewed: string[];
  cartSkus: string[];
};

function emptyState(): RecommendationSignalState {
  return {
    searches: [],
    productClicks: [],
    viewedSkus: [],
    categoryDurations: {},
    priceBandHits: {},
    updatedAt: new Date().toISOString(),
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalize(value: string): string {
  return String(value || "").trim();
}

function readState(): RecommendationSignalState {
  if (!isBrowser()) return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as RecommendationSignalState;
    if (!parsed || typeof parsed !== "object") return emptyState();
    return {
      searches: Array.isArray(parsed.searches) ? parsed.searches.map(normalize).filter(Boolean).slice(-20) : [],
      productClicks: Array.isArray(parsed.productClicks) ? parsed.productClicks.map(normalize).filter(Boolean).slice(-40) : [],
      viewedSkus: Array.isArray(parsed.viewedSkus) ? parsed.viewedSkus.map(normalize).filter(Boolean).slice(-40) : [],
      categoryDurations: parsed.categoryDurations && typeof parsed.categoryDurations === "object" ? parsed.categoryDurations : {},
      priceBandHits: parsed.priceBandHits && typeof parsed.priceBandHits === "object" ? parsed.priceBandHits : {},
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: RecommendationSignalState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function bumpCounter(record: Record<string, number>, key: string, amount = 1): Record<string, number> {
  const safeKey = normalize(key);
  if (!safeKey) return record;
  return { ...record, [safeKey]: Math.max(0, Number(record[safeKey] || 0) + amount) };
}

function mostFrequent(list: string[]): string {
  const counts = new Map<string, number>();
  list.forEach((entry) => counts.set(entry, (counts.get(entry) || 0) + 1));
  let top = "";
  let max = -1;
  counts.forEach((count, key) => {
    if (count > max) {
      max = count;
      top = key;
    }
  });
  return top;
}

function maxKeyByValue(record: Record<string, number>): string {
  let top = "";
  let max = -1;
  Object.entries(record || {}).forEach(([key, value]) => {
    const safeValue = Number(value || 0);
    if (safeValue > max) {
      max = safeValue;
      top = key;
    }
  });
  return top;
}

export function trackRecommendationSearch(query: string): void {
  const term = normalize(query);
  if (term.length < 2) return;
  const state = readState();
  state.searches = [...state.searches, term].slice(-20);
  state.updatedAt = new Date().toISOString();
  writeState(state);
}

export function trackRecommendationProductInteraction(input: {
  sku: string;
  category?: string;
  priceValue?: number;
  viewed?: boolean;
}): void {
  const sku = normalize(input.sku);
  if (!sku) return;
  const state = readState();
  state.productClicks = [...state.productClicks, sku].slice(-40);
  if (input.viewed !== false) {
    state.viewedSkus = [...state.viewedSkus, sku].slice(-40);
  }
  const category = normalize(input.category || "");
  if (category) {
    state.categoryDurations = bumpCounter(state.categoryDurations, category, 1);
  }
  const price = Number(input.priceValue || 0);
  if (price > 0) {
    const band: "low" | "mid" | "high" = price < 300 ? "low" : price < 900 ? "mid" : "high";
    state.priceBandHits = bumpCounter(state.priceBandHits, band, 1);
  }
  state.updatedAt = new Date().toISOString();
  writeState(state);
}

export function trackRecommendationCategoryVisit(category: string, dwellMs = 4000): void {
  const safeCategory = normalize(category);
  if (!safeCategory) return;
  const amount = Math.max(1, Math.round(Number(dwellMs || 0) / 1000));
  const state = readState();
  state.categoryDurations = bumpCounter(state.categoryDurations, safeCategory, amount);
  state.updatedAt = new Date().toISOString();
  writeState(state);
}

export function buildRecommendationSignalPayload(): RecommendationSignalPayload {
  const state = readState();
  const cart = readCartSnapshot();
  const cartSkus = Array.from(
    new Set((cart?.items || []).map((item) => normalize(item.productId)).filter(Boolean))
  ).slice(0, 12);

  return {
    topCategory: maxKeyByValue(state.categoryDurations),
    topClickedSku: mostFrequent(state.productClicks),
    topPriceBand: (maxKeyByValue(state.priceBandHits) as "low" | "mid" | "high" | "") || "",
    searches: state.searches.slice(-6),
    recentViewed: state.viewedSkus.slice(-8),
    cartSkus,
  };
}
