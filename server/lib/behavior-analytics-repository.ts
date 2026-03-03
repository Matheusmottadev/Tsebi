export {};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };

const crypto = require("node:crypto");
const { query, withTransaction } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  withTransaction: <T>(work: (client: any) => Promise<T>) => Promise<T>;
};
const { PostHog } = require("posthog-node");

type BehaviorEventName =
  | "view_item"
  | "view_item_list"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "favorite_toggle"
  | "view_recommendations"
  | "click_recommendation";

type BehaviorEventInput = {
  eventName: BehaviorEventName | string;
  eventId?: string;
  userId?: string;
  anonId?: string;
  productId?: string;
  category?: string;
  price?: number;
  currency?: string;
  source?: string;
  query?: string;
  attributes?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  ipAddress?: string;
  occurredAt?: string;
};

type RecommendationOutput = {
  product_id: string;
  name: string;
  price: number;
  image_url: string;
  category: string;
  link: string;
};

const EVENT_WEIGHTS: Record<string, number> = {
  purchase: 10,
  begin_checkout: 8,
  add_to_cart: 5,
  search: 3,
  favorite_toggle: 4,
  click_recommendation: 3,
  view_item: 1,
  view_item_list: 0.8,
  view_recommendations: 0.6,
  remove_from_cart: -1.5,
};

const META_EVENT_MAP: Record<string, string> = {
  view_item: "ViewContent",
  search: "Search",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
};

