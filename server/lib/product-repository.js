const { query } = require("./db");

const DEFAULT_IMAGE = "images/produtos/sug1.jpeg";

const PRODUCT_METADATA = {
  "genesis-bomber": {
    collection: "Gênesis",
    category: "Jaquetas",
    material: "Couro e lã",
    sizes: ["P", "M", "G"],
    colors: ["Vermelho", "Areia"],
    gender: "Unissex",
    image: "images/produtos/sug1.jpeg",
    nameEn: "Italian leather bomber jacket with silk lining"
  },
  "genesis-tailored": {
    collection: "Gênesis",
    category: "Calças",
    material: "Sarja premium",
    sizes: ["36", "38", "40", "42"],
    colors: ["Grafite", "Preto"],
    gender: "Feminino",
    image: "images/produtos/sug4.jpeg",
    nameEn: "Premium structured tailored twill pants"
  },
  "origem-shirt": {
    collection: "Alicerce",
    category: "Camisas",
    material: "Algodão egípcio",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Branco", "Azul"],
    gender: "Masculino",
    image: "images/produtos/sug3.jpeg",
    nameEn: "Croatian cotton shirt with noble weave"
  },
  "origem-skirt": {
    collection: "Alicerce",
    category: "Saias",
    material: "Lã fria",
    sizes: ["36", "38", "40"],
    colors: ["Preto", "Marfim"],
    gender: "Feminino",
    image: "images/produtos/sug2.jpeg",
    nameEn: "Structured cool wool skirt with impeccable finish"
  },
  "atelier-bag": {
    collection: "Alicerce",
    category: "Bolsas",
    material: "Couro natural",
    sizes: ["Único"],
    colors: ["Caramelo", "Preto"],
    gender: "Unissex",
    image: "images/produtos/sug1.jpeg",
    nameEn: "Natural leather bag with plated hardware"
  },
  "atelier-heels": {
    collection: "Gênesis",
    category: "Calçados",
    material: "Couro envernizado",
    sizes: ["35", "36", "37", "38", "39"],
    colors: ["Preto", "Vinho"],
    gender: "Feminino",
    image: "images/produtos/sug2.jpeg",
    nameEn: "Patent leather pumps with sculpted heel"
  },
  "flux-trench": {
    collection: "Alicerce",
    category: "Casacos",
    material: "Gabardine",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Oliva"],
    gender: "Unissex",
    image: "images/produtos/sug3.jpeg",
    nameEn: "Gabardine trench coat with architectural cut"
  },
  "flux-knit": {
    collection: "Gênesis",
    category: "Malhas",
    material: "Lã merino",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Off white", "Cinza"],
    gender: "Masculino",
    image: "images/produtos/sug4.jpeg",
    nameEn: "Ultrafine merino wool knitwear"
  },
  "noir-dress": {
    collection: "Gênesis",
    category: "Vestidos",
    material: "Crepe de seda",
    sizes: ["36", "38", "40", "42"],
    colors: ["Preto"],
    gender: "Feminino",
    image: "images/produtos/sug2.jpeg",
    nameEn: "Silk crepe column dress with couture drape"
  },
  "noir-sneaker": {
    collection: "Alicerce",
    category: "Calçados",
    material: "Nylon técnico",
    sizes: ["37", "38", "39", "40", "41", "42"],
    colors: ["Preto", "Branco"],
    gender: "Unissex",
    image: "images/produtos/sug1.jpeg",
    nameEn: "Technical nylon and premium-finish leather sneaker"
  },
  "essence-blazer": {
    collection: "Alicerce",
    category: "Blazers",
    material: "Linho premium",
    sizes: ["P", "M", "G"],
    colors: ["Marfim", "Bege"],
    gender: "Feminino",
    image: "images/produtos/sug4.jpeg",
    nameEn: "Premium linen blazer with precision tailoring"
  },
  "essence-trousers": {
    collection: "Gênesis",
    category: "Calças",
    material: "Linho premium",
    sizes: ["36", "38", "40", "42", "44"],
    colors: ["Marfim", "Areia"],
    gender: "Feminino",
    image: "images/produtos/sug3.jpeg",
    nameEn: "Premium linen wide-leg trousers with deep pleat"
  }
};

