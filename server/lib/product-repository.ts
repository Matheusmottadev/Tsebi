export {};
type JsonRecord = Record<string, unknown>;

type QueryResult<TRow extends JsonRecord> = {
  rows: TRow[];
  rowCount: number;
};

const fs = require("node:fs/promises") as typeof import("node:fs/promises");
const path = require("node:path") as typeof import("node:path");
const { query } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const DEFAULT_IMAGE = "images/placeholderreal.webp";
const STOREFRONT_DEFAULT_PRICE_CENTS = 500;
const INVENTORY_FILE_CANDIDATES = [
  path.resolve(__dirname, "..", "..", "data", "inventory.json"),
  path.resolve(__dirname, "..", "..", "..", "data", "inventory.json")
];
const AUTO_SYNC_INVENTORY_ON_READ = (() => {
  const normalized = String(process.env.PRODUCTS_AUTO_SYNC_FROM_INVENTORY || "1")
    .trim()
    .toLowerCase();
  if (!normalized) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  return true;
})();

const BROKEN_ENCODING_REPLACEMENTS: Array<[string, string]> = [
  ["Ã¡", "á"],
  ["Ãà", "à"],
  ["Ã¢", "â"],
  ["Ãã", "ã"],
  ["Ãä", "ä"],
  ["Ãé", "é"],
  ["Ãê", "ê"],
  ["Ãí", "í"],
  ["Ãó", "ó"],
  ["Ãô", "ô"],
  ["Ãõ", "õ"],
  ["Ãö", "ö"],
  ["Ãú", "ú"],
  ["Ãü", "ü"],
  ["Ãç", "ç"],
  ["ÃÁ", "Á"],
  ["ÃÀ", "À"],
  ["ÃÂ", "Â"],
  ["ÃÃ", "Ã"],
  ["ÃÉ", "É"],
  ["ÃÊ", "Ê"],
  ["ÃÍ", "Í"],
  ["ÃÓ", "Ó"],
  ["ÃÔ", "Ô"],
  ["ÃÕ", "Õ"],
  ["ÃÚ", "Ú"],
  ["ÃÇ", "Ç"],
  ["â€“", "–"],
  ["â€”", "—"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"]
];

const QUESTION_MARK_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\?nico/gi, "Único"],
  [/Cardig\?/gi, "Cardigã"],
  [/t\?cnico/gi, "técnico"],
  [/met\?lica/gi, "metálica"],
  [/precis\?o/gi, "precisão"],
  [/arquitet\?nico/gi, "arquitetônico"],
  [/G\?nesis/gi, "Gênesis"],
  [/cart\?es/gi, "cartões"],
  [/Len\?o/gi, "Lenço"],
  [/Cal\?a/gi, "Calça"],
  [/\bem l\?\b/gi, "em lã"],
  [/\bl\?(?=\s|$)/gi, "lã"],
  [/\bL\?(?=\s|$)/g, "Lã"],
  [/\bL\?\b/g, "Lã"],
  [/\bl\?\b/g, "lã"]
];

function sanitizeCatalogText(value: unknown): string {
  let text = String(value || "").trim();
  if (!text) return "";

  BROKEN_ENCODING_REPLACEMENTS.forEach(([broken, fixed]) => {
    text = text.split(broken).join(fixed);
  });

  QUESTION_MARK_TEXT_REPLACEMENTS.forEach(([pattern, fixed]) => {
    text = text.replace(pattern, fixed);
  });

  text = text.replace(/\uFFFD/g, "").trim();
  if (/^[\?\uFFFD]nico$/i.test(text)) return "Único";
  return text;
}

export type VariantStockMap = Record<string, number>;
export type ProductAvailabilityStatus = "disponivel" | "esgotando" | "esgotado";

export type ListAdminProductsOptions = {
  limit?: number;
  offset?: number;
  search?: string;
  includeInactive?: boolean;
};

export type SearchAdminProductsOptions = {
  query?: string;
  status?: string;
  stock?: string;
  page?: number;
  pageSize?: number;
};

export type SearchStorefrontProductsOptions = {
  query?: string;
  page?: number;
  limit?: number;
  category?: string;
  collection?: string;
  gender?: string;
  inStock?: boolean;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc";
};

export type SearchSuggestionProduct = Pick<
  Product,
  "id" | "sku" | "name" | "image" | "secondaryImage" | "category" | "collection" | "stock" | "active"
>;

export type SearchStorefrontSuggestionsOptions = {
  query?: string;
  limit?: number;
};

export type ProductWritePayload = {
  sku?: string;
  name?: string;
  priceCents?: number;
  stockQty?: number;
  currency?: string;
  active?: boolean;
  imageUrl?: string | null;
  sizes?: string[];
  colors?: string[];
  variantStock?: VariantStockMap;
  availabilityStatus?: ProductAvailabilityStatus;
  collection?: string;
  category?: string;
  subcategory?: string;
  material?: string;
  gender?: string;
  secondaryImage?: string;
  galleryImages?: string[];
  colorImages?: Record<string, string[]>;
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
};

type ProductStaticMetadata = {
  collection?: string;
  collections?: string[];
  category?: string;
  subcategory?: string;
  material?: string;
  sizes?: string[];
  colors?: string[];
  gender?: string;
  tags?: string[];
  isNew?: boolean;
  isBestSeller?: boolean;
  isFeatured?: boolean;
  image?: string;
  secondaryImage?: string;
  nameEn?: string;
};

type ProductMetadata = {
  sizes: string[];
  colors: string[];
  variantStock: VariantStockMap;
  availabilityStatus?: ProductAvailabilityStatus;
  collection?: string;
  category?: string;
  subcategory?: string;
  material?: string;
  gender?: string;
  secondaryImage?: string;
  galleryImages?: string[];
  colorImages?: Record<string, string[]>;
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
};

