-- Migration 025: Rastreamento de notificações automáticas e carrinho
-- Evita spam e permite rastrear quem recebeu cada tipo de notificação automática

-- Log de notificações automáticas por usuário (para cooldown anti-spam)
CREATE TABLE IF NOT EXISTS auto_notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,  -- 'abandoned_cart' | 'low_stock_wishlist'
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_notif_log_user_trigger
  ON auto_notification_log (user_id, trigger_type, sent_at);

CREATE INDEX IF NOT EXISTS idx_auto_notif_log_trigger_sent
  ON auto_notification_log (trigger_type, sent_at);

-- Sessões de carrinho (para rastrear abandono com mais precisão no futuro)
-- Preenchido quando o app/web salva o estado do carrinho
CREATE TABLE IF NOT EXISTS cart_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  items JSONB NOT NULL DEFAULT '[]',
  item_count INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_sessions_user_id ON cart_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_sessions_updated_at ON cart_sessions (updated_at);
