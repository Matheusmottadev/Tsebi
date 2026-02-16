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
  const metadata = PRODUCT_METADATA[sku] || {};
  const priceValue = Math.max(0, Math.round(Number(row?.price_cents || 0) / 100));

  return {
    id: sku,
    sku,
    dbId: row.id,
    name: String(row?.name || sku),
    nameEn: String(metadata.nameEn || row?.name || sku),
    collection: String(metadata.collection || "Alicerce"),
    category: String(metadata.category || "Coleção"),
    material: String(metadata.material || "Material premium"),
    sizes: Array.isArray(metadata.sizes) && metadata.sizes.length > 0 ? metadata.sizes : ["Único"],
    colors: Array.isArray(metadata.colors) && metadata.colors.length > 0 ? metadata.colors : ["Único"],
    gender: String(metadata.gender || "Unissex"),
    priceLabel: formatPriceLabelFromCents(row?.price_cents),
    priceValue,
    unitAmount: Math.max(0, Number(row?.price_cents || 0)),
    currency: String(row?.currency || "brl").toLowerCase(),
    stock: Math.max(0, Number(row?.stock_qty || 0)),
    active: Boolean(row?.active),
    image: String(metadata.image || DEFAULT_IMAGE),
    href: `produto.html?id=${encodeURIComponent(sku)}`
  };
}

async function listProducts() {
  const result = await query(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active
    FROM products
    WHERE active = true
    ORDER BY created_at DESC
    `
  );
  return result.rows.map(mapProduct);
}

async function getProductByIdentifier(identifier) {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  const result = await query(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active
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

module.exports = {
  listProducts,
  getProductByIdentifier
};
