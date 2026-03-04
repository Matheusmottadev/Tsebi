import type { Product } from "@/types";

export const GLOBAL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"] as const;
export type GlobalSize = (typeof GLOBAL_SIZES)[number];
export type FitIntent = "slim" | "regular" | "oversized";
export type FitLabel =
  | "Ajuste Perfeito"
  | "Ligeiramente Largo"
  | "Ligeiramente Apertado"
  | "Muito Largo"
  | "Muito Apertado";
export type ConfidenceLabel = "baixa" | "media" | "alta";

export type ProductSizeStock = Record<GlobalSize, number>;

export type ProductMeasurementProfile = {
  chest: number;
  waist: number;
  hip: number;
  shoulder: number;
  inseam: number;
};

export type ProductSizeModel = {
  productId: string;
  sizeSystem: "global";
  sizes: ProductSizeStock;
  measurementProfile: ProductMeasurementProfile;
  fitIntent: FitIntent;
};

export type SizeFinderStep1 = {
  gender: "MULHER" | "HOMEM";
  heightCm: number;
  weightKg: number;
  note?: string;
};

export type SizeFinderStep2 = {
  shoulders: number;
  chest: number;
  waist: number;
  hips: number;
  inseam: number;
};

export type SizeFinderAnswers = SizeFinderStep1 & SizeFinderStep2;

export type RecommendSizeResult = {
  recommendedSize: GlobalSize;
  fitLabel: FitLabel;
  confidence: ConfidenceLabel;
  stockNotice?: string;
};

export const SIZE_FINDER_STORAGE_KEY = "tsebi:size-finder:v1";

const SIZE_SCORE: Record<GlobalSize, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
};

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 4;
  return Math.max(1, Math.min(7, Math.round(value)));
}

function fitIntentOffset(fitIntent: FitIntent): number {
  if (fitIntent === "slim") return 0.25;
  if (fitIntent === "oversized") return -0.2;
  return 0;
}

function normalizeSize(raw: string): GlobalSize | null {
  const upper = String(raw || "").trim().toUpperCase();
  return GLOBAL_SIZES.includes(upper as GlobalSize) ? (upper as GlobalSize) : null;
}

function nearestSize(score: number): GlobalSize {
  const rounded = Math.max(1, Math.min(6, Math.round(score)));
  return GLOBAL_SIZES[rounded - 1];
}

function scoreToConfidence(distance: number): ConfidenceLabel {
  if (distance <= 0.25) return "alta";
  if (distance <= 0.7) return "media";
  return "baixa";
}

function scoreToFitLabel(distance: number): FitLabel {
  if (distance <= 0.2) return "Ajuste Perfeito";
  if (distance <= 0.6) return "Ligeiramente Largo";
  return "Muito Largo";
}

function existsStock(model: ProductSizeModel, size: GlobalSize): boolean {
  return Number(model.sizes[size] || 0) > 0;
}