type ProductRow = JsonRecord & {
  id?: string;
  sku?: string;
  name?: string;
  price_cents?: number;
  stock_qty?: number;
  currency?: string;
  active?: boolean;
  image_url?: string | null;
  metadata?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type InventorySeedProduct = {
  sku: string;
  name: string;
  unitAmount: number;
  stockQty: number;
  currency: string;
};

export type Product = {
  id: string;
  sku: string;
  slug: string;
  dbId?: string;
  name: string;
  nameEn: string;
  collection: string;
  collections: string[];
  category: string;
  subcategory: string;
  material: string;
  sizes: string[];
  colors: string[];
  variantStock: VariantStockMap;
  availabilityStatus: ProductAvailabilityStatus;
  gender: string;
  price: number;
  priceLabel: string;
  priceValue: number;
  unitAmount: number;
  currency: string;
  stock: number;
  isNew: boolean;
  isBestSeller: boolean;
  isFeatured: boolean;
  tags: string[];
  active: boolean;
  image: string;
  secondaryImage?: string;
  galleryImages?: string[];
  colorImages?: Record<string, string[]>;
  modelInfo?: string;
  fitType?: string;
  sizeRecommendation?: string;
  detailedModeling?: string;
  materialMain?: string;
  cleaningRecommendation?: string;
  careList?: string[];
  createdAt: string | null;
  updatedAt: string | null;
  href: string;
};

const PRODUCT_METADATA: Record<string, ProductStaticMetadata> = {
  "genesis-bomber": {
    collection: "Gênesis",
    category: "Outerwear",
    subcategory: "Jaquetas",
    material: "Couro e lã",
    sizes: ["P", "M", "G"],
    colors: ["Vermelho", "Areia"],
    gender: "Unissex",
    image: "images/product/genesis-bomber-1.jpg",
    secondaryImage: "images/product/genesis-bomber-2.jpg",
    nameEn: "Italian leather bomber jacket with silk lining"
  },
  "genesis-tailored": {
    collection: "Gênesis",
    category: "Ready-to-Wear",
    subcategory: "Calças",
    material: "Sarja premium",
    sizes: ["36", "38", "40", "42"],
    colors: ["Grafite", "Preto"],
    gender: "Feminino",
    image: "images/product/genesis-tailored-1.jpg",
    secondaryImage: "images/product/genesis-tailored-2.jpg",
    nameEn: "Premium structured tailored twill pants"
  },
  "origem-shirt": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisas",
    material: "Algodão egípcio",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Branco", "Azul"],
    gender: "Masculino",
    image: "images/product/origem-shirt-1.jpg",
    secondaryImage: "images/product/origem-shirt-2.jpg",
    nameEn: "Croatian cotton shirt with noble weave"
  },
  "origem-skirt": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Saias",
    material: "Lã fria",
    sizes: ["36", "38", "40"],
    colors: ["Preto", "Marfim"],
    gender: "Feminino",
    image: "images/product/origem-skirt-1.jpg",
    secondaryImage: "images/product/origem-skirt-2.jpg",
    nameEn: "Structured cool wool skirt with impeccable finish"
  },
  "atelier-bag": {
    collection: "Alicerce",
    category: "Leather",
    subcategory: "Jaquetas de couro",
    material: "Couro natural",
    sizes: ["?nico"],
    colors: ["Caramelo", "Preto"],
    gender: "Unissex",
    image: "images/product/atelier-bag-1.jpg",
    secondaryImage: "images/product/atelier-bag-2.jpg",
    nameEn: "Natural leather bag with plated hardware"
  },
  "atelier-heels": {
    collection: "Gênesis",
    category: "Leather",
    subcategory: "Calças de couro",
    material: "Couro envernizado",
    sizes: ["35", "36", "37", "38", "39"],
    colors: ["Preto", "Vinho"],
    gender: "Feminino",
    image: "images/product/atelier-heels-1.jpg",
    secondaryImage: "images/product/atelier-heels-2.jpg",
    nameEn: "Patent leather pumps with sculpted heel"
  },
  "flux-trench": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Casacos",
    material: "Gabardine",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Oliva"],
    gender: "Unissex",
    image: "images/product/flux-trench-1.jpg",
    secondaryImage: "images/product/flux-trench-2.jpg",
    nameEn: "Gabardine trench coat with architectural cut"
  },
  "flux-knit": {
    collection: "Gênesis",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "L? merino",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Off white", "Cinza"],
    gender: "Masculino",
    image: "images/product/flux-knit-1.jpg",
    secondaryImage: "images/product/flux-knit-2.jpg",
    nameEn: "Ultrafine merino wool knitwear"
  },
  "noir-dress": {
    collection: "Gênesis",
    category: "Ready-to-Wear",
    subcategory: "Vestidos",
    material: "Crepe de seda",
    sizes: ["36", "38", "40", "42"],
    colors: ["Preto"],
    gender: "Feminino",
    image: "images/product/noir-dress-1.jpg",
    secondaryImage: "images/product/noir-dress-2.jpg",
    nameEn: "Silk crepe column dress with couture drape"
  },
  "noir-sneaker": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "Nylon técnico",
    sizes: ["37", "38", "39", "40", "41", "42"],
    colors: ["Preto", "Branco"],
    gender: "Unissex",
    image: "images/product/noir-sneaker-1.jpg",
    secondaryImage: "images/product/noir-sneaker-2.jpg",
    nameEn: "Technical nylon and premium-finish leather sneaker"
  },
  "essence-blazer": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Jaquetas",
    material: "Linho premium",
    sizes: ["P", "M", "G"],
    colors: ["Marfim", "Bege"],
    gender: "Feminino",
    image: "images/product/essence-blazer-1.jpg",
    secondaryImage: "images/product/essence-blazer-2.jpg",
    nameEn: "Premium linen blazer with precision tailoring"
  },
  "essence-trousers": {
    collection: "Gênesis",
    category: "Ready-to-Wear",
    subcategory: "Calças",
    material: "Linho premium",
    sizes: ["36", "38", "40", "42", "44"],
    colors: ["Marfim", "Areia"],
    gender: "Feminino",
    image: "images/product/essence-trousers-1.jpg",
    secondaryImage: "images/product/essence-trousers-2.jpg",
    nameEn: "Premium linen wide-leg trousers with deep pleat"
  },
  "aurora-coat": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Casacos",
    material: "La premium",
    sizes: ["P", "M", "G"],
    colors: ["Preto", "Areia"],
    gender: "Unissex",
    image: "images/product/aurora-coat-1.jpg",
    secondaryImage: "images/product/aurora-coat-2.jpg",
    nameEn: "Aurora coat"
  },
  "eclipse-shirt": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisas",
    material: "Algodao premium",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Branco", "Preto"],
    gender: "Unissex",
    image: "images/product/eclipse-shirt-1.jpg",
    secondaryImage: "images/product/eclipse-shirt-2.jpg",
    nameEn: "Eclipse shirt"
  },
  "vento-trousers": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Calças",
    material: "Sarja",
    sizes: ["36", "38", "40", "42"],
    colors: ["Grafite", "Bege"],
    gender: "Unissex",
    image: "images/product/vento-trousers-1.jpg",
    secondaryImage: "images/product/vento-trousers-2.jpg",
    nameEn: "Vento trousers"
  },
  "areia-top": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "Viscose",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Marfim"],
    gender: "Feminino",
    image: "images/product/areia-top-1.jpg",
    secondaryImage: "images/product/areia-top-2.jpg",
    nameEn: "Areia top"
  },
  "lunar-blazer": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Jaquetas",
    material: "Linho",
    sizes: ["P", "M", "G"],
    colors: ["Preto", "Cinza"],
    gender: "Feminino",
    image: "images/product/lunar-blazer-1.jpg",
    secondaryImage: "images/product/lunar-blazer-2.jpg",
    nameEn: "Lunar blazer"
  },
  "prisma-skirt": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Saias",
    material: "Crepe",
    sizes: ["36", "38", "40"],
    colors: ["Preto", "Azul"],
    gender: "Feminino",
    image: "images/product/prisma-skirt-1.jpg",
    secondaryImage: "images/product/prisma-skirt-2.jpg",
    nameEn: "Prisma skirt"
  },
  "delta-jeans": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Calças",
    material: "Denim",
    sizes: ["36", "38", "40", "42", "44"],
    colors: ["Azul", "Preto"],
    gender: "Unissex",
    image: "images/product/delta-jeans-1.jpg",
    secondaryImage: "images/product/delta-jeans-2.jpg",
    nameEn: "Delta jeans"
  },
  "atlas-hoodie": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "Algodao",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preto", "Cinza"],
    gender: "Unissex",
    image: "images/product/atlas-hoodie-1.jpg",
    secondaryImage: "images/product/atlas-hoodie-2.jpg",
    nameEn: "Atlas hoodie"
  },
  "serif-dress": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Vestidos",
    material: "Seda",
    sizes: ["36", "38", "40", "42"],
    colors: ["Preto", "Marfim"],
    gender: "Feminino",
    image: "images/product/serif-dress-1.jpg",
    secondaryImage: "images/product/serif-dress-2.jpg",
    nameEn: "Serif dress"
  },
  "marco-trench": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Casacos",
    material: "Gabardine",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Preto"],
    gender: "Unissex",
    image: "images/product/marco-trench-1.jpg",
    secondaryImage: "images/product/marco-trench-2.jpg",
    nameEn: "Marco trench"
  },
  "vento-knit": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "La merino",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Cinza", "Off white"],
    gender: "Unissex",
    image: "images/product/vento-knit-1.jpg",
    secondaryImage: "images/product/vento-knit-2.jpg",
    nameEn: "Vento knit"
  },
  "cairo-vest": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisas",
    material: "Linho",
    sizes: ["P", "M", "G"],
    colors: ["Areia", "Preto"],
    gender: "Unissex",
    image: "images/product/cairo-vest-1.jpg",
    secondaryImage: "images/product/cairo-vest-2.jpg",
    nameEn: "Cairo vest"
  },
  "oslo-parka": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Jaquetas",
    material: "Nylon",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Oliva", "Preto"],
    gender: "Masculino",
    image: "images/product/oslo-parka-1.jpg",
    secondaryImage: "images/product/oslo-parka-2.jpg",
    nameEn: "Oslo parka"
  },
  "riviera-shorts": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Bermudas",
    material: "Algodao",
    sizes: ["36", "38", "40", "42"],
    colors: ["Areia", "Preto"],
    gender: "Masculino",
    image: "images/product/riviera-shorts-1.jpg",
    secondaryImage: "images/product/riviera-shorts-2.jpg",
    nameEn: "Riviera shorts"
  },
  "nebula-tee": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Camisetas",
    material: "Algodao",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Branco", "Preto"],
    gender: "Unissex",
    image: "images/product/nebula-tee-1.jpg",
    secondaryImage: "images/product/nebula-tee-2.jpg",
    nameEn: "Nebula tee"
  },
  "coral-pants": {
    collection: "Alicerce",
    category: "Ready-to-Wear",
    subcategory: "Calças",
    material: "Linho",
    sizes: ["36", "38", "40", "42"],
    colors: ["Marfim", "Preto"],
    gender: "Feminino",
    image: "images/product/coral-pants-1.jpg",
    secondaryImage: "images/product/coral-pants-2.jpg",
    nameEn: "Coral pants"
  },
  "birch-cardigan": {
    collection: "Alicerce",
    category: "Outerwear",
    subcategory: "Jaquetas",
    material: "La",
    sizes: ["P", "M", "G"],
    colors: ["Bege", "Cinza"],
    gender: "Feminino",
    image: "images/product/birch-cardigan-1.jpg",
    secondaryImage: "images/product/birch-cardigan-2.jpg",
    nameEn: "Birch cardigan"
  },
  "pixel-bag": {
    collection: "Alicerce",
    category: "Leather",
    subcategory: "Jaquetas de couro",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Caramelo"],
    gender: "Feminino",
    image: "images/product/pixel-bag-1.jpg",
    secondaryImage: "images/product/pixel-bag-2.jpg",
    nameEn: "Pixel bag"
  },
  "metro-belt": {
    collection: "Alicerce",
    category: "Leather",
    subcategory: "Calças de couro",
    material: "Couro",
    sizes: ["P", "M", "G"],
    colors: ["Preto", "Marrom"],
    gender: "Unissex",
    image: "images/product/metro-belt-1.jpg",
    secondaryImage: "images/product/metro-belt-2.jpg",
    nameEn: "Metro belt"
  },
  "solstice-jacket": {
    collection: "Alicerce",
    category: "Leather",
    subcategory: "Jaquetas de couro",
    material: "Couro",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preto", "Areia"],
    gender: "Unissex",
    image: "images/product/solstice-jacket-1.jpg",
    secondaryImage: "images/product/solstice-jacket-2.jpg",
    nameEn: "Solstice jacket"
  },
  "genesis-hobo-bag": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Vinho"],
    gender: "Feminino",
    tags: ["acessorios", "bolsas", "signature-pieces"],
    image: "images/product/genesis-hobo-bag-1.jpg",
    secondaryImage: "images/product/genesis-hobo-bag-2.jpg",
    nameEn: "Genesis hobo bag"
  },
  "alicerce-mini-bag": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Areia", "Marrom"],
    gender: "Feminino",
    tags: ["acessorios", "bolsas", "new-arrivals"],
    image: "images/product/alicerce-mini-bag-1.jpg",
    secondaryImage: "images/product/alicerce-mini-bag-2.jpg",
    nameEn: "Alicerce mini bag"
  },
  "fleur-silk-scarf": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Lenços",
    material: "Seda",
    sizes: ["Unico"],
    colors: ["Marfim", "Preto"],
    gender: "Feminino",
    tags: ["acessorios", "lencos", "featured"],
    image: "images/product/fleur-silk-scarf-1.jpg",
    secondaryImage: "images/product/fleur-silk-scarf-2.jpg",
    nameEn: "Fleur silk scarf"
  },
  "nox-card-wallet": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Carteiras",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto"],
    gender: "Feminino",
    tags: ["acessorios", "carteiras"],
    image: "images/product/nox-card-wallet-1.jpg",
    secondaryImage: "images/product/nox-card-wallet-2.jpg",
    nameEn: "Nox card wallet"
  },
  "aura-thin-belt": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Cintos",
    material: "Couro",
    sizes: ["P", "M", "G"],
    colors: ["Caramelo", "Preto"],
    gender: "Feminino",
    tags: ["acessorios", "cintos"],
    image: "images/product/aura-thin-belt-1.jpg",
    secondaryImage: "images/product/aura-thin-belt-2.jpg",
    nameEn: "Aura thin belt"
  },
  "marco-duffle-bag": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Oliva"],
    gender: "Masculino",
    tags: ["acessorios", "bolsas", "travel"],
    image: "images/product/marco-duffle-bag-1.jpg",
    secondaryImage: "images/product/marco-duffle-bag-2.jpg",
    nameEn: "Marco duffle bag"
  },
  "atlas-crossbody-bag": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Grafite", "Preto"],
    gender: "Masculino",
    tags: ["acessorios", "bolsas"],
    image: "images/product/atlas-crossbody-bag-1.jpg",
    secondaryImage: "images/product/atlas-crossbody-bag-2.jpg",
    nameEn: "Atlas crossbody bag"
  },
  "pulse-leather-wallet": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Carteiras",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Marrom"],
    gender: "Masculino",
    tags: ["acessorios", "carteiras", "signature-pieces"],
    image: "images/product/pulse-leather-wallet-1.jpg",
    secondaryImage: "images/product/pulse-leather-wallet-2.jpg",
    nameEn: "Pulse leather wallet"
  },
  "vento-wool-scarf": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Lenços",
    material: "La",
    sizes: ["Unico"],
    colors: ["Cinza", "Azul"],
    gender: "Masculino",
    tags: ["acessorios", "lencos"],
    image: "images/product/vento-wool-scarf-1.jpg",
    secondaryImage: "images/product/vento-wool-scarf-2.jpg",
    nameEn: "Vento wool scarf"
  },
  "titan-buckle-belt": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Cintos",
    material: "Couro",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preto", "Cafe"],
    gender: "Masculino",
    tags: ["acessorios", "cintos"],
    image: "images/product/titan-buckle-belt-1.jpg",
    secondaryImage: "images/product/titan-buckle-belt-2.jpg",
    nameEn: "Titan buckle belt"
  },
  "luna-soft-bag": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Marfim", "Preto"],
    gender: "Feminino",
    tags: ["acessorios", "bolsas", "new-arrivals"],
    image: "images/product/genesis-hobo-bag-1.jpg",
    secondaryImage: "images/product/genesis-hobo-bag-2.jpg",
    nameEn: "Luna soft bag"
  },
  "stella-tote-bag": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Areia", "Caramelo"],
    gender: "Feminino",
    tags: ["acessorios", "bolsas"],
    image: "images/product/alicerce-mini-bag-1.jpg",
    secondaryImage: "images/product/alicerce-mini-bag-2.jpg",
    nameEn: "Stella tote bag"
  },
  "ivy-shoulder-bag": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Bolsas",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Vinho"],
    gender: "Feminino",
    tags: ["acessorios", "bolsas"],
    image: "images/product/atelier-bag-1.jpg",
    secondaryImage: "images/product/atelier-bag-2.jpg",
    nameEn: "Ivy shoulder bag"
  },
  "drift-bifold-wallet": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Carteiras",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Preto", "Cafe"],
    gender: "Masculino",
    tags: ["acessorios", "carteiras"],
    image: "images/product/pulse-leather-wallet-1.jpg",
    secondaryImage: "images/product/pulse-leather-wallet-2.jpg",
    nameEn: "Drift bifold wallet"
  },
  "north-zip-wallet": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Carteiras",
    material: "Couro",
    sizes: ["Unico"],
    colors: ["Grafite", "Preto"],
    gender: "Masculino",
    tags: ["acessorios", "carteiras", "signature-pieces"],
    image: "images/product/nox-card-wallet-1.jpg",
    secondaryImage: "images/product/nox-card-wallet-2.jpg",
    nameEn: "North zip wallet"
  },
  "orion-buckle-belt": {
    collection: "Alicerce",
    category: "Accessories",
    subcategory: "Cintos",
    material: "Couro",
    sizes: ["P", "M", "G", "GG"],
    colors: ["Preto", "Marrom"],
    gender: "Masculino",
    tags: ["acessorios", "cintos"],
    image: "images/product/titan-buckle-belt-1.jpg",
    secondaryImage: "images/product/titan-buckle-belt-2.jpg",
    nameEn: "Orion buckle belt"
  },
  "iris-slim-belt": {
    collection: "Gênesis",
    category: "Accessories",
    subcategory: "Cintos",
    material: "Couro",
    sizes: ["P", "M", "G"],
    colors: ["Caramelo", "Preto"],
    gender: "Feminino",
    tags: ["acessorios", "cintos"],
    image: "images/product/aura-thin-belt-1.jpg",
    secondaryImage: "images/product/aura-thin-belt-2.jpg",
    nameEn: "Iris slim belt"
  }
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function normalizeTextList(value: unknown, fallback: string[] = []): string[] {
  const list = Array.isArray(value) ? value : [];
  const cleaned: string[] = [];
  const seen = new Set<string>();

  list.forEach((entry) => {
    const item = sanitizeCatalogText(entry).trim();
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push(item);
  });

  if (cleaned.length > 0) return cleaned;
  return Array.isArray(fallback) && fallback.length > 0 ? normalizeTextList(fallback, []) : [];
}

