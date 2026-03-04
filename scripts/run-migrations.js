const fs = require("node:fs/promises");
const path = require("node:path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Configure PostgreSQL before running migrations.");
  }

  return new Pool({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

async function runMigrations() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.resolve(__dirname, "..", "server", "db", "migrations");
    const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
      .map((entry) => entry.name)
      .sort();

    for (const file of files) {
      const version = file;
      const exists = await client.query("SELECT 1 FROM schema_migrations WHERE version = $1", [version]);
      if (exists.rowCount > 0) continue;

      const sqlPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(sqlPath, "utf8");

      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES($1)", [version]);
      await client.query("COMMIT");
      // eslint-disable-next-line no-console
      console.log(`Applied migration ${version}`);
    }

    // eslint-disable-next-line no-console
    console.log("Migrations finished.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    // eslint-disable-next-line no-console
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