function closestAvailableSize(model: ProductSizeModel, size: GlobalSize): GlobalSize | null {
  if (existsStock(model, size)) return size;
  const target = SIZE_SCORE[size];
  let best: GlobalSize | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of GLOBAL_SIZES) {
    if (!existsStock(model, candidate)) continue;
    const distance = Math.abs(SIZE_SCORE[candidate] - target);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

export function buildProductSizeModel(product: Product): ProductSizeModel {
  const baseStock: ProductSizeStock = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  const variantEntries = Object.entries(product.variantStock || {});
  for (const rawSize of Array.isArray(product.sizes) ? product.sizes : []) {
    const size = normalizeSize(rawSize);
    if (!size) continue;
    const stockFromVariant = variantEntries.reduce((sum, [key, qty]) => {
      const canonicalKey = String(key || "").trim();
      if (!canonicalKey) return sum;
      const parts = canonicalKey.includes("__")
        ? canonicalKey.split("__")
        : canonicalKey.includes("|")
          ? canonicalKey.split("|")
          : [];
      if (parts.length !== 2) return sum;
      const variantSize = String(parts[1] || "").trim().toUpperCase();
      if (variantSize !== size) return sum;
      return sum + Math.max(0, Number(qty || 0));
    }, 0);
    const fallbackStock = Math.max(0, Number(product.stock || 0));
    const resolvedStock = stockFromVariant > 0 ? stockFromVariant : fallbackStock;
    baseStock[size] = Math.max(baseStock[size], resolvedStock);
  }

  const fallbackByCategory: ProductMeasurementProfile =
    product.category.toLowerCase().includes("cal")
      ? { chest: 98, waist: 82, hip: 100, shoulder: 45, inseam: 78 }
      : { chest: 100, waist: 84, hip: 102, shoulder: 46, inseam: 74 };

  const fitIntent: FitIntent = product.category.toLowerCase().includes("oversized")
    ? "oversized"
    : product.category.toLowerCase().includes("slim")
      ? "slim"
      : "regular";

  return {
    productId: product.id,
    sizeSystem: "global",
    sizes: baseStock,
    measurementProfile: fallbackByCategory,
    fitIntent,
  };
}

export function recommendSize(userData: SizeFinderAnswers, productProfile: ProductSizeModel): RecommendSizeResult {
  const heightScore = (userData.heightCm - 150) / 10;
  const weightScore = (userData.weightKg - 45) / 9;
  const bodyShapeScore =
    clampScale(userData.shoulders) * 0.12 +
    clampScale(userData.chest) * 0.24 +
    clampScale(userData.waist) * 0.24 +
    clampScale(userData.hips) * 0.24 +
    clampScale(userData.inseam) * 0.16;

  const rawScore =
    1 +
    heightScore * 0.23 +
    weightScore * 0.34 +
    bodyShapeScore * 0.42 +
    fitIntentOffset(productProfile.fitIntent);

  const candidate = nearestSize(rawScore);
  const available = closestAvailableSize(productProfile, candidate) || candidate;
  const targetDistance = Math.abs(SIZE_SCORE[available] - rawScore);

  let fitLabel = scoreToFitLabel(targetDistance);
  if (SIZE_SCORE[available] < rawScore - 0.6) {
    fitLabel = targetDistance > 1 ? "Muito Apertado" : "Ligeiramente Apertado";
  }

  return {
    recommendedSize: available,
    fitLabel,
    confidence: scoreToConfidence(targetDistance),
    stockNotice:
      candidate !== available
        ? `O tamanho recomendado ${candidate} esta sem estoque. Sugerimos ${available}.`
        : undefined,
  };
}

export function describeSelectedSize(base: RecommendSizeResult, selectedSize: GlobalSize): RecommendSizeResult {
  const diff = SIZE_SCORE[selectedSize] - SIZE_SCORE[base.recommendedSize];
  const absDiff = Math.abs(diff);

  let fitLabel: FitLabel;
  if (absDiff === 0) {
    fitLabel = base.fitLabel;
  } else if (diff < 0) {
    fitLabel = absDiff >= 2 ? "Muito Apertado" : "Ligeiramente Apertado";
  } else {
    fitLabel = absDiff >= 2 ? "Muito Largo" : "Ligeiramente Largo";
  }

  const confidence: ConfidenceLabel = absDiff === 0 ? base.confidence : absDiff === 1 ? "media" : "baixa";

  return {
    ...base,
    recommendedSize: selectedSize,
    fitLabel,
    confidence,
    stockNotice: undefined,
  };
}

export function loadStoredSizeFinderAnswers(): Partial<SizeFinderAnswers> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIZE_FINDER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<SizeFinderAnswers>;
  } catch {
    return null;
  }
}

export function storeSizeFinderAnswers(answers: Partial<SizeFinderAnswers>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIZE_FINDER_STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // ignore storage quota/private mode errors
  }
}