function sanitizeVariantStockMap(value: unknown, validColors: string[] = [], validSizes: string[] = []): VariantStockMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowedPairs = new Set<string>();
  validColors.forEach((color) => {
    validSizes.forEach((size) => {
      allowedPairs.add(`${color}__${size}`);
    });
  });

  const normalized: VariantStockMap = {};
  Object.entries(value as JsonRecord).forEach(([rawKey, rawQty]) => {
    const key = String(rawKey || "").trim();
    if (!key) return;

    const splitByPipe = key.includes("|") ? key.split("|") : [];
    const canonicalKey =
      splitByPipe.length === 2
        ? `${String(splitByPipe[0] || "").trim()}__${String(splitByPipe[1] || "").trim()}`
        : key;

    if (!canonicalKey || !allowedPairs.has(canonicalKey)) return;
    const qty = Math.max(0, Math.floor(Number(rawQty || 0)));
    normalized[canonicalKey] = qty;
  });

  return normalized;
}

function normalizeAvailabilityStatus(value: unknown, fallback: unknown = ""): ProductAvailabilityStatus | undefined {
  const direct = String(value || "")
    .trim()
    .toLowerCase();
  if (direct === "disponivel" || direct === "esgotando" || direct === "esgotado") {
    return direct;
  }

  const fallbackValue = String(fallback || "")
    .trim()
    .toLowerCase();
  if (fallbackValue === "disponivel" || fallbackValue === "esgotando" || fallbackValue === "esgotado") {
    return fallbackValue;
  }

  return undefined;
}

