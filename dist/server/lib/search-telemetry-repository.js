"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { query } = require("./db");
let ensureSearchEventsTablePromise = null;
async function ensureSearchEventsTable() {
    if (!ensureSearchEventsTablePromise) {
        ensureSearchEventsTablePromise = query(`
      CREATE TABLE IF NOT EXISTS product_search_events (
        id BIGSERIAL PRIMARY KEY,
        event_type TEXT NOT NULL,
        query_text TEXT NOT NULL DEFAULT '',
        suggestion_text TEXT NOT NULL DEFAULT '',
        product_sku TEXT NOT NULL DEFAULT '',
        position_index INTEGER,
        results_count INTEGER,
        page_path TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT 'storefront_search',
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS product_search_events_created_idx
        ON product_search_events (created_at DESC);
      CREATE INDEX IF NOT EXISTS product_search_events_type_idx
        ON product_search_events (event_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS product_search_events_query_idx
        ON product_search_events (query_text);
      `)
            .then(() => undefined)
            .catch(() => undefined)
            .finally(() => {
            ensureSearchEventsTablePromise = null;
        });
    }
    await ensureSearchEventsTablePromise;
}
async function logProductSearchEvent(payload) {
    await ensureSearchEventsTable();
    const safeType = String(payload.type || "").trim();
    if (!safeType)
        return;
    await query(`
    INSERT INTO product_search_events (
      event_type,
      query_text,
      suggestion_text,
      product_sku,
      position_index,
      results_count,
      page_path,
      source,
      ip_address,
      user_agent
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
    )
    `, [
        safeType,
        String(payload.query || "").trim().slice(0, 160),
        String(payload.suggestion || "").trim().slice(0, 160),
        String(payload.productSku || "").trim().slice(0, 80),
        Number.isFinite(Number(payload.position)) ? Math.max(0, Math.floor(Number(payload.position))) : null,
        Number.isFinite(Number(payload.resultsCount)) ? Math.max(0, Math.floor(Number(payload.resultsCount))) : null,
        String(payload.pagePath || "").trim().slice(0, 240),
        String(payload.source || "storefront_search").trim().slice(0, 80),
        String(payload.ipAddress || "").trim().slice(0, 120) || null,
        String(payload.userAgent || "").trim().slice(0, 320) || null
    ]);
}
module.exports = {
    logProductSearchEvent
};
//# sourceMappingURL=search-telemetry-repository.js.map