const posthogHost = String(process.env.POSTHOG_HOST || "https://us.i.posthog.com").trim();
const posthogApiKey = String(process.env.POSTHOG_API_KEY || process.env.POSTHOG_PUBLIC_KEY || "").trim();
const metaPixelId = String(process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();
const metaCapiToken = String(process.env.META_CAPI_TOKEN || "").trim();
const appBaseUrl = String(process.env.APP_BASE_URL || "https://www.tsebi.com.br").trim().replace(/\/+$/, "");

const posthogClient =
  posthogApiKey
    ? new PostHog(posthogApiKey, {
        host: posthogHost,
        flushAt: 1,
        flushInterval: 0,
      })
    : null;

function normalizeText(value: any): string {
  return String(value || "").trim();
}

function foldText(value: any): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function resolveActorKey(userId: any, anonId: any): string {
  const safeUser = normalizeText(userId);
  if (safeUser) return `u:${safeUser}`;
  const safeAnon = normalizeText(anonId);
  if (safeAnon) return `a:${safeAnon}`;
  return `a:${crypto.randomUUID()}`;
}

function sanitizeToken(value: string): string {
  return foldText(value).replace(/[^a-z0-9_-]/g, "");
}

function splitSearchTokens(value: any): string[] {
  return foldText(value)
    .split(/[\s,.;:!?/\\|()[\]{}"']+/)
    .map((token) => sanitizeToken(token))
    .filter((token) => token.length >= 3)
    .slice(0, 8);
}

function priceBucketFromCents(value: any): "<500" | "500-1000" | "1000+" | "" {
  const cents = Number(value || 0);
  if (!Number.isFinite(cents) || cents <= 0) return "";
  if (cents < 50000) return "<500";
  if (cents <= 100000) return "500-1000";
  return "1000+";
}

function normalizeCurrency(value: any): string {
  const safe = foldText(value);
  return safe || "brl";
}

function toMetaCustomData(input: BehaviorEventInput) {
  const value = Math.max(0, Number(input.price || 0) / 100);
  return {
    currency: normalizeCurrency(input.currency),
    value,
    content_type: "product",
    content_ids: input.productId ? [String(input.productId)] : [],
    content_category: normalizeText(input.category),
  };
}

function safeJson(input: any): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

async function sendToPosthogServer(input: BehaviorEventInput, actorKey: string, eventId: string) {
  if (!posthogClient) return;
  const distinctId = normalizeText(input.userId) || normalizeText(input.anonId) || actorKey;
  await posthogClient.capture({
    distinctId,
    event: normalizeText(input.eventName),
    properties: {
      event_id: eventId,
      actor_key: actorKey,
      product_id: normalizeText(input.productId),
      category: normalizeText(input.category),
      price: Number(input.price || 0),
      currency: normalizeCurrency(input.currency),
      source: normalizeText(input.source),
      query: normalizeText(input.query),
      ...safeJson(input.attributes),
    },
    timestamp: input.occurredAt ? new Date(input.occurredAt) : new Date(),
  });
  await posthogClient.flush();
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(String(value || "").trim().toLowerCase()).digest("hex");
}

async function sendMetaConversionsEvent(input: BehaviorEventInput, eventId: string) {
  const normalizedName = normalizeText(input.eventName);
  const mapped = META_EVENT_MAP[normalizedName];
  if (!mapped || !metaPixelId || !metaCapiToken) return;

  const payload = {
    data: [
      {
        event_name: mapped,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: appBaseUrl,
        user_data: {
          client_user_agent: normalizeText(input.userAgent) || undefined,
          client_ip_address: normalizeText(input.ipAddress) || undefined,
          fbp: normalizeText(input.fbp) || undefined,
          fbc: normalizeText(input.fbc) || undefined,
          external_id: normalizeText(input.userId || input.anonId) ? sha256(normalizeText(input.userId || input.anonId)) : undefined,
          em: normalizeText((input.meta || {}).email || "") ? [sha256(normalizeText((input.meta || {}).email || ""))] : undefined,
        },
        custom_data: toMetaCustomData(input),
      },
    ],
  };

  await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(metaPixelId)}/events?access_token=${encodeURIComponent(metaCapiToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

async function upsertAffinity(
  client: any,
  actorKey: string,
  userId: string,
  anonId: string,
  affinityKey: string,
  delta: number
) {
  if (!affinityKey || !Number.isFinite(delta) || delta === 0) return;
  await client.query(
    `
    INSERT INTO user_affinity (actor_key, user_id, anon_id, affinity_key, score, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (actor_key, affinity_key)
    DO UPDATE SET
      score = user_affinity.score + EXCLUDED.score,
      user_id = COALESCE(EXCLUDED.user_id, user_affinity.user_id),
      anon_id = COALESCE(EXCLUDED.anon_id, user_affinity.anon_id),
      updated_at = NOW()
    `,
    [actorKey, userId || null, anonId || null, affinityKey, delta]
  );
}

async function upsertProfileOnEvent(
  client: any,
  actorKey: string,
  userId: string,
  anonId: string,
  eventName: string,
  category: string,
  priceCents: number
) {
  const existing = await client.query(
    `SELECT top_categories, ltv_cents, purchase_count, avg_ticket_cents FROM recommendation_profiles WHERE actor_key = $1 LIMIT 1`,
    [actorKey]
  );
  const row = existing.rows[0] || {};
  const counters = row.top_categories && typeof row.top_categories === "object" ? { ...(row.top_categories as Record<string, number>) } : {};
  if (category) {
    counters[category] = Math.max(0, Number(counters[category] || 0) + 1);
  }
  const bucket = priceBucketFromCents(priceCents);

  let nextLtv = Math.max(0, Number(row.ltv_cents || 0));
  let nextPurchaseCount = Math.max(0, Number(row.purchase_count || 0));
  let nextAvgTicket = Math.max(0, Number(row.avg_ticket_cents || 0));

  if (eventName === "purchase" && priceCents > 0) {
    nextLtv += priceCents;
    nextPurchaseCount += 1;
    nextAvgTicket = Math.floor(nextLtv / nextPurchaseCount);
  }

  await client.query(
    `
    INSERT INTO recommendation_profiles (
      actor_key, user_id, anon_id, ltv_cents, purchase_count, avg_ticket_cents, top_categories, favorite_price_bucket, last_seen_at, updated_at
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7::jsonb,$8,NOW(),NOW()
    )
    ON CONFLICT (actor_key)
    DO UPDATE SET
      user_id = COALESCE(EXCLUDED.user_id, recommendation_profiles.user_id),
      anon_id = COALESCE(EXCLUDED.anon_id, recommendation_profiles.anon_id),
      ltv_cents = EXCLUDED.ltv_cents,
      purchase_count = EXCLUDED.purchase_count,
      avg_ticket_cents = EXCLUDED.avg_ticket_cents,
      top_categories = EXCLUDED.top_categories,
      favorite_price_bucket = CASE WHEN EXCLUDED.favorite_price_bucket <> '' THEN EXCLUDED.favorite_price_bucket ELSE recommendation_profiles.favorite_price_bucket END,
      last_seen_at = NOW(),
      updated_at = NOW()
    `,
    [
      actorKey,
      userId || null,
      anonId || null,
      nextLtv,
      nextPurchaseCount,
      nextAvgTicket,
      JSON.stringify(counters),
      bucket || "",
    ]
  );
}

async function logBehaviorEvent(input: BehaviorEventInput) {
  const eventName = foldText(input.eventName);
  if (!eventName) return { ok: false, reason: "INVALID_EVENT" };

  const safeUserId = normalizeText(input.userId);
  const safeAnonId = normalizeText(input.anonId);
  const actorKey = resolveActorKey(safeUserId, safeAnonId);
  const eventId = normalizeText(input.eventId) || crypto.randomUUID();
  const safeProduct = normalizeText(input.productId);
  const safeCategory = normalizeText(input.category);
  const priceCents = Math.max(0, Math.floor(Number(input.price || 0)));
  const safeCurrency = normalizeCurrency(input.currency);
  const source = normalizeText(input.source) || "storefront";
  const queryText = normalizeText(input.query).slice(0, 180);
  const attributes = safeJson(input.attributes);
  const meta = safeJson(input.meta);

  await withTransaction(async (client: any) => {
    await client.query(
      `
      INSERT INTO behavior_events (
        event_id, event_name, actor_key, user_id, anon_id, product_id, category, price_cents, currency, source,
        query_text, attributes, meta, fbp, fbc, user_agent, ip_address, occurred_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,COALESCE($18::timestamptz, NOW())
      )
      ON CONFLICT (event_id) DO NOTHING
      `,
      [
        eventId,
        eventName,
        actorKey,
        safeUserId || null,
        safeAnonId || null,
        safeProduct || null,
        safeCategory || null,
        priceCents || null,
        safeCurrency,
        source,
        queryText,
        JSON.stringify(attributes),
        JSON.stringify(meta),
        normalizeText(input.fbp) || null,
        normalizeText(input.fbc) || null,
        normalizeText(input.userAgent) || null,
        normalizeText(input.ipAddress) || null,
        normalizeText(input.occurredAt) || null,
      ]
    );

    const baseWeight = Number(EVENT_WEIGHTS[eventName] || 0.5);
    const bucket = priceBucketFromCents(priceCents);
    const foldedCategory = sanitizeToken(safeCategory);
    const searchTokens = splitSearchTokens(queryText);
    const foldedProduct = sanitizeToken(safeProduct);
    const foldedMaterial = sanitizeToken(String(attributes.material || ""));
    const foldedColor = sanitizeToken(String(attributes.color || ""));

    if (foldedCategory) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `cat:${foldedCategory}`, baseWeight);
    }
    if (foldedProduct) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `prod:${foldedProduct}`, baseWeight * 0.9);
    }
    if (bucket) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `price:${bucket}`, baseWeight * 0.7);
    }
    if (foldedMaterial) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `attr:material:${foldedMaterial}`, baseWeight * 0.65);
    }
    if (foldedColor) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `attr:color:${foldedColor}`, baseWeight * 0.55);
    }
    for (const token of searchTokens) {
      await upsertAffinity(client, actorKey, safeUserId, safeAnonId, `search:${token}`, baseWeight * 0.6);
    }

    await upsertProfileOnEvent(client, actorKey, safeUserId, safeAnonId, eventName, foldedCategory, priceCents);
  });

  await Promise.allSettled([
    sendToPosthogServer(input, actorKey, eventId),
    sendMetaConversionsEvent(input, eventId),
  ]);

  return { ok: true, actorKey, eventId };
}

