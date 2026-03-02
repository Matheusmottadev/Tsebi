export {};

type SearchOptions = {
  query: string;
  page?: number;
  perPage?: number;
};

type ProductIndexDocument = {
  id: string;
  sku: string;
  name: string;
  category: string;
  collection: string;
  material: string;
  gender: string;
  colors: string[];
  sizes: string[];
  active: boolean;
  stock: number;
  priceValue: number;
  image: string;
  secondaryImage: string;
};

type SearchResponse = {
  enabled: boolean;
  ids: string[];
  found: number;
};

type TypesenseConfig = {
  baseUrl: string;
  apiKey: string;
  collection: string;
  timeoutMs: number;
};

function resolveTypesenseConfig(): TypesenseConfig | null {
  const explicitUrl = String(process.env.TYPESENSE_URL || "").trim();
  const host = String(process.env.TYPESENSE_HOST || "").trim();
  const protocol = String(process.env.TYPESENSE_PROTOCOL || "https").trim() || "https";
  const port = String(process.env.TYPESENSE_PORT || "").trim();
  const apiKey = String(process.env.TYPESENSE_API_KEY || "").trim();
  const collection = String(process.env.TYPESENSE_COLLECTION || "products").trim() || "products";
  const timeoutMs = Math.max(500, Math.min(15000, Number(process.env.TYPESENSE_TIMEOUT_MS || 2500) || 2500));

  if (!apiKey) return null;

  let baseUrl = "";
  if (explicitUrl) {
    baseUrl = explicitUrl.replace(/\/+$/, "");
  } else if (host) {
    baseUrl = `${protocol}://${host}${port ? `:${port}` : ""}`;
  } else {
    return null;
  }

  return { baseUrl, apiKey, collection, timeoutMs };
}

function withTimeout(signalTimeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), signalTimeoutMs);
  return controller.signal;
}

async function typesenseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const config = resolveTypesenseConfig();
  if (!config) {
    throw new Error("TYPESENSE_NOT_CONFIGURED");
  }

  const url = `${config.baseUrl}${path}`;
  const headers = new Headers(init.headers || {});
  headers.set("X-TYPESENSE-API-KEY", config.apiKey);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, {
    ...init,
    headers,
    signal: withTimeout(config.timeoutMs)
  });
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  value.forEach((entry) => {
    const item = String(entry || "").trim();
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
}

function toSearchDocument(product: any): ProductIndexDocument | null {
  const sku = String(product?.sku || product?.id || "").trim();
  if (!sku) return null;

  return {
    id: sku,
    sku,
    name: String(product?.name || "").trim(),
    category: String(product?.category || "").trim(),
    collection: String(product?.collection || "").trim(),
    material: String(product?.material || "").trim(),
    gender: String(product?.gender || "").trim(),
    colors: normalizeTextList(product?.colors),
    sizes: normalizeTextList(product?.sizes),
    active: Boolean(product?.active),
    stock: Number(product?.stock || 0) || 0,
    priceValue: Number(product?.priceValue || 0) || 0,
    image: String(product?.image || "").trim(),
    secondaryImage: String(product?.secondaryImage || "").trim()
  };
}

async function ensureCollection(): Promise<void> {
  const config = resolveTypesenseConfig();
  if (!config) return;

  const readResponse = await typesenseRequest(`/collections/${encodeURIComponent(config.collection)}`, { method: "GET" });
  if (readResponse.ok) return;
  if (readResponse.status !== 404) {
    throw new Error(`TYPESENSE_COLLECTION_READ_FAILED_${readResponse.status}`);
  }

  const createResponse = await typesenseRequest("/collections", {
    method: "POST",
    body: JSON.stringify({
      name: config.collection,
      fields: [
        { name: "id", type: "string" },
        { name: "sku", type: "string" },
        { name: "name", type: "string" },
        { name: "category", type: "string", facet: true },
        { name: "collection", type: "string", facet: true },
        { name: "material", type: "string", facet: true },
        { name: "gender", type: "string", facet: true },
        { name: "colors", type: "string[]", facet: true },
        { name: "sizes", type: "string[]", facet: true },
        { name: "active", type: "bool", facet: true },
        { name: "stock", type: "int32", sort: true },
        { name: "priceValue", type: "float", sort: true },
        { name: "image", type: "string", optional: true },
        { name: "secondaryImage", type: "string", optional: true }
      ],
      default_sorting_field: "stock"
    })
  });

  if (!createResponse.ok && createResponse.status !== 409) {
    throw new Error(`TYPESENSE_COLLECTION_CREATE_FAILED_${createResponse.status}`);
  }
}

async function upsertProductsIndex(products: any[]): Promise<{ enabled: boolean; total: number }> {
  const config = resolveTypesenseConfig();
  if (!config) return { enabled: false, total: 0 };

  await ensureCollection();

  const docs = (Array.isArray(products) ? products : [])
    .map(toSearchDocument)
    .filter(Boolean) as ProductIndexDocument[];

  if (docs.length === 0) return { enabled: true, total: 0 };

  const payload = docs.map((doc) => JSON.stringify(doc)).join("\n");
  const response = await typesenseRequest(
    `/collections/${encodeURIComponent(config.collection)}/documents/import?action=upsert`,
    {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: payload
    }
  );

  if (!response.ok) {
    throw new Error(`TYPESENSE_IMPORT_FAILED_${response.status}`);
  }

  return { enabled: true, total: docs.length };
}

async function searchProducts(options: SearchOptions): Promise<SearchResponse> {
  const config = resolveTypesenseConfig();
  if (!config) return { enabled: false, ids: [], found: 0 };

  const query = String(options.query || "").trim();
  if (!query) return { enabled: true, ids: [], found: 0 };

  const page = Math.max(1, Number(options.page || 1) || 1);
  const perPage = Math.max(1, Math.min(24, Number(options.perPage || 8) || 8));

  const params = new URLSearchParams();
  params.set("q", query);
  params.set("query_by", "name,sku,category,collection,material,gender,colors,sizes");
  params.set("sort_by", "_text_match:desc,stock:desc");
  params.set("filter_by", "active:=true");
  params.set("prefix", "true,true,false,false,false,false,false,false");
  params.set("typo_tokens_threshold", "1");
  params.set("num_typos", "2");
  params.set("per_page", String(perPage));
  params.set("page", String(page));
  params.set("include_fields", "id,sku");

  const response = await typesenseRequest(
    `/collections/${encodeURIComponent(config.collection)}/documents/search?${params.toString()}`,
    { method: "GET" }
  );

  if (!response.ok) {
    throw new Error(`TYPESENSE_SEARCH_FAILED_${response.status}`);
  }

  const data = await response.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  const ids: string[] = [];
  const seen = new Set<string>();
  hits.forEach((hit: any) => {
    const id = String(hit?.document?.id || hit?.document?.sku || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });

  return {
    enabled: true,
    ids,
    found: Math.max(0, Number(data?.found || 0) || 0)
  };
}

module.exports = {
  resolveTypesenseConfig,
  searchProducts,
  upsertProductsIndex
};
