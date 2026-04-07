-- Migration 026: Gift Card system

CREATE TABLE IF NOT EXISTS gift_cards (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT        NOT NULL UNIQUE,
  initial_balance_cents INTEGER    NOT NULL CHECK (initial_balance_cents > 0),
  balance_cents        INTEGER     NOT NULL CHECK (balance_cents >= 0),
  currency             TEXT        NOT NULL DEFAULT 'brl',
  active               BOOLEAN     NOT NULL DEFAULT TRUE,
  expires_at           TIMESTAMPTZ,
  note                 TEXT        NOT NULL DEFAULT '',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gift_cards_code_upper_idx ON gift_cards (upper(code));
CREATE INDEX IF NOT EXISTS gift_cards_active_idx ON gift_cards (active, expires_at);

CREATE TABLE IF NOT EXISTS user_gift_cards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gift_card_id UUID        NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  linked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, gift_card_id),
  UNIQUE (gift_card_id)
);

CREATE INDEX IF NOT EXISTS user_gift_cards_user_idx ON user_gift_cards (user_id);

CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_card_id        UUID        NOT NULL REFERENCES gift_cards(id) ON DELETE CASCADE,
  order_id            UUID        REFERENCES orders(id) ON DELETE SET NULL,
  user_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
  delta_cents         INTEGER     NOT NULL,
  balance_after_cents INTEGER     NOT NULL,
  reason              TEXT        NOT NULL DEFAULT 'purchase',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gc_txn_gift_card_idx ON gift_card_transactions (gift_card_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gc_txn_order_idx ON gift_card_transactions (order_id);