function resolveAvailabilityStatus(
  explicitStatus: ProductAvailabilityStatus | undefined,
  stockQty: number
): ProductAvailabilityStatus {
  if (explicitStatus) return explicitStatus;
  return Number(stockQty || 0) <= 0 ? "esgotado" : "disponivel";
}

function normalizeProductMetadata(value: unknown, fallback: ProductStaticMetadata = {}): ProductMetadata {
  const raw = asRecord(value);
  const fallbackSizes = normalizeTextList(fallback.sizes, ["?nico"]);
  const fallbackColors = normalizeTextList(fallback.colors, ["?nico"]);
  const rawVariantStock = asRecord(raw.variantStock);

  const extractedColors: string[] = [];
  const extractedSizes: string[] = [];
  Object.keys(rawVariantStock).forEach((rawKey) => {
    const key = String(rawKey || "").trim();
    if (!key) return;
    const parts = key.includes("__") ? key.split("__") : key.includes("|") ? key.split("|") : [];
    if (parts.length !== 2) return;
    const color = String(parts[0] || "").trim();
    const size = String(parts[1] || "").trim();
    if (color) extractedColors.push(color);
    if (size) extractedSizes.push(size);
  });

  let sizes = normalizeTextList(
    [...normalizeTextList(raw.sizes, []), ...normalizeTextList(extractedSizes, [])],
    fallbackSizes.length ? fallbackSizes : ["?nico"]
  );
  let colors = normalizeTextList(
    [...normalizeTextList(raw.colors, []), ...normalizeTextList(extractedColors, [])],
    fallbackColors.length ? fallbackColors : ["?nico"]
  );
  let variantStock = sanitizeVariantStockMap(raw.variantStock ?? raw.variant_stock, colors, sizes);
  const availabilityStatus = normalizeAvailabilityStatus(raw.availabilityStatus ?? raw.availability_status);

  const looksLikeLegacyBlackOnly =
    colors.length === 1 &&
    String(colors[0] || "").trim().toLowerCase() === "preto" &&
    fallbackColors.length > 1 &&
    Object.keys(variantStock).length === 0;

  if (looksLikeLegacyBlackOnly) {
    colors = fallbackColors;
    sizes = fallbackSizes.length ? fallbackSizes : sizes;
    variantStock = sanitizeVariantStockMap(raw.variantStock ?? raw.variant_stock, colors, sizes);
  }

  const collection = sanitizeCatalogText(raw.collection || fallback.collection || "").trim();
  const category = sanitizeCatalogText(raw.category || fallback.category || "").trim();
  const subcategory = sanitizeCatalogText(raw.subcategory || fallback.subcategory || "").trim();
  const material = sanitizeCatalogText(raw.material || fallback.material || "").trim();
  const genderRaw = sanitizeCatalogText(raw.gender || fallback.gender || "").trim();
  const gender =
    genderRaw && ["feminino", "masculino", "unissex"].includes(genderRaw.toLowerCase())
      ? genderRaw[0].toUpperCase() + genderRaw.slice(1).toLowerCase()
      : "";

  const secondaryImage = String(
    raw.secondaryImage || raw.secondary_image || raw.image2 || raw.hoverImage || fallback.secondaryImage || ""
  ).trim();
  const galleryImages = normalizeTextList(raw.galleryImages || raw.gallery_images || [], []);

  const rawColorImages = raw.colorImages || raw.color_images;
  const colorImages: Record<string, string[]> | undefined =
    rawColorImages && typeof rawColorImages === "object" && !Array.isArray(rawColorImages)
      ? Object.fromEntries(
          Object.entries(rawColorImages as Record<string, unknown>)
            .map(([color, urls]) => [
              String(color).trim(),
              normalizeTextList(Array.isArray(urls) ? urls : [], [])
            ])
            .filter(([color, urls]) => color && (urls as string[]).length > 0)
        )
      : undefined;
  const careList = normalizeTextList(raw.careList || raw.care_list || [], []);
  const modelInfo = sanitizeCatalogText(raw.modelInfo || raw.model_info || "").trim();
  const fitType = sanitizeCatalogText(raw.fitType || raw.fit_type || "").trim();
  const sizeRecommendation = sanitizeCatalogText(raw.sizeRecommendation || raw.size_recommendation || "").trim();
  const detailedModeling = sanitizeCatalogText(raw.detailedModeling || raw.detailed_modeling || "").trim();
  const materialMain = sanitizeCatalogText(raw.materialMain || raw.material_main || "").trim();
  const cleaningRecommendation = sanitizeCatalogText(
    raw.cleaningRecommendation || raw.cleaning_recommendation || ""
  ).trim();

  return {
    sizes: sizes.length ? sizes : ["?nico"],
    colors: colors.length ? colors : ["?nico"],
    variantStock,
    availabilityStatus,
    collection: collection || undefined,
    category: category || undefined,
    subcategory: subcategory || undefined,
    material: material || undefined,
    gender: gender || undefined,
    secondaryImage: secondaryImage || undefined,
    galleryImages: galleryImages.length ? galleryImages : undefined,
    colorImages: colorImages && Object.keys(colorImages).length ? colorImages : undefined,
    modelInfo: modelInfo || undefined,
    fitType: fitType || undefined,
    sizeRecommendation: sizeRecommendation || undefined,
    detailedModeling: detailedModeling || undefined,
    materialMain: materialMain || undefined,
    cleaningRecommendation: cleaningRecommendation || undefined,
    careList: careList.length ? careList : undefined
  };
}

const FEMALE_SKUS = new Set<string>([
  "genesis-bomber",
  "genesis-tailored",
  "eclipse-shirt",
  "origem-skirt",
  "noir-dress",
  "essence-blazer",
  "essence-trousers",
  "aurora-coat",
  "areia-top",
  "lunar-blazer",
  "prisma-skirt",
  "serif-dress",
  "nebula-tee",
  "coral-pants",
  "birch-cardigan",
  "solstice-jacket",
  "genesis-hobo-bag",
  "alicerce-mini-bag",
  "fleur-silk-scarf",
  "nox-card-wallet",
  "aura-thin-belt",
  "luna-soft-bag",
  "stella-tote-bag",
  "ivy-shoulder-bag",
  "iris-slim-belt"
]);

const MALE_SKUS = new Set<string>([
  "origem-shirt",
  "atelier-bag",
  "atelier-heels",
  "flux-trench",
  "flux-knit",
  "noir-sneaker",
  "vento-trousers",
  "delta-jeans",
  "atlas-hoodie",
  "marco-trench",
  "vento-knit",
  "cairo-vest",
  "oslo-parka",
  "riviera-shorts",
  "pixel-bag",
  "metro-belt",
  "marco-duffle-bag",
  "atlas-crossbody-bag",
  "pulse-leather-wallet",
  "vento-wool-scarf",
  "titan-buckle-belt",
  "drift-bifold-wallet",
  "north-zip-wallet",
  "orion-buckle-belt"
]);

const NEW_SKUS = new Set<string>([
  "genesis-bomber",
  "genesis-tailored",
  "origem-skirt",
  "noir-dress",
  "aurora-coat",
  "eclipse-shirt",
  "essence-blazer",
  "essence-trousers",
  "areia-top",
  "lunar-blazer",
  "prisma-skirt",
  "serif-dress",
  "nebula-tee",
  "coral-pants",
  "birch-cardigan",
  "origem-shirt",
  "atelier-bag",
  "atelier-heels",
  "flux-trench",
  "flux-knit",
  "noir-sneaker",
  "oslo-parka",
  "riviera-shorts",
  "vento-trousers",
  "delta-jeans",
  "atlas-hoodie",
  "marco-trench",
  "vento-knit",
  "cairo-vest",
  "pixel-bag",
  "genesis-hobo-bag",
  "fleur-silk-scarf",
  "marco-duffle-bag",
  "pulse-leather-wallet",
  "luna-soft-bag",
  "stella-tote-bag",
  "ivy-shoulder-bag",
  "drift-bifold-wallet",
  "north-zip-wallet",
  "orion-buckle-belt",
  "iris-slim-belt"
]);

const BEST_SELLER_SKUS = new Set<string>([
  "origem-shirt",
  "origem-skirt",
  "atelier-bag",
  "atelier-heels",
  "essence-blazer",
  "essence-trousers",
  "flux-knit",
  "noir-sneaker"
]);

const FEATURED_SKUS = new Set<string>([
  "genesis-bomber",
  "genesis-tailored",
  "atelier-bag",
  "noir-dress",
  "oslo-parka",
  "pixel-bag"
]);

