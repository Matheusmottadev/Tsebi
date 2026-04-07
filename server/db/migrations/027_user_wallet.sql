-- Migration 027: User wallet + gift card usage limits

-- Wallet balance per user
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_cents INTEGER NOT NULL DEFAULT 0;

-- Usage control on gift cards
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS max_uses  INTEGER NOT NULL DEFAULT 1;
ALTER TABLE gift_cards ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0;

-- Wallet transactions log
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta_cents INTEGER     NOT NULL,
  balance_after_cents INTEGER NOT NULL,
  reason      TEXT        NOT NULL DEFAULT 'gift_card_redemption',
  ref_id      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_txn_user_idx ON wallet_transactions (user_id, created_at DESC);
