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
