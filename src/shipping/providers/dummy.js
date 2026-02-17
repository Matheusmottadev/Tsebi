const crypto = require("node:crypto");

function normalizeZip(zip) {
  return String(zip || "").replace(/\D/g, "").slice(0, 8);
}

function buildDummyPriceByZip(zip) {
  const firstDigit = Number(String(zip || "")[0] || 0);
  if (firstDigit <= 3) {
    return { standard: 2200, express: 3900 };
  }
  if (firstDigit >= 7) {
    return { standard: 3400, express: 5600 };
  }
  return { standard: 2900, express: 4900 };
}

function packageMultiplier(packages = []) {
  const totalQuantity = Array.isArray(packages)
    ? packages.reduce((sum, item) => sum + Math.max(1, Number(item?.quantity || 1)), 0)
    : 1;
  return Math.max(1, totalQuantity);
}

async function quote({ toZip, packages = [] }) {
  const zip = normalizeZip(toZip);
  if (!/^\d{8}$/.test(zip)) {
    const error = new Error("INVALID_DESTINATION_ZIP");
    error.code = "INVALID_DESTINATION_ZIP";
    throw error;
  }

  const prices = buildDummyPriceByZip(zip);
  const multiplier = packageMultiplier(packages);
  const extraPerPackage = Math.max(0, multiplier - 1) * 350;

  return [
    {
      provider: "dummy",
      serviceCode: "dummy-standard",
      serviceName: "Entrega Padrao",
      priceCents: prices.standard + extraPerPackage,
      deadlineDays: 5,
      carrierName: "Dummy Transportes",
      rawPayload: { provider: "dummy", lane: "standard", toZip: zip, multiplier }
    },
    {
      provider: "dummy",
      serviceCode: "dummy-express",
      serviceName: "Entrega Expressa",
      priceCents: prices.express + extraPerPackage,
      deadlineDays: 2,
      carrierName: "Dummy Transportes",
      rawPayload: { provider: "dummy", lane: "express", toZip: zip, multiplier }
    }
  ];
}

async function buyLabel({ order }) {
  const orderId = String(order?.id || "").trim();
  const trackingCode = `DMY${Date.now().toString().slice(-9)}`;
  return {
    labelExternalId: `dummy-label-${orderId || crypto.randomUUID()}`,
    trackingCode,
    status: "ETIQUETA_COMPRADA",
    rawPayload: {
      provider: "dummy",
      orderId,
      createdAt: new Date().toISOString()
    }
  };
}

async function getLabel({ labelExternalId }) {
  return {
    labelExternalId: String(labelExternalId || "").trim(),
    downloadUrl: "",
    rawPayload: {
      provider: "dummy",
      message: "Etiqueta simulada (dummy)."
    }
  };
}

async function track({ trackingCode }) {
  return {
    trackingCode: String(trackingCode || "").trim(),
    status: "EM_TRANSITO",
    events: [
      {
        status: "ETIQUETA_CRIADA",
        description: "Etiqueta gerada com sucesso.",
        at: new Date().toISOString()
      }
    ],
    rawPayload: {
      provider: "dummy"
    }
  };
}

module.exports = {
  quote,
  buyLabel,
  getLabel,
  track
};
