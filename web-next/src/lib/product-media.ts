type ProductLikeWithMedia = {
  id?: string;
  image?: string;
  secondaryImage?: string;
  image2?: string;
  imageSecondary?: string;
  hoverImage?: string;
  images?: unknown;
  gallery?: unknown;
  media?: unknown;
  metadata?: unknown;
};

export const PRODUCT_IMAGE_POOL = [
  "/images/placeholder.jpg",
] as const;

export const PRODUCT_IMAGE_FALLBACK = PRODUCT_IMAGE_POOL[0];

function normalizeImageValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const nested =
      record.url ??
      record.src ??
      record.image ??
      record.path ??
      record.secure_url ??
      record.original ??
      record.large ??
      "";
    return normalizeImageValue(nested);
  }

  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;

  const clean = raw.replace(/^\.?\//, "");
  if (clean.startsWith("images/")) return `/${clean}`;
  if (clean.startsWith("produtos/")) return `/images/${clean}`;
  return `/${clean}`;
}

function normalizeImageList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.map((entry) => normalizeImageValue(entry)).filter(Boolean);
}

function normalizeImageCandidates(input: unknown): string[] {
  if (Array.isArray(input)) return normalizeImageList(input);

  const raw = String(input || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeImageList(parsed);
    } catch {
      // Ignore invalid JSON and keep fallback parsing below.
    }
  }

  if (/[|,;]/.test(raw)) {
    return raw
      .split(/[|,;]/)
      .map((entry) => normalizeImageValue(entry))
      .filter(Boolean);
  }

  const single = normalizeImageValue(raw);
  return single ? [single] : [];
}

export function collectProductMedia(item: ProductLikeWithMedia): string[] {
  const directCandidates = normalizeImageCandidates(item?.image);
  const direct = directCandidates[0] || "";
  const secondaryDirect =
    normalizeImageValue(item?.secondaryImage) ||
    normalizeImageValue(item?.image2) ||
    normalizeImageValue(item?.imageSecondary) ||
    normalizeImageValue(item?.hoverImage);
  let metadataRecord: Record<string, unknown> = {};
  if (item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)) {
    metadataRecord = item.metadata as Record<string, unknown>;
  } else {
    const rawMetadata = String(item?.metadata || "").trim();
    if (rawMetadata.startsWith("{") && rawMetadata.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawMetadata);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          metadataRecord = parsed as Record<string, unknown>;
        }
      } catch {
        metadataRecord = {};
      }
    }
  }

  const collected = [
    ...directCandidates,
    direct,
    secondaryDirect,
    ...normalizeImageList(item?.images),
    ...normalizeImageList(item?.gallery),
    ...normalizeImageList(item?.media),
    ...normalizeImageList(metadataRecord.images),
    ...normalizeImageList(metadataRecord.gallery),
    ...normalizeImageList(metadataRecord.media),
    normalizeImageValue(metadataRecord.secondaryImage),
    normalizeImageValue(metadataRecord.image2),
    normalizeImageValue(metadataRecord.hoverImage),
  ].filter(Boolean);
  const unique = Array.from(new Set(collected));
  return unique.length > 0 ? unique : [PRODUCT_IMAGE_FALLBACK];
}

export function buildHoverImagePair(item: ProductLikeWithMedia): { primary: string; secondary: string } {
  const media = collectProductMedia(item);
  const primary = media[0] || PRODUCT_IMAGE_FALLBACK;
  const candidate = media[1] || "";
  const secondary = candidate && candidate !== primary ? candidate : primary;
  return { primary, secondary };
}
