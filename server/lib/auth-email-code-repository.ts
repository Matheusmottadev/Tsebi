export {};
const crypto = require("node:crypto");
const { withTransaction } = require("./db");

type AuthPurpose = "account_verify" | "login_verify" | "password_reset";
type JsonRecord = Record<string, unknown>;
type DbResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<DbResult<TRow>>;
};

const PURPOSES = new Set<AuthPurpose>(["account_verify", "login_verify", "password_reset"]);

function normalizeEmail(email: unknown): string {
  return String(email || "").trim().toLowerCase();
}

function normalizePurpose(purpose: unknown): AuthPurpose | "" {
  const safe = String(purpose || "").trim().toLowerCase();
  return PURPOSES.has(safe as AuthPurpose) ? (safe as AuthPurpose) : "";
}

function normalizeCode(code: unknown): string {
  return String(code || "").replace(/\D/g, "").slice(0, 6);
}

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(String(code || "")).digest("hex");
}

function generateCode(): string {
  const number = crypto.randomInt(0, 1_000_000);
  return String(number).padStart(6, "0");
}

function getCodeTtlMinutes(purpose: AuthPurpose): number {
  if (purpose === "password_reset") return 15;
  if (purpose === "login_verify") return 20;
  return 20;
}

async function issueAuthEmailCode({
  userId,
  email,
  purpose
}: {
  userId?: string | null;
  email?: string;
  purpose?: string;
}): Promise<{ ok: true; code: string; purpose: AuthPurpose; expiresAt: string | null } | { ok: false; error: string }> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  if (!normalizedEmail || !normalizedPurpose) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const ttlMinutes = getCodeTtlMinutes(normalizedPurpose);

  const created = await withTransaction(async (client: DbClient) => {
    const result = await client.query(
      `
      INSERT INTO auth_email_codes (user_id, email, purpose, code_hash, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + ($5::int * INTERVAL '1 minute'))
      RETURNING id, expires_at
      `,
      [userId || null, normalizedEmail, normalizedPurpose, codeHash, ttlMinutes]
    );

    return (result.rows[0] || null) as { expires_at?: string } | null;
  });

  return {
    ok: true,
    code,
    purpose: normalizedPurpose,
    expiresAt: created?.expires_at || null
  };
}

async function consumeAuthEmailCode({
  email,
  purpose,
  code
}: {
  email?: string;
  purpose?: string;
  code?: string;
}): Promise<
  | { ok: false; error: string }
  | { ok: true; userId: string | null; email: string; purpose: AuthPurpose | ""; expiresAt: string | null }
> {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPurpose = normalizePurpose(purpose);
  const normalizedCode = normalizeCode(code);

  if (!normalizedEmail || !normalizedPurpose || normalizedCode.length !== 6) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  return withTransaction(async (client: DbClient) => {
    const result = await client.query(
      `
      SELECT *
      FROM auth_email_codes
      WHERE email = $1
        AND purpose = $2
        AND code_hash = $3
        AND consumed_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [normalizedEmail, normalizedPurpose, hashCode(normalizedCode)]
    );

    if (result.rowCount === 0) {
      return { ok: false, error: "INVALID_OR_EXPIRED_CODE" };
    }

    const row = (result.rows[0] || {}) as {
      id?: string;
      user_id?: string | null;
      email?: string;
      purpose?: AuthPurpose;
      expires_at?: string | null;
    };

    await client.query(
      `
      UPDATE auth_email_codes
      SET consumed_at = NOW()
      WHERE id = $1
      `,
      [row.id]
    );

    return {
      ok: true,
      userId: row.user_id || null,
      email: normalizeEmail(row.email),
      purpose: row.purpose,
      expiresAt: row.expires_at
    };
  });
}

module.exports = {
  normalizeEmail,
  normalizePurpose,
  normalizeCode,
  issueAuthEmailCode,
  consumeAuthEmailCode
};