function normalizeTag(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveProductGenderBySku(sku: string, fallback: unknown): "Feminino" | "Masculino" {
  if (FEMALE_SKUS.has(sku)) return "Feminino";
  if (MALE_SKUS.has(sku)) return "Masculino";
  return String(fallback || "").trim().toLowerCase() === "feminino" ? "Feminino" : "Masculino";
}

function buildCollectionsArray(staticMetadata: ProductStaticMetadata): string[] {
  const primary = String(staticMetadata.collection || "Alicerce").trim() || "Alicerce";
  const merged = normalizeTextList([primary, ...normalizeTextList(staticMetadata.collections, [])], []);
  return merged.length ? merged : ["Alicerce"];
}

function buildProductTags(
  staticMetadata: ProductStaticMetadata,
  gender: "Feminino" | "Masculino",
  isNew: boolean,
  isBestSeller: boolean,
  isFeatured: boolean
): string[] {
  const result = new Set<string>(normalizeTextList(staticMetadata.tags, []).map((tag) => normalizeTag(tag)).filter(Boolean));

  if (gender === "Feminino") result.add("presente-para-ela");
  if (gender === "Masculino") result.add("presente-para-ele");

  if (isNew && gender === "Feminino") result.add("novidade-para-ela");
  if (isNew && gender === "Masculino") result.add("novidade-para-ele");

  if (isBestSeller) result.add("mais-vendidos");
  if (isFeatured) result.add("destaque");

  return Array.from(result);
}

function formatPriceLabelFromCents(priceCents: unknown): string {
  const value = Math.max(0, Number(priceCents || 0) / 100);
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function mapProduct(row: ProductRow | null | undefined): Product {
  const sku = String(row?.sku || "").trim();
  const staticMetadata = PRODUCT_METADATA[sku] || {};
  const metadata = normalizeProductMetadata(row?.metadata, staticMetadata);
  const metadataRecord = asRecord(row?.metadata);
  const effectivePriceCents = STOREFRONT_DEFAULT_PRICE_CENTS;
  const priceValue = effectivePriceCents / 100;
  const dbImage = String(row?.image_url || "").trim();
  const metadataImage = String(metadataRecord.image || metadataRecord.image_url || metadataRecord.imageUrl || "").trim();
  const staticImage = String(staticMetadata.image || "").trim();
  const metadataSecondaryImage = String(metadata.secondaryImage || "").trim();
  const staticSecondaryImage = String(staticMetadata.secondaryImage || "").trim();
  const resolvedImage = dbImage || metadataImage || staticImage || DEFAULT_IMAGE;
  const resolvedSecondaryImage = metadataSecondaryImage || staticSecondaryImage;
  const variantStockTotal = Object.values(metadata.variantStock || {}).reduce(
    (sum, qty) => sum + Math.max(0, Number(qty || 0)),
    0
  );
  const stockQty = Math.max(0, Number(row?.stock_qty || 0));
  const resolvedStock = stockQty > 0 ? stockQty : variantStockTotal;
  const resolvedAvailability = resolveAvailabilityStatus(metadata.availabilityStatus, resolvedStock);
  const collections = normalizeTextList(
    [String(metadata.collection || "").trim(), ...buildCollectionsArray(staticMetadata)],
    ["Alicerce"]
  );
  const resolvedGender = resolveProductGenderBySku(sku, metadata.gender || staticMetadata.gender);
  const category = sanitizeCatalogText(metadata.category || staticMetadata.category || "Colecao");
  const subcategory = sanitizeCatalogText(metadata.subcategory || staticMetadata.subcategory || category);
  const isNew = Boolean(staticMetadata.isNew ?? NEW_SKUS.has(sku));
  const isBestSeller = Boolean(staticMetadata.isBestSeller ?? BEST_SELLER_SKUS.has(sku));
  const isFeatured = Boolean(staticMetadata.isFeatured ?? FEATURED_SKUS.has(sku));
  const tags = buildProductTags(staticMetadata, resolvedGender, isNew, isBestSeller, isFeatured);

  return {
    id: sku,
    sku,
    slug: sku,
    dbId: row?.id,
    name: sanitizeCatalogText(row?.name || sku),
    nameEn: sanitizeCatalogText(staticMetadata.nameEn || row?.name || sku),
    collection: sanitizeCatalogText(collections[0]),
    collections,
    category,
    subcategory,
    material: sanitizeCatalogText(metadata.material || staticMetadata.material || "Material premium"),
    sizes: metadata.sizes,
    colors: metadata.colors,
    variantStock: metadata.variantStock,
    availabilityStatus: resolvedAvailability,
    gender: resolvedGender,
    price: priceValue,
    priceLabel: formatPriceLabelFromCents(effectivePriceCents),
    priceValue,
    unitAmount: effectivePriceCents,
    currency: String(row?.currency || "brl").toLowerCase(),
    stock: resolvedStock,
    isNew,
    isBestSeller,
    isFeatured,
    tags,
    active: Boolean(row?.active),
    image: resolvedImage,
    secondaryImage: resolvedSecondaryImage || undefined,
    modelInfo: metadata.modelInfo || undefined,
    fitType: metadata.fitType || undefined,
    sizeRecommendation: metadata.sizeRecommendation || undefined,
    detailedModeling: metadata.detailedModeling || undefined,
    materialMain: metadata.materialMain || undefined,
    cleaningRecommendation: metadata.cleaningRecommendation || undefined,
    careList: Array.isArray(metadata.careList) ? metadata.careList : undefined,
    galleryImages: Array.isArray(metadata.galleryImages) ? metadata.galleryImages : undefined,
    colorImages: metadata.colorImages && Object.keys(metadata.colorImages).length ? metadata.colorImages : undefined,
    createdAt: (row?.created_at as string | null) || null,
    updatedAt: (row?.updated_at as string | null) || null,
    href: `produto.html?id=${encodeURIComponent(sku)}`
  };
}

function formatSkuDisplayName(value: string): string {
  return String(value || "")
    .trim()
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function buildStaticProductRow(sku: string): ProductRow | null {
  const normalizedSku = String(sku || "").trim().toLowerCase();
  if (!normalizedSku) return null;

  const staticMetadata = PRODUCT_METADATA[normalizedSku];
  if (!staticMetadata) return null;

  return {
    id: normalizedSku,
    sku: normalizedSku,
    name: formatSkuDisplayName(normalizedSku),
    price_cents: STOREFRONT_DEFAULT_PRICE_CENTS,
    stock_qty: 1,
    currency: "brl",
    active: true,
    image_url: String(staticMetadata.image || DEFAULT_IMAGE).trim() || DEFAULT_IMAGE,
    metadata: buildPersistedMetadata(normalizedSku, staticMetadata),
    created_at: null,
    updated_at: null
  };
}

function getErrorCode(error: unknown): string {
  return String((error as { code?: unknown })?.code || "");
}

function getErrorMessage(error: unknown): string {
  return String((error as { message?: unknown })?.message || "");
}

function isMissingMetadataColumnError(error: unknown): boolean {
  return getErrorCode(error) === "42703" && /metadata/i.test(getErrorMessage(error));
}

let ensureMetadataColumnPromise: Promise<void> | null = null;
let ensureInventorySeedPromise: Promise<void> | null = null;
let hasEnsuredInventorySeed = false;

async function ensureProductsMetadataColumn(): Promise<void> {
  if (!ensureMetadataColumnPromise) {
    ensureMetadataColumnPromise = query(
      `
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb
      `
    )
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        ensureMetadataColumnPromise = null;
      });
  }

  await ensureMetadataColumnPromise;
}

function normalizeInventorySeedProduct(value: unknown): InventorySeedProduct | null {
  const item = asRecord(value);
  const sku = normalizeSku(item.id || item.sku || "");
  if (!sku) return null;

  const name = sanitizeCatalogText(item.name || sku).trim() || sku;
  const unitAmount = Math.max(0, Math.round(Number(item.unitAmount || item.priceCents || 0)));
  const stockQty = Math.max(0, Math.floor(Number(item.stock || item.stockQty || 0)));
  const currency = String(item.currency || "brl").trim().toLowerCase() || "brl";

  return {
    sku,
    name,
    unitAmount,
    stockQty,
    currency
  };
}

async function readInventorySeedProducts(): Promise<InventorySeedProduct[]> {
  for (const filePath of INVENTORY_FILE_CANDIDATES) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const uniqueBySku = new Map<string, InventorySeedProduct>();
      parsed.forEach((entry) => {
        const normalized = normalizeInventorySeedProduct(entry);
        if (!normalized) return;
        uniqueBySku.set(normalized.sku.toLowerCase(), normalized);
      });
      return Array.from(uniqueBySku.values());
    } catch {}
  }
  return [];
}

