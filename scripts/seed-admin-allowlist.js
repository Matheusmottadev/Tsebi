const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const MODULES = ["balance", "orders", "users", "products"];
const ROLE_PRIORITY = {
  admin: 0,
  director: 1,
  superadmin: 2,
};

function getDatabaseUrl() {
  return String(process.env.DATABASE_URL || "").trim();
}

function getPool() {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required. Configure PostgreSQL before running the seed.");
  }

  return new Pool({
    connectionString,
    ssl:
      process.env.PGSSLMODE === "require" || process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function collectAdminEmails() {
  const raw = `${process.env.ADMIN_EMAIL || ""},${process.env.ADMIN_EMAILS || ""}`;
  const seen = new Set();
  const rows = [];
  for (const chunk of raw.split(",")) {
    const email = normalizeEmail(chunk);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    rows.push(email);
  }
  return rows;
}

function chooseHigherRole(currentRole, desiredRole) {
  const current = ROLE_PRIORITY[String(currentRole || "").trim().toLowerCase()] ?? ROLE_PRIORITY.admin;
  const desired = ROLE_PRIORITY[String(desiredRole || "").trim().toLowerCase()] ?? ROLE_PRIORITY.admin;
  return desired >= current ? desiredRole : currentRole;
}

async function seedAdminAllowlist() {
  const emails = collectAdminEmails();
  if (emails.length === 0) {
    console.log("No ADMIN_EMAIL / ADMIN_EMAILS entries found. Nothing to seed.");
    return;
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const [index, email] of emails.entries()) {
      const desiredRole = index === 0 ? "superadmin" : "admin";
      const userResult = await client.query(
        `SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`,
        [email]
      );
      const userId = userResult.rows[0]?.id || null;

      const existingResult = await client.query(
        `SELECT id, role FROM admins WHERE lower(email) = lower($1) LIMIT 1`,
        [email]
      );

      let adminId = existingResult.rows[0]?.id || null;
      const nextRole = chooseHigherRole(existingResult.rows[0]?.role || "admin", desiredRole);

      if (adminId) {
        const updated = await client.query(
          `
          UPDATE admins
          SET
            email = lower($2),
            role = $3,
            is_active = TRUE,
            user_id = COALESCE(admins.user_id, $4),
            updated_at = NOW()
          WHERE id = $1
          RETURNING id
          `,
          [adminId, email, nextRole, userId]
        );
        adminId = updated.rows[0]?.id || adminId;
      } else {
        const inserted = await client.query(
          `
          INSERT INTO admins (email, role, is_active, user_id)
          VALUES (lower($1), $2, TRUE, $3)
          RETURNING id
          `,
          [email, nextRole, userId]
        );
        adminId = inserted.rows[0]?.id || null;
      }

      if (!adminId || nextRole === "superadmin") continue;

      for (const moduleName of MODULES) {
        await client.query(
          `
          INSERT INTO admin_permissions (admin_id, module, granted_by)
          VALUES ($1, $2, $1)
          ON CONFLICT (admin_id, module) DO NOTHING
          `,
          [adminId, moduleName]
        );
      }
    }

    await client.query("COMMIT");
    console.log(`Seeded ${emails.length} admin email(s) into admins table.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAdminAllowlist().catch((error) => {
  console.error("Admin allowlist seed failed:", error.message);
  process.exitCode = 1;
});
