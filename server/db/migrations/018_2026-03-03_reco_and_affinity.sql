-- Ensure recommendation profile storage exists and affinity score supports decimals.

CREATE TABLE IF NOT EXISTS recommendation_profiles (
  actor_key TEXT PRIMARY KEY,
  user_id TEXT,
  anon_id TEXT,
  ltv_cents INTEGER NOT NULL DEFAULT 0,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  avg_ticket_cents INTEGER NOT NULL DEFAULT 0,
  top_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  favorite_price_bucket TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_affinity'
      AND column_name = 'score'
  ) THEN
    EXECUTE 'ALTER TABLE user_affinity ALTER COLUMN score TYPE NUMERIC(10,2) USING score::numeric';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS recommendation_profiles_updated_at_idx
  ON recommendation_profiles (updated_at DESC);

CREATE INDEX IF NOT EXISTS recommendation_profiles_user_id_idx
  ON recommendation_profiles (user_id);

CREATE INDEX IF NOT EXISTS recommendation_profiles_anon_id_idx
  ON recommendation_profiles (anon_id);