async function mergeAnonymousIdentity(input: { anonId: string; userId: string }) {
  const safeAnonId = normalizeText(input.anonId);
  const safeUserId = normalizeText(input.userId);
  if (!safeAnonId || !safeUserId) return { ok: false, reason: "INVALID_INPUT" };

  const anonActor = resolveActorKey("", safeAnonId);
  const userActor = resolveActorKey(safeUserId, "");

  await withTransaction(async (client: any) => {
    await client.query(
      `UPDATE behavior_events SET actor_key = $1, user_id = $2, anon_id = NULL WHERE actor_key = $3`,
      [userActor, safeUserId, anonActor]
    );

    await client.query(
      `
      INSERT INTO user_affinity (actor_key, user_id, anon_id, affinity_key, score, updated_at)
      SELECT $1, $2, NULL, affinity_key, SUM(score), NOW()
      FROM user_affinity
      WHERE actor_key IN ($1, $3)
      GROUP BY affinity_key
      ON CONFLICT (actor_key, affinity_key)
      DO UPDATE SET score = EXCLUDED.score, user_id = EXCLUDED.user_id, anon_id = NULL, updated_at = NOW()
      `,
      [userActor, safeUserId, anonActor]
    );

    await client.query(`DELETE FROM user_affinity WHERE actor_key = $1`, [anonActor]);

    const profileRows = await client.query(
      `SELECT actor_key, ltv_cents, purchase_count, avg_ticket_cents, top_categories, favorite_price_bucket FROM recommendation_profiles WHERE actor_key IN ($1, $2)`,
      [userActor, anonActor]
    );

    let mergedLtv = 0;
    let mergedPurchaseCount = 0;
    let mergedAvg = 0;
    let mergedBucket = "";
    const categories: Record<string, number> = {};
    for (const row of profileRows.rows) {
      mergedLtv += Math.max(0, Number(row.ltv_cents || 0));
      mergedPurchaseCount += Math.max(0, Number(row.purchase_count || 0));
      mergedAvg = Math.max(mergedAvg, Math.max(0, Number(row.avg_ticket_cents || 0)));
      if (!mergedBucket) mergedBucket = normalizeText(row.favorite_price_bucket);
      const counters = row.top_categories && typeof row.top_categories === "object" ? (row.top_categories as Record<string, number>) : {};
      Object.entries(counters).forEach(([key, value]) => {
        categories[key] = Math.max(0, Number(categories[key] || 0) + Number(value || 0));
      });
    }
    if (mergedPurchaseCount > 0) mergedAvg = Math.floor(mergedLtv / mergedPurchaseCount);

    await client.query(
      `
      INSERT INTO recommendation_profiles (
        actor_key, user_id, anon_id, ltv_cents, purchase_count, avg_ticket_cents, top_categories, favorite_price_bucket, last_seen_at, updated_at
      ) VALUES ($1,$2,NULL,$3,$4,$5,$6::jsonb,$7,NOW(),NOW())
      ON CONFLICT (actor_key)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        anon_id = NULL,
        ltv_cents = EXCLUDED.ltv_cents,
        purchase_count = EXCLUDED.purchase_count,
        avg_ticket_cents = EXCLUDED.avg_ticket_cents,
        top_categories = EXCLUDED.top_categories,
        favorite_price_bucket = EXCLUDED.favorite_price_bucket,
        last_seen_at = NOW(),
        updated_at = NOW()
      `,
      [userActor, safeUserId, mergedLtv, mergedPurchaseCount, mergedAvg, JSON.stringify(categories), mergedBucket]
    );

    await client.query(`DELETE FROM recommendation_profiles WHERE actor_key = $1`, [anonActor]);
  });

  if (posthogClient) {
    await Promise.allSettled([
      posthogClient.alias({ distinctId: safeUserId, alias: safeAnonId }),
      posthogClient.identify({ distinctId: safeUserId, properties: { merged_anon_id: safeAnonId } }),
    ]);
    await posthogClient.flush();
  }

  return { ok: true, actorKey: userActor };
}

