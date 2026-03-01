export {};
type JsonRecord = Record<string, unknown>;

type QueryResult<TRow extends JsonRecord> = {
  rows: TRow[];
  rowCount: number;
};

const { query } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const DEFAULT_IMAGE = "images/placeholderreal.webp";
const STOREFRONT_DEFAULT_PRICE_CENTS = 100;

export type VariantStockMap = Record<string, number>;

export type ListAdminProductsOptions = {
  limit?: number;
  offset?: number;
  search?: string;
  includeInactive?: boolean;
};

export type SearchAdminProductsOptions = {
  query?: string;
  status?: string;
  stock?: string;
  page?: number;
  pageSize?: number;
};

export type ProductWritePayload = {
  sku?: string;
  name?: string;
  priceCents?: number;
  stockQty?: number;
  currency?: string;
  active?: boolean;
  imageUrl?: string | null;
  sizes?: string[];
  colors?: string[];
  variantStock?: VariantStockMap;
};

type ProductStaticMetadata = {
  collection?: string;
  category?: string;
  material?: string;
  sizes?: string[];
  colors?: string[];
  gender?: string;
  image?: string;
  secondaryImage?: string;
  nameEn?: string;
};

type ProductMetadata = {
  sizes: string[];
  colors: string[];
  variantStock: VariantStockMap;
};

