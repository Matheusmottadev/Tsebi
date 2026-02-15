const { Pool } = require("pg");

let pool = null;

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function getPool() {
  if (pool) return pool;

  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Configure PostgreSQL before starting the server.");
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false
  });

  return pool;
}

async function query(text, params = []) {
  const client = getPool();
  return client.query(text, params);
}

async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
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
