const { query, withTransaction } = require("./db");

function normalizeOrderItems(orderItems) {
  if (!Array.isArray(orderItems)) return [];
  const bySku = new Map();

  orderItems.forEach((item) => {
    const sku = String(item?.id || item?.sku || "").trim();
    const qty = Math.max(0, Number(item?.qty || 0));
    if (!sku || qty <= 0) return;
    bySku.set(sku, (bySku.get(sku) || 0) + qty);
  });

  return Array.from(bySku.entries()).map(([sku, qty]) => ({ sku, qty }));
}

async function fetchProductsBySku(client, skus) {
  if (skus.length === 0) return [];
  const result = await client.query(
    `
    SELECT id, sku, name, price_cents, currency, stock_qty, active
    FROM products
    WHERE sku = ANY($1::text[])
    `,
    [skus]
  );
  return result.rows;
}

async function checkAvailability(orderItems) {
  const normalized = normalizeOrderItems(orderItems);
  const skus = normalized.map((item) => item.sku);
  const result = await query(
    `
    SELECT id, sku, name, price_cents, currency, stock_qty, active
    FROM products
    WHERE sku = ANY($1::text[])
    `,
    [skus]
  );
  const products = result.rows;
  const bySku = new Map(products.map((product) => [product.sku, product]));

  const issues = [];
  const resolvedItems = [];

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

async function commitStock(orderItems, options = {}) {
  const normalized = normalizeOrderItems(orderItems);
  if (normalized.length === 0) return { ok: true };

  const execute = async (client) => {
    const products = await fetchProductsBySku(client, normalized.map((item) => item.sku));
    const bySku = new Map(products.map((product) => [product.sku, product]));

    const issues = [];
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
