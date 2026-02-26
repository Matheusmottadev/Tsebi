export {};
const { Pool } = require("pg") as typeof import("pg");

let pool: any = null;
let schemaReadyPromise: Promise<void> | null = null;

function getVipDatabaseUrl() {
  return String(process.env.VIP_DATABASE_URL || "").trim();
}

function getVipPool(): any {
  if (pool) return pool;

  const connectionString = getVipDatabaseUrl();
  if (!connectionString) {
    throw new Error("VIP_DATABASE_URL is required. Configure VIP PostgreSQL before using VIP endpoints.");
  }

  pool = new Pool({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
  });

  return pool;
}

async function ensureVipSchema(): Promise<void> {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const client = getVipPool();
      await client.query(`
        CREATE TABLE IF NOT EXISTS vip_subscribers (
          id BIGSERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          birth_date DATE,
          cpf VARCHAR(11),
          cep VARCHAR(8),
          source TEXT NOT NULL DEFAULT 'launch_page',
          account_created BOOLEAN NOT NULL DEFAULT FALSE,
          account_created_at TIMESTAMPTZ,
          ip_address TEXT,
          user_agent TEXT,
          subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise as Promise<void>;
}

async function queryVip(text: string, params: unknown[] = []) {
  await ensureVipSchema();
  const client = getVipPool();
  return client.query(text, params);
}

module.exports = {
  getVipDatabaseUrl,
  getVipPool,
  ensureVipSchema,
  queryVip
};
