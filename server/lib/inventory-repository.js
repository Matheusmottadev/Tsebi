const path = require("node:path");
const { readJson, writeJson } = require("./json-store");

const inventoryPath = path.resolve(__dirname, "..", "..", "data", "inventory.json");

async function readInventory() {
  const inventory = await readJson(inventoryPath, []);
  return Array.isArray(inventory) ? inventory : [];
}

async function writeInventory(inventory) {
  await writeJson(inventoryPath, inventory);
}

async function checkAvailability(orderItems) {
  const inventory = await readInventory();
  const byId = new Map(inventory.map((item) => [item.id, item]));

  const issues = [];
  const resolvedItems = [];

  orderItems.forEach((orderItem) => {
    const product = byId.get(orderItem.id);
    if (!product) {
      issues.push({ id: orderItem.id, reason: "unknown_product" });
      return;
    }

    if (orderItem.qty > product.stock) {
      issues.push({
        id: orderItem.id,
        reason: "insufficient_stock",
        requestedQty: orderItem.qty,
        availableStock: product.stock
      });
      return;
    }

    resolvedItems.push({
      id: product.id,
      name: product.name,
      qty: orderItem.qty,
      unitAmount: product.unitAmount,
      currency: product.currency
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    resolvedItems
  };
}

async function commitStock(orderItems) {
  const inventory = await readInventory();
  const byId = new Map(inventory.map((item) => [item.id, item]));

  const issues = [];
  orderItems.forEach((orderItem) => {
    const product = byId.get(orderItem.id);
    if (!product) {
      issues.push({ id: orderItem.id, reason: "unknown_product" });
      return;
    }
    if (orderItem.qty > product.stock) {
      issues.push({
        id: orderItem.id,
        reason: "insufficient_stock",
        requestedQty: orderItem.qty,
        availableStock: product.stock
      });
    }
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  orderItems.forEach((orderItem) => {
    const product = byId.get(orderItem.id);
    product.stock -= orderItem.qty;
  });

  await writeInventory(inventory);
  return { ok: true };
}

module.exports = {
  checkAvailability,
  commitStock
};
