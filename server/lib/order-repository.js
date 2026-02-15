const path = require("node:path");
const crypto = require("node:crypto");
const { readJson, writeJson } = require("./json-store");

const ordersPath = path.resolve(__dirname, "..", "..", "data", "orders.json");

async function readOrders() {
  const orders = await readJson(ordersPath, []);
  return Array.isArray(orders) ? orders : [];
}

async function writeOrders(orders) {
  await writeJson(ordersPath, orders);
}

function nowIso() {
  return new Date().toISOString();
}

async function createOrder(payload) {
  const orders = await readOrders();
  const order = {
    id: crypto.randomUUID(),
    status: "pending_payment",
    stockCommitted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...payload
  };
  orders.push(order);
  await writeOrders(orders);
  return order;
}

async function updateOrder(orderId, patch) {
  const orders = await readOrders();
  const index = orders.findIndex((order) => order.id === orderId);
  if (index < 0) return null;
  const next = {
    ...orders[index],
    ...patch,
    updatedAt: nowIso()
  };
  orders[index] = next;
  await writeOrders(orders);
  return next;
}

async function findOrderById(orderId) {
  const orders = await readOrders();
  return orders.find((order) => order.id === orderId) || null;
}

async function findOrderByPaymentIntentId(paymentIntentId) {
  if (!paymentIntentId) return null;
  const orders = await readOrders();
  return orders.find((order) => order.stripePaymentIntentId === paymentIntentId) || null;
}

module.exports = {
  createOrder,
  updateOrder,
  findOrderById,
  findOrderByPaymentIntentId
};
