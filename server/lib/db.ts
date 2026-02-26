export {};
type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type PoolClientLike = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  release: () => void;
};
type PoolLike = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  connect: () => Promise<PoolClientLike>;
};

const { Pool } = require("pg") as {
  Pool: new (config: { connectionString: string; ssl: false | { rejectUnauthorized: boolean } }) => PoolLike;
};

let pool: PoolLike | null = null;

function getDatabaseUrl(): string {
  return String(process.env.DATABASE_URL || "").trim();
}

function getPool(): PoolLike {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Configure PostgreSQL before starting the server.");
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

async function query<TRow extends JsonRecord = JsonRecord>(text: string, params: unknown[] = []): Promise<QueryResult<TRow>> {
  const client = getPool();
  return client.query<TRow>(text, params);
}

async function withTransaction<T>(work: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPool,
  getDatabaseUrl,
  query,
  withTransaction
};

