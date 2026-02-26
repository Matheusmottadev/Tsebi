export {};
type JsonRecord = Record<string, unknown>;
type ProductRow = JsonRecord & {
  id: string;
  sku: string;
  name: string;
  price_cents: number;
  currency: string;
  stock_qty: number;
  active: boolean;
};
type DbResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<DbResult<TRow>>;
};
type InventoryItem = { sku: string; qty: number };
type OrderItemInput = { id?: string; sku?: string; qty?: number };
type AvailabilityIssue = {
  id: string;
  reason: "unknown_product" | "insufficient_stock";
  requestedQty?: number;
  availableStock?: number;
};
type ResolvedItem = { id: string; name: string; qty: number; unitAmount: number; currency: string };

const { query, withTransaction } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<DbResult<TRow>>;
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};

function normalizeOrderItems(orderItems: unknown): InventoryItem[] {
  if (!Array.isArray(orderItems)) return [];
  const bySku = new Map<string, number>();

  orderItems.forEach((item) => {
    const parsed = (item || {}) as OrderItemInput;
    const sku = String(parsed.id || parsed.sku || "").trim();
    const qty = Math.max(0, Number(parsed.qty || 0));
    if (!sku || qty <= 0) return;
    bySku.set(sku, (bySku.get(sku) || 0) + qty);
  });

  return Array.from(bySku.entries()).map(([sku, qty]) => ({ sku, qty }));
}

async function fetchProductsBySku(client: DbClient, skus: string[]): Promise<ProductRow[]> {
  if (skus.length === 0) return [];
  const result = await client.query<ProductRow>(
    `
    SELECT id, sku, name, price_cents, currency, stock_qty, active
    FROM products
    WHERE sku = ANY($1::text[])
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
    SELECT id, sku, name, price_cents, currency, stock_qty, active
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
    if (!product || !product.active) {
      issues.push({ id: item.sku, reason: "unknown_product" });
      return;
    }

    if (item.qty > Number(product.stock_qty || 0)) {
      issues.push({
        id: item.sku,
        reason: "insufficient_stock",
        requestedQty: item.qty,
        availableStock: Number(product.stock_qty || 0)
      });
      return;
    }

    resolvedItems.push({
      id: product.sku,
      name: product.name,
      qty: item.qty,
      unitAmount: Number(product.price_cents || 0),
      currency: String(product.currency || "brl").toLowerCase()
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
    const products = await fetchProductsBySku(client, normalized.map((item) => item.sku));
    const bySku = new Map(products.map((product) => [product.sku, product]));

    const issues: AvailabilityIssue[] = [];
    for (const item of normalized) {
      const product = bySku.get(item.sku);
      if (!product || !product.active) {
        issues.push({ id: item.sku, reason: "unknown_product" });
        continue;
      }
      if (item.qty > Number(product.stock_qty || 0)) {
        issues.push({
          id: item.sku,
          reason: "insufficient_stock",
          requestedQty: item.qty,
          availableStock: Number(product.stock_qty || 0)
        });
      }
    }

    if (issues.length > 0) {
      return { ok: false, issues };
    }

    for (const item of normalized) {
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
              reason: "insufficient_stock"
            }
          ]
        };
      }

      if (options.orderId) {
        await client.query(
          `
          INSERT INTO inventory_movements (product_id, order_id, delta, reason)
          VALUES ($1, $2::uuid, $3, $4)
          `,
          [updateResult.rows[0].id, options.orderId, -item.qty, options.reason || "order_paid"]
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

