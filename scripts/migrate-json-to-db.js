const fs = require("node:fs/promises");
const path = require("node:path");
const dotenv = require("dotenv");
let dbModule = null;
try {
  dbModule = require("../server/lib/db");
} catch {
  dbModule = require("../dist/server/lib/db");
}
const { getPool, withTransaction } = dbModule;

dotenv.config();

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(parsed);
}

function isoOrNow(value) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function normalizeOrderNumberValue(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  const compact = raw.replace(/[^A-Z0-9-]/g, "");
  const noPrefix = compact.replace(/^PED-?/, "").replace(/[^A-Z0-9]/g, "");
  if (!noPrefix) return "";

  return `PED-${noPrefix.slice(0, 10)}`;
}

function buildOrderNumber(order) {
  const providedNormalized = normalizeOrderNumberValue(order?.orderNumber || order?.order_number);
  if (providedNormalized) return providedNormalized;

  const seed = String(order?.id || "")
    .replace(/-/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 10);
  if (seed) return `PED-${seed}`;

  const createdSeed = String(order?.createdAt || "")
    .replace(/[^0-9]/g, "")
    .slice(-10);
  if (createdSeed) return `PED-${createdSeed}`;

  const randomSeed = Math.random().toString(36).replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
  return `PED-${randomSeed}`;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function migrateUsers(client, users) {
  for (const user of toArray(users)) {
    if (!user?.id || !user?.email || !user?.passwordHash) continue;
    await client.query(
      `
      INSERT INTO users (
        id, name, email, password_hash, birth_date, cpf, cep, addresses, default_address_id, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, NULLIF($5, '')::date, $6, $7, $8::jsonb, $9, $10, $11
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        birth_date = EXCLUDED.birth_date,
        cpf = EXCLUDED.cpf,
        cep = EXCLUDED.cep,
        addresses = EXCLUDED.addresses,
        default_address_id = EXCLUDED.default_address_id,
        updated_at = EXCLUDED.updated_at
      `,
      [
        user.id,
        String(user.name || "Cliente"),
        String(user.email || "").toLowerCase(),
        user.passwordHash,
        String(user.birthDate || ""),
        String(user.cpf || "").replace(/\D/g, "").slice(0, 11) || null,
        String(user.cep || "").replace(/\D/g, "").slice(0, 8) || null,
        JSON.stringify(toArray(user.addresses)),
        String(user.defaultAddressId || "") || null,
        isoOrNow(user.createdAt),
        isoOrNow(user.updatedAt || user.createdAt)
      ]
    );
  }
}

async function migrateProducts(client, inventory) {
  for (const item of toArray(inventory)) {
    if (!item?.id) continue;
    await client.query(
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active
      ) VALUES (
        $1, $2, $3, $4, $5, true
      )
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        stock_qty = EXCLUDED.stock_qty,
        currency = EXCLUDED.currency,
        updated_at = NOW()
      `,
      [
        item.id,
        String(item.name || item.id),
        toInt(item.unitAmount, 0),
        toInt(item.stock, 0),
        String(item.currency || "brl").toLowerCase()
      ]
    );
  }
}

async function getProductIdsBySku(client) {
  const result = await client.query("SELECT id, sku FROM products");
  const bySku = new Map();
  result.rows.forEach((row) => {
    bySku.set(row.sku, row.id);
  });
  return bySku;
}

async function migrateOrders(client, orders) {
  const productIdsBySku = await getProductIdsBySku(client);

  for (const order of toArray(orders)) {
    if (!order?.id) continue;

    const totalCents = toInt(order.amount, 0);
    const itemsCents = toInt(order.itemsAmount, 0);
    const shippingCents = toInt(order.shippingAmount, 0);

    await client.query(
      `
      INSERT INTO orders (
        id, order_number, user_id, status, total_cents, items_cents, shipping_cents, currency,
        payment_method, installments, shipping_json, stock_committed, stock_issues,
        failure_reason, cancellation_reason, stripe_payment_intent_id, stripe_refund_id,
        paid_at, canceled_at, refunded_at, user_email, user_name, created_at, updated_at
      ) VALUES (
        $1, $2, NULLIF($3, '')::uuid, $4, $5, $6, $7, $8,
        $9, $10, $11::jsonb, $12, $13::jsonb,
        $14, $15, $16, $17,
        NULLIF($18, '')::timestamptz, NULLIF($19, '')::timestamptz, NULLIF($20, '')::timestamptz,
        $21, $22, $23, $24
      )
      ON CONFLICT (id) DO UPDATE SET
        order_number = EXCLUDED.order_number,
        user_id = EXCLUDED.user_id,
        status = EXCLUDED.status,
        total_cents = EXCLUDED.total_cents,
        items_cents = EXCLUDED.items_cents,
        shipping_cents = EXCLUDED.shipping_cents,
        currency = EXCLUDED.currency,
        payment_method = EXCLUDED.payment_method,
        installments = EXCLUDED.installments,
        shipping_json = EXCLUDED.shipping_json,
        stock_committed = EXCLUDED.stock_committed,
        stock_issues = EXCLUDED.stock_issues,
        failure_reason = EXCLUDED.failure_reason,
        cancellation_reason = EXCLUDED.cancellation_reason,
        stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
        stripe_refund_id = EXCLUDED.stripe_refund_id,
        paid_at = EXCLUDED.paid_at,
        canceled_at = EXCLUDED.canceled_at,
        refunded_at = EXCLUDED.refunded_at,
        user_email = EXCLUDED.user_email,
        user_name = EXCLUDED.user_name,
        updated_at = EXCLUDED.updated_at
      `,
      [
        order.id,
        buildOrderNumber(order),
        String(order.userId || ""),
        String(order.status || "pending_payment"),
        totalCents,
        itemsCents,
        shippingCents,
        String(order.currency || "brl").toLowerCase(),
        String(order.paymentMethod || "automatic"),
        toInt(order.installments, 1),
        JSON.stringify(order.shipping || null),
        Boolean(order.stockCommitted),
        JSON.stringify(order.stockIssues || null),
        order.failureReason || null,
        order.cancellationReason || null,
        order.stripePaymentIntentId || null,
        order.stripeRefundId || null,
        order.paidAt || "",
        order.canceledAt || "",
        order.refundedAt || "",
        order.userEmail || null,
        order.userName || null,
        isoOrNow(order.createdAt),
        isoOrNow(order.updatedAt || order.createdAt)
      ]
    );

    await client.query("DELETE FROM order_items WHERE order_id = $1", [order.id]);

    for (const item of toArray(order.items)) {
      const sku = String(item?.id || "").trim();
      if (!sku) continue;
      const productId = productIdsBySku.get(sku) || null;
      await client.query(
        `
        INSERT INTO order_items (order_id, product_id, product_sku, name, qty, price_cents, currency)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          order.id,
          productId,
          sku,
          String(item.name || sku),
          toInt(item.qty, 1),
          toInt(item.unitAmount, 0),
          String(item.currency || order.currency || "brl").toLowerCase()
        ]
      );
    }
  }
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const dataDir = path.join(root, "data");

  const users = await readJson(path.join(dataDir, "users.json"), []);
  const inventory = await readJson(path.join(dataDir, "inventory.json"), []);
  const orders = await readJson(path.join(dataDir, "orders.json"), []);

  await withTransaction(async (client) => {
    await migrateUsers(client, users);
    await migrateProducts(client, inventory);
    await migrateOrders(client, orders);
  });

  // eslint-disable-next-line no-console
  console.log("JSON data migrated to PostgreSQL.");

  await getPool().end();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Migration from JSON failed:", error.message);
  process.exitCode = 1;
});