function resolveProductPriceBandFromValue(priceValue: number, thresholds: { lowMax: number; midMax: number }) {
  if (!Number.isFinite(priceValue) || priceValue <= thresholds.lowMax) return "<500";
  if (priceValue <= thresholds.midMax) return "500-1000";
  return "1000+";
}

function resolveBandThresholds(products: any[]) {
  const prices = products
    .map((item) => Math.max(0, Number(item?.priceValue || 0)))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (!prices.length) return { lowMax: 500, midMax: 1000 };
  const low = prices[Math.max(0, Math.min(prices.length - 1, Math.floor(prices.length * 0.33)))] || 500;
  const mid = prices[Math.max(0, Math.min(prices.length - 1, Math.floor(prices.length * 0.66)))] || 1000;
  return { lowMax: Math.max(1, low), midMax: Math.max(low + 1, mid) };
}

async function getRecommendationsForActor(input: {
  products: any[];
  userId?: string;
  anonId?: string;
  placement?: string;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(12, Number(input.limit || 6)));
  const placement = normalizeText(input.placement) || "search";
  const actorKey = resolveActorKey(input.userId, input.anonId);
  const activeProducts = (input.products || []).filter((item) => item && item.active !== false);

  const [affinityRows, purchasedRows, profileRows] = await Promise.all([
    query<{ affinity_key: string; score: string }>(
      `SELECT affinity_key, score::text FROM user_affinity WHERE actor_key = $1 ORDER BY score DESC LIMIT 120`,
      [actorKey]
    ),
    query<{ product_id: string }>(
      `SELECT product_id FROM behavior_events WHERE actor_key = $1 AND event_name = 'purchase' AND product_id IS NOT NULL`,
      [actorKey]
    ),
    query<{ favorite_price_bucket: string }>(
      `SELECT favorite_price_bucket FROM recommendation_profiles WHERE actor_key = $1 LIMIT 1`,
      [actorKey]
    ),
  ]);

  const affinityMap = new Map<string, number>();
  affinityRows.rows.forEach((row) => affinityMap.set(String(row.affinity_key || ""), Number(row.score || 0)));
  const purchased = new Set(purchasedRows.rows.map((row) => normalizeText(row.product_id)).filter(Boolean));
  const favoriteBucket = normalizeText(profileRows.rows[0]?.favorite_price_bucket || "");

  const topProductKey = Array.from(affinityMap.entries())
    .filter(([key]) => key.startsWith("prod:"))
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const topProductSku = topProductKey.replace(/^prod:/, "");
  const topProduct = activeProducts.find((item) => sanitizeToken(item?.sku || item?.id) === topProductSku) || null;
  const thresholds = resolveBandThresholds(activeProducts);

  const ranked = activeProducts.map((product) => {
    const sku = normalizeText(product?.sku || product?.id);
    const cat = sanitizeToken(product?.category || "");
    const material = sanitizeToken(product?.material || "");
    const colors = Array.isArray(product?.colors) ? product.colors.map((entry: any) => sanitizeToken(entry)) : [];
    const searchable = foldText([product?.name, product?.category, product?.material, product?.collection].join(" "));
    const bucket = resolveProductPriceBandFromValue(Number(product?.priceValue || 0), thresholds);

    let score = 0;
    score += Number(affinityMap.get(`cat:${cat}`) || 0) * 5;
    score += Number(affinityMap.get(`prod:${sanitizeToken(sku)}`) || 0) * 2.5;
    score += Number(affinityMap.get(`price:${bucket}`) || 0) * 3;
    if (favoriteBucket && favoriteBucket === bucket) score += 2.5;
    if (material) score += Number(affinityMap.get(`attr:material:${material}`) || 0) * 1.8;
    for (const color of colors) {
      score += Number(affinityMap.get(`attr:color:${color}`) || 0) * 1.4;
    }
    for (const [key, value] of affinityMap.entries()) {
      if (!key.startsWith("search:")) continue;
      const token = key.replace(/^search:/, "");
      if (token && searchable.includes(token)) score += value * 2;
    }

    if (topProduct) {
      if (sanitizeToken(topProduct.category) === cat) score += 4;
      if (sanitizeToken(topProduct.material) === material && material) score += 2;
    }

    if (purchased.has(sku)) score -= 12;

    return { product, score };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (Number(b.product?.stock || 0) !== Number(a.product?.stock || 0)) {
      return Number(b.product?.stock || 0) - Number(a.product?.stock || 0);
    }
    return String(a.product?.name || "").localeCompare(String(b.product?.name || ""), "pt-BR");
  });

  const personalized = ranked.filter((entry) => entry.score > 0).slice(0, limit).map((entry) => entry.product);
  const selected =
    personalized.length > 0
      ? personalized
      : activeProducts
          .slice()
          .sort((a, b) => {
            if (Number(b?.stock || 0) !== Number(a?.stock || 0)) return Number(b?.stock || 0) - Number(a?.stock || 0);
            return new Date(b?.updatedAt || b?.createdAt || 0).getTime() - new Date(a?.updatedAt || a?.createdAt || 0).getTime();
          })
          .slice(0, limit);

  const items: RecommendationOutput[] = selected.map((item) => {
    const sku = normalizeText(item?.sku || item?.id);
    return {
      product_id: sku,
      name: String(item?.name || ""),
      price: Math.max(0, Number(item?.priceValue || 0)),
      image_url: String(item?.image || ""),
      category: String(item?.category || ""),
      link: `/product/${encodeURIComponent(sku)}`,
    };
  });

  return {
    actorKey,
    placement,
    source: personalized.length > 0 ? "personalized" : "best_sellers",
    title: personalized.length > 0 ? "Seleção personalizada" : "Recomendado para você",
    products: selected,
    items,
  };
}

module.exports = {
  logBehaviorEvent,
  mergeAnonymousIdentity,
  getRecommendationsForActor,
  priceBucketFromCents,
};

