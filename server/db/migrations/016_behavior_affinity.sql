CREATE TABLE IF NOT EXISTS behavior_events (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  actor_key TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anon_id TEXT,
  product_id TEXT,
  category TEXT,
  price_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'brl',
  source TEXT NOT NULL DEFAULT 'storefront',
  query_text TEXT NOT NULL DEFAULT '',
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  fbp TEXT,
  fbc TEXT,
  user_agent TEXT,
  ip_address TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS behavior_events_actor_idx
  ON behavior_events (actor_key, occurred_at DESC);

CREATE INDEX IF NOT EXISTS behavior_events_name_idx
  ON behavior_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS behavior_events_product_idx
  ON behavior_events (product_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS user_affinity (
  id BIGSERIAL PRIMARY KEY,
  actor_key TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anon_id TEXT,
  affinity_key TEXT NOT NULL,
  score NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(actor_key, affinity_key)
);

CREATE INDEX IF NOT EXISTS user_affinity_actor_score_idx
  ON user_affinity (actor_key, score DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS recommendation_profiles (
  actor_key TEXT PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anon_id TEXT,
  ltv_cents INTEGER NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  avg_ticket_cents INTEGER NOT NULL DEFAULT 0,
  top_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  favorite_price_bucket TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

