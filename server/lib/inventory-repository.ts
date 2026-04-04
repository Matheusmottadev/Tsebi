export {};
const STOREFRONT_DEFAULT_PRICE_CENTS = 500;
type JsonRecord = Record<string, unknown>;
type ProductRow = JsonRecord & {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
  currency: string;
  stock_qty: number;
  active: boolean;
  metadata?: unknown;
};
type DbResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<DbResult<TRow>>;
};
type InventoryItem = {
  sku: string;
  qty: number;
  variantColor?: string | null;
  variantSize?: string | null;
  variantKey?: string | null;
};
type OrderItemInput = {
  id?: string;
  sku?: string;
  qty?: number;
  color?: string | null;
  size?: string | null;
  variantColor?: string | null;
  variantSize?: string | null;
  variantKey?: string | null;
};
type AvailabilityIssue = {
  id: string;
  reason: "unknown_product" | "insufficient_stock";
  requestedQty?: number;
  availableStock?: number;
  variantKey?: string | null;
};
type ResolvedItem = {
  id: string;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
  variantColor: string | null;
  variantSize: string | null;
  variantKey: string | null;
};

const CHECKOUT_DEFAULT_ITEM_PRICE_CENTS = 500;

const { query, withTransaction } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<DbResult<TRow>>;
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};

function normalizeOption(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeVariantParts(input: OrderItemInput): {
  variantColor: string | null;
  variantSize: string | null;
  variantKey: string | null;
} {
  const color = normalizeOption(input.variantColor ?? input.color);
  const size = normalizeOption(input.variantSize ?? input.size);
  const rawKey = normalizeOption(input.variantKey);

  if (rawKey) {
    const segments = rawKey.includes("__")
      ? rawKey.split("__")
      : rawKey.includes("|")
        ? rawKey.split("|")
        : [];
    if (segments.length === 2) {
      const parsedColor = normalizeOption(segments[0]);
      const parsedSize = normalizeOption(segments[1]);
      const variantColor = color || parsedColor;
      const variantSize = size || parsedSize;
      const variantKey = variantColor && variantSize ? `${variantColor}__${variantSize}` : null;
      return { variantColor, variantSize, variantKey };
    }
  }

  return {
    variantColor: color,
    variantSize: size,
    variantKey: color && size ? `${color}__${size}` : null
  };
}

function normalizeVariantStockMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const map: Record<string, number> = {};

  Object.entries(value as Record<string, unknown>).forEach(([rawKey, rawQty]) => {
    const key = String(rawKey || "").trim();
    if (!key) return;
    const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
    const canonicalKey =
      parts.length === 2 ? `${normalizeOption(parts[0]) || ""}__${normalizeOption(parts[1]) || ""}` : key;
    if (!canonicalKey || !canonicalKey.includes("__")) return;
    map[canonicalKey] = Math.max(0, Math.floor(Number(rawQty || 0)));
  });

  return map;
}

function extractVariantStock(product: ProductRow): Record<string, number> {
  const metadata =
    product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
      ? (product.metadata as Record<string, unknown>)
      : {};
  return normalizeVariantStockMap(metadata.variantStock);
}

function normalizeOrderItems(orderItems: unknown): InventoryItem[] {
  if (!Array.isArray(orderItems)) return [];
  const bySkuAndVariant = new Map<string, InventoryItem>();

  orderItems.forEach((item) => {
    const parsed = (item || {}) as OrderItemInput;
    const sku = String(parsed.id || parsed.sku || "").trim();
    const qty = Math.max(0, Number(parsed.qty || 0));
    const variant = normalizeVariantParts(parsed);
    if (!sku || qty <= 0) return;

    const aggregateKey = `${sku}::${variant.variantKey || "base"}`;
    const existing = bySkuAndVariant.get(aggregateKey);
    if (existing) {
      existing.qty += qty;
      return;
    }

    bySkuAndVariant.set(aggregateKey, {
      sku,
      qty,
      variantColor: variant.variantColor,
      variantSize: variant.variantSize,
      variantKey: variant.variantKey
    });
  });

  return Array.from(bySkuAndVariant.values());
}

async function fetchProductsBySku(client: DbClient, skus: string[], lockRows: boolean = false): Promise<ProductRow[]> {
  if (skus.length === 0) return [];
  const result = await client.query<ProductRow>(
    `
    SELECT id, sku, name, price_cents, currency, stock_qty, active, metadata
    FROM products
    WHERE sku = ANY($1::text[])
    ${lockRows ? "FOR UPDATE" : ""}
    `,
    [skus]
  );
  return result.rows;
}