async function ensureInventorySeededFromFile(): Promise<void> {
  if (!AUTO_SYNC_INVENTORY_ON_READ || hasEnsuredInventorySeed) return;

  if (!ensureInventorySeedPromise) {
    ensureInventorySeedPromise = (async () => {
      const inventorySeed = await readInventorySeedProducts();
      if (inventorySeed.length === 0) {
        hasEnsuredInventorySeed = true;
        return;
      }

      const existing = await query<{ sku?: string }>("SELECT sku FROM products");
      const existingSkus = new Set(
        existing.rows.map((row) => String(row?.sku || "").trim().toLowerCase()).filter(Boolean)
      );
      const missing = inventorySeed.filter((product) => !existingSkus.has(product.sku.toLowerCase()));
      if (missing.length === 0) {
        hasEnsuredInventorySeed = true;
        return;
      }

      for (const product of missing) {
        const metadata = JSON.stringify(buildPersistedMetadata(product.sku, {}));
        const withMetadataParams: unknown[] = [
          product.sku,
          product.name,
          product.unitAmount,
          product.stockQty,
          product.currency,
          true,
          null,
          metadata
        ];
        const withoutMetadataParams = withMetadataParams.slice(0, 7);

        await queryWithOptionalMetadata(
          `
          INSERT INTO products (sku, name, price_cents, stock_qty, currency, active, image_url, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
          ON CONFLICT (sku) DO NOTHING
          `,
          `
          INSERT INTO products (sku, name, price_cents, stock_qty, currency, active, image_url)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (sku) DO NOTHING
          `,
          withMetadataParams,
          withoutMetadataParams
        );
      }

      hasEnsuredInventorySeed = true;
    })()
      .catch((error: unknown) => {
        console.warn("[catalog-sync] Failed to auto-seed inventory from data/inventory.json:", getErrorMessage(error));
      })
      .finally(() => {
        ensureInventorySeedPromise = null;
      });
  }

  await ensureInventorySeedPromise;
}

async function queryWithOptionalMetadata(
  sqlWithMetadata: string,
  sqlWithoutMetadata: string,
  params: unknown[] = [],
  fallbackParams: unknown[] | null = null
): Promise<QueryResult<ProductRow>> {
  try {
    return await query<ProductRow>(sqlWithMetadata, params);
  } catch (error: unknown) {
    if (!isMissingMetadataColumnError(error) || !sqlWithoutMetadata) throw error;

    await ensureProductsMetadataColumn();

    try {
      return await query<ProductRow>(sqlWithMetadata, params);
    } catch (retryError: unknown) {
      if (!isMissingMetadataColumnError(retryError)) throw retryError;
      return query<ProductRow>(sqlWithoutMetadata, Array.isArray(fallbackParams) ? fallbackParams : params);
    }
  }
}

async function listProducts(): Promise<Product[]> {
  await ensureInventorySeededFromFile();

  const result = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    WHERE active = true
    ORDER BY created_at DESC
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    WHERE active = true
    ORDER BY created_at DESC
    `
  );
  return result.rows.map(mapProduct);
}

function foldText(value: unknown): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function tokenizeSearch(value: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];
  foldText(value)
    .split(/[^a-z0-9]+/g)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .forEach((item) => {
      if (seen.has(item)) return;
      seen.add(item);
      tokens.push(item);
    });
  return tokens;
}

function buildSearchHaystack(product: Product): {
  sku: string;
  name: string;
  category: string;
  collection: string;
  material: string;
  gender: string;
  colors: string[];
  sizes: string[];
  all: string;
} {
  const sku = foldText(product.sku);
  const name = foldText(product.name);
  const category = foldText(product.category);
  const collection = foldText(product.collection);
  const material = foldText(product.material);
  const gender = foldText(product.gender);
  const colors = (Array.isArray(product.colors) ? product.colors : []).map((item) => foldText(item)).filter(Boolean);
  const sizes = (Array.isArray(product.sizes) ? product.sizes : []).map((item) => foldText(item)).filter(Boolean);
  const all = [sku, name, category, collection, material, gender, ...colors, ...sizes].filter(Boolean).join(" ");
  return { sku, name, category, collection, material, gender, colors, sizes, all };
}

function matchesStrictSearch(product: Product, query: string, tokens: string[]): boolean {
  const normalizedQuery = foldText(query);
  if (!normalizedQuery) return true;

  const h = buildSearchHaystack(product);
  const strictFields = [h.name, h.category, h.sku];

  if (strictFields.some((field) => field.includes(normalizedQuery))) return true;
  if (!tokens.length) return false;

  return tokens.every((token) => strictFields.some((field) => field.includes(token)));
}

const PRODUCT_TYPE_TOKENS = new Set([
  "calca",
  "calcas",
  "camisa",
  "camisas",
  "camiseta",
  "camisetas",
  "jaqueta",
  "jaquetas",
  "blazer",
  "blazers",
  "saia",
  "saias",
  "vestido",
  "vestidos",
  "tenis",
  "sapato",
  "sapatos",
  "bolsa",
  "bolsas",
  "acessorio",
  "acessorios",
  "casaco",
  "casacos"
]);

function hasProductTypeIntent(query: string, tokens: string[]): boolean {
  const normalizedQuery = foldText(query);
  if (PRODUCT_TYPE_TOKENS.has(normalizedQuery)) return true;
  return tokens.some((token) => PRODUCT_TYPE_TOKENS.has(token));
}

function matchesFlexibleAttributesSearch(product: Product, query: string, tokens: string[]): boolean {
  const normalizedQuery = foldText(query);
  if (!normalizedQuery) return true;

  const h = buildSearchHaystack(product);
  const broadFields = [h.name, h.category, h.sku, h.collection, h.material, h.gender, ...h.colors, ...h.sizes];

  if (broadFields.some((field) => field.includes(normalizedQuery))) return true;
  if (!tokens.length) return false;

  return tokens.every((token) => broadFields.some((field) => field.includes(token)));
}

function matchesStorefrontSearch(product: Product, query: string, tokens: string[]): boolean {
  if (hasProductTypeIntent(query, tokens)) {
    return matchesStrictSearch(product, query, tokens);
  }
  return matchesFlexibleAttributesSearch(product, query, tokens);
}

function scoreProductSearch(product: Product, query: string, tokens: string[]): number {
  const normalizedQuery = foldText(query);
  if (!normalizedQuery) return 0;

  const h = buildSearchHaystack(product);
  let score = 0;

  if (h.sku === normalizedQuery) score += 200;
  if (h.name === normalizedQuery) score += 170;
  if (h.sku.startsWith(normalizedQuery)) score += 130;
  if (h.name.startsWith(normalizedQuery)) score += 120;
  if (h.name.includes(normalizedQuery)) score += 80;
  if (h.sku.includes(normalizedQuery)) score += 60;
  if (h.category.includes(normalizedQuery)) score += 36;
  if (h.collection.includes(normalizedQuery)) score += 32;
  if (h.material.includes(normalizedQuery)) score += 24;
  if (h.gender.includes(normalizedQuery)) score += 16;
  if (h.colors.some((item) => item.includes(normalizedQuery))) score += 24;
  if (h.sizes.some((item) => item.includes(normalizedQuery))) score += 12;

  let tokenMatches = 0;
  tokens.forEach((token) => {
    const inNamePrefix = h.name.startsWith(token);
    const inSkuPrefix = h.sku.startsWith(token);
    const inAll = h.all.includes(token);

    if (inNamePrefix) {
      score += 45;
      tokenMatches += 1;
      return;
    }
    if (inSkuPrefix) {
      score += 35;
      tokenMatches += 1;
      return;
    }
    if (inAll) {
      score += 18;
      tokenMatches += 1;
    }
  });

  if (tokens.length > 1 && tokenMatches === tokens.length) {
    score += 32;
  } else if (tokens.length > 1 && tokenMatches > 0) {
    score += 8;
  }

  if (product.stock > 0) score += 4;
  return score;
}

function uniqueTextList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  values.forEach((value) => {
    const normalized = String(value || "").trim();
    if (!normalized) return;
    const key = foldText(normalized);
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });
  return output;
}

function levenshteinDistance(a: string, b: string): number {
  const left = foldText(a);
  const right = foldText(b);
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const rows = left.length + 1;
  const cols = right.length + 1;
  const dp = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[rows - 1][cols - 1];
}

function extractSearchDictionary(products: Product[]): string[] {
  const terms: string[] = [];
  products.forEach((product) => {
    terms.push(product.name, product.sku, product.category, product.collection, product.material, product.gender);
    (Array.isArray(product.colors) ? product.colors : []).forEach((item) => terms.push(String(item || "")));
    (Array.isArray(product.sizes) ? product.sizes : []).forEach((item) => terms.push(String(item || "")));
  });
  return uniqueTextList(terms);
}

function resolveDidYouMean(query: string, dictionary: string[]): string | null {
  const normalized = foldText(query);
  if (!normalized || normalized.length < 3) return null;

  let bestTerm = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  dictionary.forEach((term) => {
    const folded = foldText(term);
    if (!folded || folded === normalized) return;
    const distance = levenshteinDistance(normalized, folded);
    const maxAllowed = Math.max(1, Math.floor(Math.min(3, folded.length * 0.34)));
    if (distance > maxAllowed) return;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestTerm = term;
    }
  });
  return bestTerm || null;
}

function mapSuggestionProduct(product: Product): SearchSuggestionProduct {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    image: product.image,
    secondaryImage: product.secondaryImage,
    category: product.category,
    collection: product.collection,
    stock: product.stock,
    active: product.active
  };
}

async function searchStorefrontSuggestions({
  query: q = "",
  limit = 8
}: SearchStorefrontSuggestionsOptions = {}): Promise<{
  terms: string[];
  didYouMean: string | null;
  products: SearchSuggestionProduct[];
}> {
  const normalized = String(q || "").trim();
  const safeLimit = Math.max(1, Math.min(12, Number(limit) || 8));
  if (normalized.length < 2) return { terms: [], didYouMean: null, products: [] };

  const products = await listProducts();
  const activeProducts = products.filter((item) => item && item.active !== false);
  const foldedQuery = foldText(normalized);
  const dictionary = extractSearchDictionary(activeProducts);

  const terms = dictionary
    .map((term) => {
      const folded = foldText(term);
      let score = 0;
      if (folded === foldedQuery) score += 120;
      if (folded.startsWith(foldedQuery)) score += 80;
      if (folded.includes(foldedQuery)) score += 42;
      return { term, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term))
    .slice(0, safeLimit)
    .map((entry) => entry.term);

  const didYouMean = resolveDidYouMean(normalized, dictionary);
  const tokens = tokenizeSearch(normalized);
  const suggestedProducts = activeProducts
    .map((product) => ({ product, score: scoreProductSearch(product, normalized, tokens) }))
    .filter((entry) => entry.score > 0 && matchesStorefrontSearch(entry.product, normalized, tokens))
    .sort((a, b) => b.score - a.score)
    .slice(0, safeLimit)
    .map((entry) => mapSuggestionProduct(entry.product));

  return { terms, didYouMean, products: suggestedProducts };
}

async function searchStorefrontProducts({
  query: q = "",
  page = 1,
  limit = 8,
  category = "",
  collection = "",
  gender = "",
  inStock = false,
  sort = "relevance"
}: SearchStorefrontProductsOptions = {}): Promise<{ rows: Product[]; total: number; page: number; limit: number }> {
  const normalizedQuery = String(q || "").trim();
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(24, Number(limit) || 8));
  const offset = (safePage - 1) * safeLimit;

  const products = await listProducts();
  const normalizedCategory = foldText(category);
  const normalizedCollection = foldText(collection);
  const normalizedGender = foldText(gender);
  const tokens = tokenizeSearch(normalizedQuery);

  const filtered = products.filter((product) => {
    if (!product || product.active === false) return false;
    if (inStock && Number(product.stock || 0) <= 0) return false;
    if (normalizedCategory && foldText(product.category) !== normalizedCategory) return false;
    if (normalizedCollection && foldText(product.collection) !== normalizedCollection) return false;
    if (normalizedGender && foldText(product.gender) !== normalizedGender) return false;
    return true;
  });

  const scored = normalizedQuery
    ? filtered
        .map((product) => ({ product, score: scoreProductSearch(product, normalizedQuery, tokens) }))
        .filter((entry) => entry.score > 0 && matchesStorefrontSearch(entry.product, normalizedQuery, tokens))
    : filtered.map((product) => ({ product, score: 0 }));

  scored.sort((a, b) => {
    if (sort === "price_asc") return a.product.priceValue - b.product.priceValue;
    if (sort === "price_desc") return b.product.priceValue - a.product.priceValue;
    if (sort === "newest") {
      const aTime = new Date(a.product.createdAt || 0).getTime();
      const bTime = new Date(b.product.createdAt || 0).getTime();
      return bTime - aTime;
    }

    if (b.score !== a.score) return b.score - a.score;
    if (b.product.stock !== a.product.stock) return b.product.stock - a.product.stock;
    const aTime = new Date(a.product.createdAt || 0).getTime();
    const bTime = new Date(b.product.createdAt || 0).getTime();
    return bTime - aTime;
  });

  return {
    rows: scored.slice(offset, offset + safeLimit).map((entry) => entry.product),
    total: scored.length,
    page: safePage,
    limit: safeLimit
  };
}

async function listAdminProducts({ limit = 200, offset = 0, search = "", includeInactive = true }: ListAdminProductsOptions = {}): Promise<Product[]> {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const normalizedSearch = String(search || "").trim().toLowerCase();
  const values: unknown[] = [safeLimit, safeOffset];
  const conditions: string[] = [];

  if (!includeInactive) {
    conditions.push("active = true");
  }

  if (normalizedSearch) {
    values.push(`%${normalizedSearch}%`);
    conditions.push("(lower(name) LIKE $" + values.length + " OR lower(sku) LIKE $" + values.length + ")");
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
    values
  );

  return result.rows.map(mapProduct);
}

async function searchAdminProducts({
  query: q = "",
  status = "",
  stock = "",
  page = 1,
  pageSize = 50
}: SearchAdminProductsOptions = {}): Promise<{ rows: Product[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize) || 50));
  const offset = (safePage - 1) * safePageSize;

  const normalizedQuery = String(q || "").trim().toLowerCase();
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const normalizedStock = String(stock || "").trim().toLowerCase();

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (normalizedStatus === "active") conditions.push("active = true");
  if (normalizedStatus === "inactive") conditions.push("active = false");

  if (normalizedStock === "out") conditions.push("stock_qty <= 0");
  if (normalizedStock === "in") conditions.push("stock_qty > 0");

  if (normalizedQuery) {
    values.push(`%${normalizedQuery}%`);
    conditions.push("(lower(name) LIKE $" + values.length + " OR lower(sku) LIKE $" + values.length + ")");
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(safePageSize, offset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const listResult = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    ${whereSql}
    ORDER BY updated_at DESC, created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    values
  );

  const countResult = await query<{ total?: number } & JsonRecord>(
    `
    SELECT COUNT(*)::int AS total
    FROM products
    ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows: listResult.rows.map(mapProduct),
    total: Number(countResult.rows[0]?.total || 0),
    page: safePage,
    pageSize: safePageSize
  };
}