type ProductRow = JsonRecord & {
  id?: string;
  sku?: string;
  name?: string;
  price_cents?: number;
  stock_qty?: number;
  currency?: string;
  active?: boolean;
  image_url?: string | null;
  metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Product = {
  id: string;
  sku: string;
  dbId?: string;
  name: string;
  nameEn: string;
  collection: string;
  category: string;
  material: string;
  sizes: string[];
  colors: string[];
  variantStock: VariantStockMap;
  gender: string;
  priceLabel: string;
  priceValue: number;
  unitAmount: number;
  currency: string;
  stock: number;
  active: boolean;
  image: string;
  secondaryImage?: string;
  createdAt: string | null;
  updatedAt: string | null;
  href: string;
};

const PRODUCT_METADATA: Record<string, ProductStaticMetadata> = {
  "genesis-bomber": {
    collection: "GÃªnesis",
    category: "Jaquetas",
    material: "Couro e lÃ£",
    sizes: ["P", "M", "G"],
    colors: ["Vermelho", "Areia"],
    gender: "Unissex",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Italian leather bomber jacket with silk lining"
  },
  "genesis-tailored": {
    collection: "GÃªnesis",
    category: "CalÃ§as",
    material: "Sarja premium",
    sizes: ["36", "38", "40", "42"],
    colors: ["Grafite", "Preto"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Premium structured tailored twill pants"
  },
  "origem-shirt": {
    collection: "Alicerce",
    category: "Camisas",
    material: "AlgodÃ£o egÃ­pcio",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Branco", "Azul"],
    gender: "Masculino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Croatian cotton shirt with noble weave"
  },
  "origem-skirt": {
    collection: "Alicerce",
    category: "Saias",
    material: "LÃ£ fria",
    sizes: ["36", "38", "40"],
    colors: ["Preto", "Marfim"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Structured cool wool skirt with impeccable finish"
  },
  "atelier-bag": {
    collection: "Alicerce",
    category: "Bolsas",
    material: "Couro natural",
    sizes: ["Ãšnico"],
    colors: ["Caramelo", "Preto"],
    gender: "Unissex",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Natural leather bag with plated hardware"
  },
  "atelier-heels": {
    collection: "GÃªnesis",
    category: "CalÃ§ados",
    material: "Couro envernizado",
    sizes: ["35", "36", "37", "38", "39"],
    colors: ["Preto", "Vinho"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Patent leather pumps with sculpted heel"
  },
  "flux-trench": {
    collection: "Alicerce",
    category: "Casacos",
    material: "Gabardine",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Oliva"],
    gender: "Unissex",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Gabardine trench coat with architectural cut"
  },
  "flux-knit": {
    collection: "GÃªnesis",
    category: "Malhas",
    material: "LÃ£ merino",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Off white", "Cinza"],
    gender: "Masculino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Ultrafine merino wool knitwear"
  },
  "noir-dress": {
    collection: "GÃªnesis",
    category: "Vestidos",
    material: "Crepe de seda",
    sizes: ["36", "38", "40", "42"],
    colors: ["Preto"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Silk crepe column dress with couture drape"
  },
  "noir-sneaker": {
    collection: "Alicerce",
    category: "CalÃ§ados",
    material: "Nylon tÃ©cnico",
    sizes: ["37", "38", "39", "40", "41", "42"],
    colors: ["Preto", "Branco"],
    gender: "Unissex",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Technical nylon and premium-finish leather sneaker"
  },
  "essence-blazer": {
    collection: "Alicerce",
    category: "Blazers",
    material: "Linho premium",
    sizes: ["P", "M", "G"],
    colors: ["Marfim", "Bege"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Premium linen blazer with precision tailoring"
  },
  "essence-trousers": {
    collection: "GÃªnesis",
    category: "CalÃ§as",
    material: "Linho premium",
    sizes: ["36", "38", "40", "42", "44"],
    colors: ["Marfim", "Areia"],
    gender: "Feminino",
    image: "images/placeholderreal.webp",
    secondaryImage: "images/placeholderreal.webp",
    nameEn: "Premium linen wide-leg trousers with deep pleat"
  }
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeTextList(value: unknown, fallback: string[] = []): string[] {
  const list = Array.isArray(value) ? value : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  list.forEach((entry) => {
    const item = String(entry || "").trim();
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(item);
  });

  if (cleaned.length > 0) return cleaned;
  return Array.isArray(fallback) && fallback.length > 0 ? normalizeTextList(fallback, []) : [];
}

function sanitizeVariantStockMap(value: unknown, validColors: string[] = [], validSizes: string[] = []): VariantStockMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedPairs = new Set<string>();
  validColors.forEach((color) => {
    validSizes.forEach((size) => {
      allowedPairs.add(`${color}__${size}`);
    });
  });

  const normalized: VariantStockMap = {};
  Object.entries(value as JsonRecord).forEach(([rawKey, rawQty]) => {
    const key = String(rawKey || "").trim();
    if (!key) return;

    const splitByPipe = key.includes("|") ? key.split("|") : [];
    const canonicalKey =
      splitByPipe.length === 2
        ? `${String(splitByPipe[0] || "").trim()}__${String(splitByPipe[1] || "").trim()}`
        : key;

    if (!canonicalKey || !allowedPairs.has(canonicalKey)) return;
    const qty = Math.max(0, Math.floor(Number(rawQty || 0)));
    normalized[canonicalKey] = qty;
  });

  return normalized;
}

function normalizeProductMetadata(value: unknown, fallback: ProductStaticMetadata = {}): ProductMetadata {
  const raw = asRecord(value);
  const fallbackSizes = normalizeTextList(fallback.sizes, ["Ãšnico"]);
  const fallbackColors = normalizeTextList(fallback.colors, ["Ãšnico"]);
  const rawVariantStock = asRecord(raw.variantStock);

  const extractedColors: string[] = [];
  const extractedSizes: string[] = [];
  Object.keys(rawVariantStock).forEach((rawKey) => {
    const key = String(rawKey || "").trim();
    if (!key) return;
    const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
    if (parts.length !== 2) return;
    const color = String(parts[0] || "").trim();
    const size = String(parts[1] || "").trim();
    if (color) extractedColors.push(color);
    if (size) extractedSizes.push(size);
  });

  let sizes = normalizeTextList(
    [...normalizeTextList(raw.sizes, []), ...normalizeTextList(extractedSizes, [])],
    fallbackSizes.length ? fallbackSizes : ["Ãšnico"]
  );
  let colors = normalizeTextList(
    [...normalizeTextList(raw.colors, []), ...normalizeTextList(extractedColors, [])],
    fallbackColors.length ? fallbackColors : ["Ãšnico"]
  );
  let variantStock = sanitizeVariantStockMap(raw.variantStock ?? raw.variant_stock, colors, sizes);

  const looksLikeLegacyBlackOnly =
    colors.length === 1 &&
    String(colors[0] || "").trim().toLowerCase() === "preto" &&
    fallbackColors.length > 1 &&
    Object.keys(variantStock).length === 0;

  if (looksLikeLegacyBlackOnly) {
    colors = fallbackColors;
    sizes = fallbackSizes.length ? fallbackSizes : sizes;
    variantStock = sanitizeVariantStockMap(raw.variantStock ?? raw.variant_stock, colors, sizes);
  }

  return {
    sizes: sizes.length ? sizes : ["Ãšnico"],
    colors: colors.length ? colors : ["Ãšnico"],
    variantStock
  };
}

function formatPriceLabelFromCents(priceCents: unknown): string {
  const value = Math.max(0, Number(priceCents || 0) / 100);
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function mapProduct(row: ProductRow | null | undefined): Product {
  const sku = String(row?.sku || "").trim();
  const staticMetadata = PRODUCT_METADATA[sku] || {};
  const metadata = normalizeProductMetadata(row?.metadata, staticMetadata);
  const metadataRecord = asRecord(row?.metadata);
  const dbPriceCents = Math.max(0, Math.round(Number(row?.price_cents || 0)));
  const effectivePriceCents = dbPriceCents > 0 ? dbPriceCents : STOREFRONT_DEFAULT_PRICE_CENTS;
  const priceValue = effectivePriceCents / 100;
  const dbImage = String(row?.image_url || "").trim();
  const metadataImage = String(metadataRecord.image || metadataRecord.image_url || metadataRecord.imageUrl || "").trim();
  const metadataSecondaryImage = String(
    metadataRecord.secondaryImage || metadataRecord.secondary_image || metadataRecord.image2 || metadataRecord.hoverImage || ""
  ).trim();
  const resolvedImage = dbImage || metadataImage || DEFAULT_IMAGE;
  const resolvedSecondaryImage = metadataSecondaryImage;

  return {
    id: sku,
    sku,
    dbId: row?.id,
    name: String(row?.name || sku),
    nameEn: String(staticMetadata.nameEn || row?.name || sku),
    collection: String(staticMetadata.collection || "Alicerce"),
    category: String(staticMetadata.category || "ColeÃ§Ã£o"),
    material: String(staticMetadata.material || "Material premium"),
    sizes: metadata.sizes,
    colors: metadata.colors,
    variantStock: metadata.variantStock,
    gender: String(staticMetadata.gender || "Unissex"),
    priceLabel: formatPriceLabelFromCents(effectivePriceCents),
    priceValue,
    unitAmount: effectivePriceCents,
    currency: String(row?.currency || "brl").toLowerCase(),
    stock: Math.max(0, Number(row?.stock_qty || 0)),
    active: Boolean(row?.active),
    image: resolvedImage,
    secondaryImage: resolvedSecondaryImage || undefined,
    createdAt: (row?.created_at as string | null) || null,
    updatedAt: (row?.updated_at as string | null) || null,
    href: `produto.html?id=${encodeURIComponent(sku)}`
  };
}

function getErrorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code || "");
}

function getErrorMessage(error: unknown): string {
  return String((error as { message?: unknown })?.message || "");
}

function isMissingMetadataColumnError(error: unknown): boolean {
  return getErrorCode(error) === "42703" && /metadata/i.test(getErrorMessage(error));
}

let ensureMetadataColumnPromise: Promise<void> | null = null;

async function ensureProductsMetadataColumn(): Promise<void> {
  if (!ensureMetadataColumnPromise) {
    ensureMetadataColumnPromise = query(
      `
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      `
    )
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        ensureMetadataColumnPromise = null;
      });
  }

  await ensureMetadataColumnPromise;
}

async function queryWithOptionalMetadata(
  sqlWithMetadata: string,
  sqlWithoutMetadata: string,
  params: unknown[] = [],
  fallbackParams: unknown[] | null = null
): Promise<QueryResult<ProductRow>> {
  try {
    return await query<ProductRow>(sqlWithMetadata, params);
  } catch (error: unknown) {
    if (!isMissingMetadataColumnError(error) || !sqlWithoutMetadata) throw error;

    await ensureProductsMetadataColumn();

    try {
      return await query<ProductRow>(sqlWithMetadata, params);
    } catch (retryError: unknown) {
      if (!isMissingMetadataColumnError(retryError)) throw retryError;
      return query<ProductRow>(sqlWithoutMetadata, Array.isArray(fallbackParams) ? fallbackParams : params);
    }
  }
}

async function listProducts(): Promise<Product[]> {
  const result = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    WHERE active = true
    ORDER BY created_at DESC
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    WHERE active = true
    ORDER BY created_at DESC
    `
  );
  return result.rows.map(mapProduct);
}

async function listAdminProducts({ limit = 200, offset = 0, search = "", includeInactive = true }: ListAdminProductsOptions = {}): Promise<Product[]> {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const values: unknown[] = [safeLimit, safeOffset];
  const conditions: string[] = [];

  if (!includeInactive) {
    conditions.push("active = true");
  }

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    conditions.push("(lower(name) LIKE $" + values.length + " OR lower(sku) LIKE $" + values.length + ")");
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    values
  );

  return result.rows.map(mapProduct);
}

async function searchAdminProducts({
  query: q = "",
  status = "",
  stock = "",
  page = 1,
  pageSize = 50
}: SearchAdminProductsOptions = {}): Promise<{ rows: Product[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const normalizedQuery = String(q || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedStock = String(stock || "").trim().toLowerCase();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (normalizedStatus === "active") conditions.push("active = true");
  if (normalizedStatus === "inactive") conditions.push("active = false");

  if (normalizedStock === "out") conditions.push("stock_qty <= 0");
  if (normalizedStock === "in") conditions.push("stock_qty > 0");

  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    conditions.push("(lower(name) LIKE $" + values.length + " OR lower(sku) LIKE $" + values.length + ")");
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(safePageSize, offset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await query<{ total?: number } & JsonRecord>(
    `
    SELECT COUNT(*)::int AS total
    FROM products
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapProduct),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

async function getProductByIdentifier(identifier: string): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  const result = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    WHERE lower(sku) = lower($1)
       OR id::text = $1
    LIMIT 1
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    WHERE lower(sku) = lower($1)
       OR id::text = $1
    LIMIT 1
    `,
    [normalized]
  );

  if (result.rowCount === 0) return null;
  return mapProduct(result.rows[0]);
}

function normalizeSku(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function buildPersistedMetadata(sku: string, input: unknown = {}): ProductMetadata {
  const base = PRODUCT_METADATA[String(sku || "").trim()] || {};
  const normalized = normalizeProductMetadata(input, base);
  return {
    sizes: normalized.sizes,
    colors: normalized.colors,
    variantStock: normalized.variantStock
  };
}

function sumVariantStock(metadata: ProductMetadata): number {
  const map =
    metadata?.variantStock && typeof metadata.variantStock === "object" && !Array.isArray(metadata.variantStock)
      ? metadata.variantStock
      : {};
  return Object.values(map).reduce((sum, qty) => sum + Math.max(0, Math.floor(Number(qty || 0))), 0);
}

async function createProduct(payload: ProductWritePayload = {}): Promise<Product | { error: string }> {
  const sku = normalizeSku(payload.sku);
  if (!sku) return { error: "INVALID_SKU" };
  const metadata = buildPersistedMetadata(sku, {
    sizes: payload.sizes,
    colors: payload.colors,
    variantStock: payload.variantStock
  });
  const variantStockTotal = sumVariantStock(metadata);
  const resolvedStockQty =
    Object.prototype.hasOwnProperty.call(payload, "stockQty") && payload.stockQty != null
      ? Math.max(0, Math.floor(Number(payload.stockQty || 0)))
      : variantStockTotal;

  const paramsWithMetadata: unknown[] = [
    sku,
    String(payload.name || sku).trim(),
    Math.max(0, Math.round(Number(payload.priceCents || 0))),
    resolvedStockQty,
    String(payload.currency || "brl").trim().toLowerCase() || "brl",
    Boolean(payload.active !== false),
    String(payload.imageUrl || "").trim() || null,
    JSON.stringify(metadata)
  ];
  const paramsWithoutMetadata = paramsWithMetadata.slice(0, 7);

  try {
    const result = await queryWithOptionalMetadata(
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb
      )
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      paramsWithMetadata,
      paramsWithoutMetadata
    );

    return mapProduct(result.rows[0] || null);
  } catch (error: unknown) {
    if (getErrorCode(error) === "23505") {
      return { error: "SKU_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function updateProductByIdentifier(identifier: string, patch: ProductWritePayload = {}): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  const current = await getProductByIdentifier(normalized);
  if (!current) return null;
  const metadata = buildPersistedMetadata(current.sku, {
    sizes: patch.sizes ?? current.sizes,
    colors: patch.colors ?? current.colors,
    variantStock: patch.variantStock ?? current.variantStock
  });
  const variantStockTotal = sumVariantStock(metadata);
  const resolvedStockQty =
    Object.prototype.hasOwnProperty.call(patch, "stockQty") && patch.stockQty != null
      ? Math.max(0, Math.floor(Number(patch.stockQty || 0)))
      : variantStockTotal > 0
        ? variantStockTotal
        : Math.max(0, Math.floor(Number(current.stock ?? 0)));

  const paramsWithMetadata: unknown[] = [
    normalized,
    String(patch.name ?? current.name ?? current.sku).trim(),
    Math.max(0, Math.round(Number(patch.priceCents ?? current.unitAmount ?? 0))),
    resolvedStockQty,
    String(patch.currency ?? current.currency ?? "brl").trim().toLowerCase() || "brl",
    Boolean(patch.active ?? current.active),
    String(patch.imageUrl ?? current.image ?? "").trim() || null,
    JSON.stringify(metadata)
  ];
  const paramsWithoutMetadata = paramsWithMetadata.slice(0, 7);

  const result = await queryWithOptionalMetadata(
    `
    UPDATE products
    SET
      name = $2,
      price_cents = $3,
      stock_qty = $4,
      currency = $5,
      active = $6,
      image_url = $7,
      metadata = $8::jsonb,
      updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    `,
    `
    UPDATE products
    SET
      name = $2,
      price_cents = $3,
      stock_qty = $4,
      currency = $5,
      active = $6,
      image_url = $7,
      updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    `,
    paramsWithMetadata,
    paramsWithoutMetadata
  );

  return mapProduct(result.rows[0] || null);
}

async function archiveProductByIdentifier(identifier: string): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;
  const result = await queryWithOptionalMetadata(
    `
    UPDATE products
    SET active = false,
        updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    `,
    `
    UPDATE products
    SET active = false,
        updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    `,
    [normalized]
  );
  return mapProduct(result.rows[0] || null);
}

async function deleteProductByIdentifier(identifier: string): Promise<Product | { error: string } | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  try {
    const result = await queryWithOptionalMetadata(
      `
      DELETE FROM products
      WHERE id::text = $1
         OR lower(sku) = lower($1)
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      DELETE FROM products
      WHERE id::text = $1
         OR lower(sku) = lower($1)
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      [normalized]
    );
    return mapProduct(result.rows[0] || null);
  } catch (error: unknown) {
    if (getErrorCode(error) === "23503") {
      return { error: "PRODUCT_IN_USE" };
    }
    throw error;
  }
}

