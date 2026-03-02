import dotenv from "dotenv";

dotenv.config();

const { listProducts } = require("../server/lib/product-repository");
const { resolveTypesenseConfig, upsertProductsIndex } = require("../server/lib/typesense-search");

async function run() {
  const config = resolveTypesenseConfig();
  if (!config) {
    console.error("Typesense nao configurado. Defina TYPESENSE_URL (ou HOST/PORT/PROTOCOL) e TYPESENSE_API_KEY.");
    process.exitCode = 1;
    return;
  }

  const products = await listProducts();
  const result = await upsertProductsIndex(products);

  // eslint-disable-next-line no-console
  console.log(
    `Typesense sincronizado: ${result.total} produtos -> ${config.baseUrl} / collection=${config.collection}`
  );
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Falha ao sincronizar Typesense:", error?.message || error);
  process.exitCode = 1;
});