async function getProductByIdentifier(identifier: string): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;
  try {
    await ensureInventorySeededFromFile();

    const result = await queryWithOptionalMetadata(
      `
      SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      FROM products
      WHERE lower(sku) = lower($1)
         OR id::text = $1
      LIMIT 1
      `,
      `
      SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      FROM products
      WHERE lower(sku) = lower($1)
         OR id::text = $1
      LIMIT 1
      `,
      [normalized]
    );

    if (result.rowCount > 0) {
      return mapProduct(result.rows[0]);
    }
  } catch {
    // Fallback to static catalog below for local/dev resilience.
  }

  return mapProduct(buildStaticProductRow(normalized));
}

function normalizeSku(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}

function buildPersistedMetadata(sku: string, input: unknown = {}): ProductMetadata {
  const base = PRODUCT_METADATA[String(sku || "").trim()] || {};
  const normalized = normalizeProductMetadata(input, base);
  return {
    sizes: normalized.sizes,
    colors: normalized.colors,
    variantStock: normalized.variantStock,
    availabilityStatus: normalized.availabilityStatus,
    collection: normalized.collection,
    category: normalized.category,
    subcategory: normalized.subcategory,
    material: normalized.material,
    gender: normalized.gender,
    secondaryImage: normalized.secondaryImage,
    galleryImages: normalized.galleryImages,
    colorImages: normalized.colorImages,
    modelInfo: normalized.modelInfo,
    fitType: normalized.fitType,
    sizeRecommendation: normalized.sizeRecommendation,
    detailedModeling: normalized.detailedModeling,
    materialMain: normalized.materialMain,
    cleaningRecommendation: normalized.cleaningRecommendation,
    careList: normalized.careList
  };
}

function sumVariantStock(metadata: ProductMetadata): number {
  const map =
    metadata?.variantStock && typeof metadata.variantStock === "object" && !Array.isArray(metadata.variantStock)
      ? metadata.variantStock
      : {};
  return Object.values(map).reduce((sum, qty) => sum + Math.max(0, Math.floor(Number(qty || 0))), 0);
}