function normalizeTextList(value, fallback = []) {
  const list = Array.isArray(value) ? value : [];
  const cleaned = [];
  const seen = new Set();

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

function sanitizeVariantStockMap(value, validColors = [], validSizes = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedPairs = new Set();
  validColors.forEach((color) => {
    validSizes.forEach((size) => {
      allowedPairs.add(`${color}__${size}`);
    });
  });

  const normalized = {};
  Object.entries(value).forEach(([rawKey, rawQty]) => {
    const key = String(rawKey || "").trim();
    if (!key || !allowedPairs.has(key)) return;
    const qty = Math.max(0, Math.floor(Number(rawQty || 0)));
    normalized[key] = qty;
  });

  return normalized;
}

function normalizeProductMetadata(value, fallback = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackSizes = normalizeTextList(fallback.sizes, ["Único"]);
  const fallbackColors = normalizeTextList(fallback.colors, ["Único"]);
  let sizes = normalizeTextList(raw.sizes, fallbackSizes.length ? fallbackSizes : ["Único"]);
  let colors = normalizeTextList(raw.colors, fallbackColors.length ? fallbackColors : ["Único"]);
  let variantStock = sanitizeVariantStockMap(raw.variantStock || raw.variant_stock, colors, sizes);

  const looksLikeLegacyBlackOnly =
    colors.length === 1 &&
    String(colors[0] || "").trim().toLowerCase() === "preto" &&
    fallbackColors.length > 1 &&
    Object.keys(variantStock).length === 0;

  if (looksLikeLegacyBlackOnly) {
    colors = fallbackColors;
    sizes = fallbackSizes.length ? fallbackSizes : sizes;
    variantStock = sanitizeVariantStockMap(raw.variantStock || raw.variant_stock, colors, sizes);
  }

  return {
    sizes: sizes.length ? sizes : ["Único"],
    colors: colors.length ? colors : ["Único"],
    variantStock
  };
}

function formatPriceLabelFromCents(priceCents) {
  const value = Math.max(0, Math.round(Number(priceCents || 0) / 100));
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function mapProduct(row) {
  const sku = String(row?.sku || "").trim();
  const staticMetadata = PRODUCT_METADATA[sku] || {};
  const metadata = normalizeProductMetadata(row?.metadata, staticMetadata);
  const priceValue = Math.max(0, Math.round(Number(row?.price_cents || 0) / 100));

  return {
    id: sku,
    sku,
    dbId: row.id,
    name: String(row?.name || sku),
    nameEn: String(staticMetadata.nameEn || row?.name || sku),
    collection: String(staticMetadata.collection || "Alicerce"),
    category: String(staticMetadata.category || "Coleção"),
    material: String(staticMetadata.material || "Material premium"),
    sizes: metadata.sizes,
    colors: metadata.colors,
    variantStock: metadata.variantStock,
    gender: String(staticMetadata.gender || "Unissex"),
    priceLabel: formatPriceLabelFromCents(row?.price_cents),
    priceValue,
    unitAmount: Math.max(0, Number(row?.price_cents || 0)),
    currency: String(row?.currency || "brl").toLowerCase(),
    stock: Math.max(0, Number(row?.stock_qty || 0)),
    active: Boolean(row?.active),
    image: String(row?.image_url || staticMetadata.image || DEFAULT_IMAGE),
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
    href: `produto.html?id=${encodeURIComponent(sku)}`
  };
}

function isMissingMetadataColumnError(error) {
  return String(error?.code || "") === "42703" && /metadata/i.test(String(error?.message || ""));
}

let ensureMetadataColumnPromise = null;

async function ensureProductsMetadataColumn() {
  if (!ensureMetadataColumnPromise) {
    ensureMetadataColumnPromise = query(
      `
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      `
    )
      .catch(() => {})
      .finally(() => {
        ensureMetadataColumnPromise = null;
      });
  }

  return ensureMetadataColumnPromise;
}

async function queryWithOptionalMetadata(sqlWithMetadata, sqlWithoutMetadata, params = [], fallbackParams = null) {
  try {
    return await query(sqlWithMetadata, params);
  } catch (error) {
    if (!isMissingMetadataColumnError(error) || !sqlWithoutMetadata) throw error;

    await ensureProductsMetadataColumn();

    try {
      return await query(sqlWithMetadata, params);
    } catch (retryError) {
      if (!isMissingMetadataColumnError(retryError)) throw retryError;
      return query(sqlWithoutMetadata, Array.isArray(fallbackParams) ? fallbackParams : params);
    }
  }
}

async function listProducts() {
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

async function listAdminProducts({ limit = 200, offset = 0, search = "", includeInactive = true } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const values = [safeLimit, safeOffset];
  const conditions = [];

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
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const normalizedQuery = String(q || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedStock = String(stock || "").trim().toLowerCase();

  const conditions = [];
  const values = [];

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

  const countResult = await query(
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

async function getProductByIdentifier(identifier) {
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

function normalizeSku(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function buildPersistedMetadata(sku, input = {}) {
  const base = PRODUCT_METADATA[String(sku || "").trim()] || {};
  const normalized = normalizeProductMetadata(input, base);
  return {
    sizes: normalized.sizes,
    colors: normalized.colors,
    variantStock: normalized.variantStock
  };
}

async function createProduct(payload = {}) {
  const sku = normalizeSku(payload.sku);
  if (!sku) return { error: "INVALID_SKU" };
  const metadata = buildPersistedMetadata(sku, {
    sizes: payload.sizes,
    colors: payload.colors,
    variantStock: payload.variantStock
  });

  const paramsWithMetadata = [
    sku,
    String(payload.name || sku).trim(),
    Math.max(0, Math.round(Number(payload.priceCents || 0))),
    Math.max(0, Math.floor(Number(payload.stockQty || 0))),
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
  } catch (error) {
    if (String(error.code || "") === "23505") {
      return { error: "SKU_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function updateProductByIdentifier(identifier, patch = {}) {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  const current = await getProductByIdentifier(normalized);
  if (!current) return null;
  const metadata = buildPersistedMetadata(current.sku, {
    sizes: patch.sizes ?? current.sizes,
    colors: patch.colors ?? current.colors,
    variantStock: patch.variantStock ?? current.variantStock
  });

  const paramsWithMetadata = [
    normalized,
    String(patch.name ?? current.name ?? current.sku).trim(),
    Math.max(0, Math.round(Number(patch.priceCents ?? current.unitAmount ?? 0))),
    Math.max(0, Math.floor(Number(patch.stockQty ?? current.stock ?? 0))),
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

async function archiveProductByIdentifier(identifier) {
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

async function deleteProductByIdentifier(identifier) {
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
  } catch (error) {
    if (String(error.code || "") === "23503") {
      return { error: "PRODUCT_IN_USE" };
    }
    throw error;
  }
}

async function restoreProductFromSnapshot(snapshot = {}) {
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
        String(snapshot.image || snapshot.imageUrl || "").trim() || null,
        JSON.stringify(metadata),
        snapshot.createdAt || null,
        snapshot.updatedAt || null
      ]
    );
    return { ok: true, product: mapProduct(result.rows[0] || null) };
  } catch (error) {
    if (String(error.code || "") === "23505") {
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