function getSnapshotString(snapshot: JsonRecord, key: string): string {
  return String(snapshot[key] || "");
}

async function restoreProductFromSnapshot(snapshotInput: JsonRecord = {}): Promise<{ ok: true; product: Product | null } | { error: string }> {
  const snapshot = asRecord(snapshotInput);
  const sku = normalizeSku(snapshot.sku || snapshot.id || "");
  if (!sku) return { error: "INVALID_SNAPSHOT" };
  const metadata = buildPersistedMetadata(sku, {
    sizes: snapshot.sizes,
    colors: snapshot.colors,
    variantStock: snapshot.variantStock
  });

  try {
    const result = await queryWithOptionalMetadata(
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
      )
      ON CONFLICT (sku) DO UPDATE
      SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        stock_qty = EXCLUDED.stock_qty,
        currency = EXCLUDED.currency,
        active = EXCLUDED.active,
        image_url = EXCLUDED.image_url,
        metadata = EXCLUDED.metadata,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
      )
      ON CONFLICT (sku) DO UPDATE
      SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        stock_qty = EXCLUDED.stock_qty,
        currency = EXCLUDED.currency,
        active = EXCLUDED.active,
        image_url = EXCLUDED.image_url,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      [
        sku,
        String(snapshot.name || sku).trim(),
        Math.max(0, Math.round(Number(snapshot.unitAmount || snapshot.priceCents || 0))),
        Math.max(0, Math.floor(Number(snapshot.stock || snapshot.stockQty || 0))),
        String(snapshot.currency || "brl").trim().toLowerCase() || "brl",
        Boolean(snapshot.active !== false),
        getSnapshotString(snapshot, "image") || getSnapshotString(snapshot, "imageUrl") || null,
        JSON.stringify(metadata),
        snapshot.createdAt || null,
        snapshot.updatedAt || null
      ]
    );
    return { ok: true, product: mapProduct(result.rows[0] || null) };
  } catch (error: unknown) {
    if (getErrorCode(error) === "23505") {
      return { error: "SKU_ALREADY_EXISTS" };
    }
    throw error;
  }
}

module.exports = {
  listProducts,
  listAdminProducts,
  searchAdminProducts,
  getProductByIdentifier,
  createProduct,
  updateProductByIdentifier,
  archiveProductByIdentifier,
  deleteProductByIdentifier,
  restoreProductFromSnapshot
};


