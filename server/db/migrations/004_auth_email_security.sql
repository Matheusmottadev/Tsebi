ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

UPDATE users
SET email_verified = TRUE,
    email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_verified = FALSE;

CREATE TABLE IF NOT EXISTS auth_email_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (purpose IN ('account_verify', 'login_verify', 'password_reset'))
);

CREATE INDEX IF NOT EXISTS auth_email_codes_lookup_idx
  ON auth_email_codes (email, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_email_codes_user_idx
  ON auth_email_codes (user_id, purpose, created_at DESC);