async function checkAvailability(orderItems: unknown): Promise<{ ok: boolean; issues: AvailabilityIssue[]; resolvedItems: ResolvedItem[] }> {
  const normalized = normalizeOrderItems(orderItems);
  const skus = normalized.map((item) => item.sku);
  const result = await query<ProductRow>(
    `
    SELECT id, sku, name, price_cents, currency, stock_qty, active, metadata
    FROM products
    WHERE sku = ANY($1::text[])
    `,
    [skus]
  );
  const products = result.rows;
  const bySku = new Map(products.map((product) => [product.sku, product]));

  const issues: AvailabilityIssue[] = [];
  const resolvedItems: ResolvedItem[] = [];

  normalized.forEach((item) => {
    const product = bySku.get(item.sku);
    const variantStock = product ? extractVariantStock(product) : {};
    const hasVariantStock = Object.keys(variantStock).length > 0;
    if (!product || !product.active) {
      issues.push({ id: item.sku, reason: "unknown_product", variantKey: item.variantKey || null });
      return;
    }

    const availableStock = hasVariantStock && item.variantKey ? Number(variantStock[item.variantKey] || 0) : Number(product.stock_qty || 0);
    if (item.qty > availableStock) {
      issues.push({
        id: item.sku,
        reason: "insufficient_stock",
        requestedQty: item.qty,
        availableStock,
        variantKey: item.variantKey || null
      });
      return;
    }

    resolvedItems.push({
      id: product.sku,
      name: product.name,
      qty: item.qty,
      unitAmount: STOREFRONT_DEFAULT_PRICE_CENTS,
      currency: String(product.currency || "brl").toLowerCase(),
      variantColor: item.variantColor || null,
      variantSize: item.variantSize || null,
      variantKey: item.variantKey || null
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    resolvedItems
  };
}

async function commitStock(orderItems: unknown, options: { client?: DbClient; orderId?: string; reason?: string } = {}): Promise<{ ok: true } | { ok: false; issues: AvailabilityIssue[] }> {
  const normalized = normalizeOrderItems(orderItems);
  if (normalized.length === 0) return { ok: true };

  const execute = async (client: DbClient): Promise<{ ok: true } | { ok: false; issues: AvailabilityIssue[] }> => {
    const products = await fetchProductsBySku(client, normalized.map((item) => item.sku), true);
    const bySku = new Map(products.map((product) => [product.sku, product]));

    const issues: AvailabilityIssue[] = [];
    for (const item of normalized) {
      const product = bySku.get(item.sku);
      const variantStock = product ? extractVariantStock(product) : {};
      const hasVariantStock = Object.keys(variantStock).length > 0;
      if (!product || !product.active) {
        issues.push({ id: item.sku, reason: "unknown_product", variantKey: item.variantKey || null });
        continue;
      }
      const availableStock = hasVariantStock && item.variantKey ? Number(variantStock[item.variantKey] || 0) : Number(product.stock_qty || 0);
      if (item.qty > availableStock) {
        issues.push({
          id: item.sku,
          reason: "insufficient_stock",
          requestedQty: item.qty,
          availableStock,
          variantKey: item.variantKey || null
        });
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    for (const item of normalized) {
      const product = bySku.get(item.sku);
      if (!product) continue;
      const variantStock = extractVariantStock(product);
      const hasVariantStock = Object.keys(variantStock).length > 0;
      const shouldApplyVariant = Boolean(hasVariantStock && item.variantKey);
      let updatedProductId = product.id;

      if (shouldApplyVariant) {
        const nextVariantQty = Math.max(0, Number(variantStock[item.variantKey as string] || 0) - item.qty);
        variantStock[item.variantKey as string] = nextVariantQty;

        const updateResult = await client.query(
          `
          UPDATE products
          SET stock_qty = stock_qty - $1,
              metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                ARRAY['variantStock', $2]::text[],
                to_jsonb($3::int),
                true
              ),
              updated_at = NOW()
          WHERE sku = $4
            AND stock_qty >= $1
            AND COALESCE((metadata->'variantStock'->>$2)::int, 0) >= $1
          RETURNING id, metadata
          `,
          [item.qty, item.variantKey, nextVariantQty, item.sku]
        );

        if (updateResult.rowCount === 0) {
          return {
            ok: false,
            issues: [
              {
                id: item.sku,
                reason: "insufficient_stock",
                variantKey: item.variantKey || null
              }
            ]
          };
        }

        updatedProductId = String(updateResult.rows[0]?.id || product.id);
        bySku.set(item.sku, {
          ...product,
          stock_qty: Number(product.stock_qty || 0) - item.qty,
          metadata: updateResult.rows[0]?.metadata || product.metadata
        });
      } else {
        const updateResult = await client.query(
          `
          UPDATE products
          SET stock_qty = stock_qty - $1,
              updated_at = NOW()
          WHERE sku = $2
            AND stock_qty >= $1
          RETURNING id
          `,
          [item.qty, item.sku]
        );

        if (updateResult.rowCount === 0) {
          return {
            ok: false,
            issues: [
              {
                id: item.sku,
                reason: "insufficient_stock",
                variantKey: item.variantKey || null
              }
            ]
          };
        }
        updatedProductId = String(updateResult.rows[0]?.id || product.id);
      }

      if (options.orderId) {
        await client.query(
          `
          INSERT INTO inventory_movements (product_id, order_id, delta, reason)
          VALUES ($1, $2::uuid, $3, $4)
          `,
          [updatedProductId, options.orderId, -item.qty, options.reason || "order_paid"]
        );
      }
    }

    return { ok: true };
  };

  if (options.client) {
    return execute(options.client);
  }

  return withTransaction(execute);
}

module.exports = {
  checkAvailability,
  commitStock
};

