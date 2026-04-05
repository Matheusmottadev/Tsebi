"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const STOREFRONT_DEFAULT_PRICE_CENTS = 500;
const CHECKOUT_DEFAULT_ITEM_PRICE_CENTS = 500;
const { query, withTransaction } = require("./db");
function normalizeOption(value) {
    const normalized = String(value || "").trim();
    return normalized ? normalized : null;
}
function normalizeVariantParts(input) {
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
function normalizeVariantStockMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return {};
    const map = {};
    Object.entries(value).forEach(([rawKey, rawQty]) => {
        const key = String(rawKey || "").trim();
        if (!key)
            return;
        const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
        const canonicalKey = parts.length === 2 ? `${normalizeOption(parts[0]) || ""}__${normalizeOption(parts[1]) || ""}` : key;
        if (!canonicalKey || !canonicalKey.includes("__"))
            return;
        map[canonicalKey] = Math.max(0, Math.floor(Number(rawQty || 0)));
    });
    return map;
}
function extractVariantStock(product) {
    const metadata = product?.metadata && typeof product.metadata === "object" && !Array.isArray(product.metadata)
        ? product.metadata
        : {};
    return normalizeVariantStockMap(metadata.variantStock);
}
function normalizeOrderItems(orderItems) {
    if (!Array.isArray(orderItems))
        return [];
    const bySkuAndVariant = new Map();
    orderItems.forEach((item) => {
        const parsed = (item || {});
        const sku = String(parsed.id || parsed.sku || "").trim();
        const qty = Math.max(0, Number(parsed.qty || 0));
        const variant = normalizeVariantParts(parsed);
        if (!sku || qty <= 0)
            return;
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
async function fetchProductsBySku(client, skus, lockRows = false) {
    if (skus.length === 0)
        return [];
    const result = await client.query(`
    SELECT id, sku, name, price_cents, currency, stock_qty, active, metadata
    FROM products
    WHERE sku = ANY($1::text[])
    ${lockRows ? "FOR UPDATE" : ""}
    `, [skus]);
    return result.rows;
}
async function checkAvailability(orderItems) {
    const normalized = normalizeOrderItems(orderItems);
    const skus = normalized.map((item) => item.sku);
    const result = await query(`
    SELECT id, sku, name, price_cents, currency, stock_qty, active, metadata
    FROM products
    WHERE sku = ANY($1::text[])
    `, [skus]);
    const products = result.rows;
    const bySku = new Map(products.map((product) => [product.sku, product]));
    const issues = [];
    const resolvedItems = [];
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
async function commitStock(orderItems, options = {}) {
    const normalized = normalizeOrderItems(orderItems);
    if (normalized.length === 0)
        return { ok: true };
    const execute = async (client) => {
        const products = await fetchProductsBySku(client, normalized.map((item) => item.sku), true);
        const bySku = new Map(products.map((product) => [product.sku, product]));
        const issues = [];
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
            if (!product)
                continue;
            const variantStock = extractVariantStock(product);
            const hasVariantStock = Object.keys(variantStock).length > 0;
            const shouldApplyVariant = Boolean(hasVariantStock && item.variantKey);
            let updatedProductId = product.id;
            if (shouldApplyVariant) {
                const nextVariantQty = Math.max(0, Number(variantStock[item.variantKey] || 0) - item.qty);
                variantStock[item.variantKey] = nextVariantQty;
                const updateResult = await client.query(`
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
          `, [item.qty, item.variantKey, nextVariantQty, item.sku]);
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
            }
            else {
                const updateResult = await client.query(`
          UPDATE products
          SET stock_qty = stock_qty - $1,
              updated_at = NOW()
          WHERE sku = $2
            AND stock_qty >= $1
          RETURNING id
          `, [item.qty, item.sku]);
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
                await client.query(`
          INSERT INTO inventory_movements (product_id, order_id, delta, reason)
          VALUES ($1, $2::uuid, $3, $4)
          `, [updatedProductId, options.orderId, -item.qty, options.reason || "order_paid"]);
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
//# sourceMappingURL=inventory-repository.js.map