async function createProduct(payload: ProductWritePayload = {}): Promise<Product | { error: string }> {
  const sku = normalizeSku(payload.sku);
  if (!sku) return { error: "INVALID_SKU" };
  const metadata = buildPersistedMetadata(sku, {
    collection: payload.collection,
    category: payload.category,
    subcategory: payload.subcategory,
    material: payload.material,
    gender: payload.gender,
    secondaryImage: payload.secondaryImage,
    galleryImages: payload.galleryImages,
    modelInfo: payload.modelInfo,
    fitType: payload.fitType,
    sizeRecommendation: payload.sizeRecommendation,
    detailedModeling: payload.detailedModeling,
    materialMain: payload.materialMain,
    cleaningRecommendation: payload.cleaningRecommendation,
    careList: payload.careList,
    sizes: payload.sizes,
    colors: payload.colors,
    variantStock: payload.variantStock,
    availabilityStatus: payload.availabilityStatus
  });
  const variantStockTotal = sumVariantStock(metadata);
  const resolvedStockQty =
    Object.prototype.hasOwnProperty.call(payload, "stockQty") && payload.stockQty != null
      ? Math.max(0, Math.floor(Number(payload.stockQty || 0)))
      : variantStockTotal;

  const paramsWithMetadata: unknown[] = [
    sku,
    String(payload.name || sku).trim(),
    Math.max(0, Math.round(Number(payload.priceCents || 0))),
    resolvedStockQty,
    String(payload.currency || "brl").trim().toLowerCase() || "brl",
    Boolean(payload.active !== false),
    String(payload.imageUrl || "").trim() || null,
    JSON.stringify(metadata)
  ];
  const paramsWithoutMetadata = paramsWithMetadata.slice(0, 7);

  try {
    const result = await queryWithOptionalMetadata(
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb
      )
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      paramsWithMetadata,
      paramsWithoutMetadata
    );

    return mapProduct(result.rows[0] || null);
  } catch (error: unknown) {
    if (getErrorCode(error) === "23505") {
      return { error: "SKU_ALREADY_EXISTS" };
    }
    throw error;
  }
}

async function updateProductByIdentifier(identifier: string, patch: ProductWritePayload = {}): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  const currentRowResult = await queryWithOptionalMetadata(
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    FROM products
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    LIMIT 1
    `,
    `
    SELECT id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    FROM products
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    LIMIT 1
    `,
    [normalized]
  );
  const currentRow = currentRowResult.rows[0] || null;
  if (!currentRow) return null;
  const current = mapProduct(currentRow);
  const currentMetadataRecord = asRecord(currentRow.metadata);
  const metadata = buildPersistedMetadata(current.sku, {
    ...currentMetadataRecord,
    collection: patch.collection ?? currentMetadataRecord.collection,
    category: patch.category ?? currentMetadataRecord.category,
    subcategory: patch.subcategory ?? currentMetadataRecord.subcategory,
    material: patch.material ?? currentMetadataRecord.material,
    gender: patch.gender ?? currentMetadataRecord.gender,
    secondaryImage: patch.secondaryImage ?? currentMetadataRecord.secondaryImage,
    galleryImages: patch.galleryImages ?? currentMetadataRecord.galleryImages,
    colorImages: (patch as any).colorImages ?? currentMetadataRecord.colorImages,
    modelInfo: patch.modelInfo ?? currentMetadataRecord.modelInfo,
    fitType: patch.fitType ?? currentMetadataRecord.fitType,
    sizeRecommendation: patch.sizeRecommendation ?? currentMetadataRecord.sizeRecommendation,
    detailedModeling: patch.detailedModeling ?? currentMetadataRecord.detailedModeling,
    materialMain: patch.materialMain ?? currentMetadataRecord.materialMain,
    cleaningRecommendation: patch.cleaningRecommendation ?? currentMetadataRecord.cleaningRecommendation,
    careList: patch.careList ?? currentMetadataRecord.careList,
    sizes: patch.sizes ?? current.sizes,
    colors: patch.colors ?? current.colors,
    variantStock: patch.variantStock ?? current.variantStock,
    availabilityStatus: patch.availabilityStatus ?? currentMetadataRecord.availabilityStatus
  });
  const variantStockTotal = sumVariantStock(metadata);
  const resolvedStockQty =
    Object.prototype.hasOwnProperty.call(patch, "stockQty") && patch.stockQty != null
      ? Math.max(0, Math.floor(Number(patch.stockQty || 0)))
      : variantStockTotal > 0
        ? variantStockTotal
        : Math.max(0, Math.floor(Number(current.stock ?? 0)));

  const paramsWithMetadata: unknown[] = [
    normalized,
    String(patch.name ?? current.name ?? current.sku).trim(),
    Math.max(0, Math.round(Number(patch.priceCents ?? current.unitAmount ?? 0))),
    resolvedStockQty,
    String(patch.currency ?? current.currency ?? "brl").trim().toLowerCase() || "brl",
    Boolean(patch.active ?? current.active),
    String(patch.imageUrl ?? current.image ?? "").trim() || null,
    JSON.stringify(metadata)
  ];
  const paramsWithoutMetadata = paramsWithMetadata.slice(0, 7);

  const result = await queryWithOptionalMetadata(
    `
    UPDATE products
    SET
      name = $2,
      price_cents = $3,
      stock_qty = $4,
      currency = $5,
      active = $6,
      image_url = $7,
      metadata = $8::jsonb,
      updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    `,
    `
    UPDATE products
    SET
      name = $2,
      price_cents = $3,
      stock_qty = $4,
      currency = $5,
      active = $6,
      image_url = $7,
      updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    `,
    paramsWithMetadata,
    paramsWithoutMetadata
  );

  return mapProduct(result.rows[0] || null);
}

async function archiveProductByIdentifier(identifier: string): Promise<Product | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;
  const result = await queryWithOptionalMetadata(
    `
    UPDATE products
    SET active = false,
        updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
    `,
    `
    UPDATE products
    SET active = false,
        updated_at = NOW()
    WHERE id::text = $1
       OR lower(sku) = lower($1)
    RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
    `,
    [normalized]
  );
  return mapProduct(result.rows[0] || null);
}

async function deleteProductByIdentifier(identifier: string): Promise<Product | { error: string } | null> {
  const normalized = String(identifier || "").trim();
  if (!normalized) return null;

  try {
    const result = await queryWithOptionalMetadata(
      `
      DELETE FROM products
      WHERE id::text = $1
         OR lower(sku) = lower($1)
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      DELETE FROM products
      WHERE id::text = $1
         OR lower(sku) = lower($1)
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      [normalized]
    );
    return mapProduct(result.rows[0] || null);
  } catch (error: unknown) {
    if (getErrorCode(error) === "23503") {
      return { error: "PRODUCT_IN_USE" };
    }
    throw error;
  }
}

function getSnapshotString(snapshot: JsonRecord, key: string): string {
  return String(snapshot[key] || "");
}

async function restoreProductFromSnapshot(snapshotInput: JsonRecord = {}): Promise<{ ok: true; product: Product | null } | { error: string }> {
  const snapshot = asRecord(snapshotInput);
  const sku = normalizeSku(snapshot.sku || snapshot.id || "");
  if (!sku) return { error: "INVALID_SNAPSHOT" };
  const metadata = buildPersistedMetadata(sku, {
    sizes: snapshot.sizes,
    colors: snapshot.colors,
    variantStock: snapshot.variantStock
  });

  try {
    const result = await queryWithOptionalMetadata(
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
      )
      ON CONFLICT (sku) DO UPDATE
      SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        stock_qty = EXCLUDED.stock_qty,
        currency = EXCLUDED.currency,
        active = EXCLUDED.active,
        image_url = EXCLUDED.image_url,
        metadata = EXCLUDED.metadata,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, metadata, created_at, updated_at
      `,
      `
      INSERT INTO products (
        sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, COALESCE($9::timestamptz, NOW()), COALESCE($10::timestamptz, NOW())
      )
      ON CONFLICT (sku) DO UPDATE
      SET
        name = EXCLUDED.name,
        price_cents = EXCLUDED.price_cents,
        stock_qty = EXCLUDED.stock_qty,
        currency = EXCLUDED.currency,
        active = EXCLUDED.active,
        image_url = EXCLUDED.image_url,
        updated_at = COALESCE(EXCLUDED.updated_at, NOW())
      RETURNING id, sku, name, price_cents, stock_qty, currency, active, image_url, created_at, updated_at
      `,
      [
        sku,
        String(snapshot.name || sku).trim(),
        Math.max(0, Math.round(Number(snapshot.unitAmount || snapshot.priceCents || 0))),
        Math.max(0, Math.floor(Number(snapshot.stock || snapshot.stockQty || 0))),
        String(snapshot.currency || "brl").trim().toLowerCase() || "brl",
        Boolean(snapshot.active !== false),
        getSnapshotString(snapshot, "image") || getSnapshotString(snapshot, "imageUrl") || null,
        JSON.stringify(metadata),
        snapshot.createdAt || null,
        snapshot.updatedAt || null
      ]
    );
    return { ok: true, product: mapProduct(result.rows[0] || null) };
  } catch (error: unknown) {
    if (getErrorCode(error) === "23505") {
      return { error: "SKU_ALREADY_EXISTS" };
    }
    throw error;
  }
}

module.exports = {
  listProducts,
  searchStorefrontProducts,
  searchStorefrontSuggestions,
  listAdminProducts,
  searchAdminProducts,
  getProductByIdentifier,
  createProduct,
  updateProductByIdentifier,
  archiveProductByIdentifier,
  deleteProductByIdentifier,
  restoreProductFromSnapshot
};








