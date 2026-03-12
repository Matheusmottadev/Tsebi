import "dotenv/config";

const { query } = require("../server/lib/db") as {
  query: <TRow extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
  ) => Promise<{ rows: TRow[]; rowCount: number }>;
};
const {
  isEncryptedString,
  encryptSensitiveString,
  decryptSensitiveString,
  protectJsonForStorage,
  unprotectJsonFromStorage
} = require("../server/lib/data-protection") as {
  isEncryptedString: (value: unknown) => boolean;
  encryptSensitiveString: (value: unknown) => string;
  decryptSensitiveString: (value: unknown) => string;
  protectJsonForStorage: (value: unknown) => unknown;
  unprotectJsonFromStorage: <T>(value: unknown, fallback: T) => T;
};

function parseArg(name: string, fallback = ""): string {
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!raw) return fallback;
  return raw.slice(name.length + 3);
}

function normalizePhone(value: unknown): string {
  return String(value || "").trim().slice(0, 40);
}

function normalizeCpf(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function normalizeCep(value: unknown): string {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function protectNullableText(value: unknown, normalize: (value: unknown) => string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const plain = normalize(decryptSensitiveString(raw));
  if (!plain) return null;

  // Keep existing ciphertext when it already decrypts to the expected value.
  // This makes backfill idempotent and avoids churn on every run.
  if (isEncryptedString(raw)) {
    return raw;
  }

  return plain ? encryptSensitiveString(plain) : null;
}

function asComparableJson(value: unknown): string {
  try {
    return JSON.stringify(value == null ? null : value);
  } catch {
    return "null";
  }
}

async function backfillUsers(dryRun: boolean, limit: number): Promise<{ scanned: number; updated: number }> {
  const result = await query<{
    id?: string;
    phone?: string | null;
    cpf?: string | null;
    cep?: string | null;
    addresses?: unknown;
  }>(
    `
    SELECT id, phone, cpf, cep, addresses
    FROM users
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );

  let updated = 0;
  for (const row of result.rows) {
    const userId = String(row.id || "").trim();
    if (!userId) continue;

    const nextPhone = protectNullableText(row.phone, normalizePhone);
    const nextCpf = protectNullableText(row.cpf, normalizeCpf);
    const nextCep = protectNullableText(row.cep, normalizeCep);

    const addressesRaw = unprotectJsonFromStorage<unknown>(row.addresses, row.addresses ?? []);
    const normalizedAddresses = Array.isArray(addressesRaw) ? addressesRaw : addressesRaw ?? [];
    const nextAddresses = protectJsonForStorage(normalizedAddresses);

    const changed =
      String(row.phone || "") !== String(nextPhone || "") ||
      String(row.cpf || "") !== String(nextCpf || "") ||
      String(row.cep || "") !== String(nextCep || "") ||
      asComparableJson(row.addresses) !== asComparableJson(nextAddresses);

    if (!changed) continue;
    updated += 1;

    if (dryRun) continue;
    await query(
      `
      UPDATE users
      SET
        phone = $2,
        cpf = $3,
        cep = $4,
        addresses = $5::jsonb,
        updated_at = NOW()
      WHERE id = $1::uuid
      `,
      [userId, nextPhone, nextCpf, nextCep, JSON.stringify(nextAddresses)]
    );
  }

  return {
    scanned: result.rows.length,
    updated
  };
}

async function backfillOrders(dryRun: boolean, limit: number): Promise<{ scanned: number; updated: number }> {
  const result = await query<{
    id?: string;
    shipping_json?: unknown;
  }>(
    `
    SELECT id, shipping_json
    FROM orders
    ORDER BY created_at ASC
    LIMIT $1
    `,
    [limit]
  );

  let updated = 0;
  for (const row of result.rows) {
    const orderId = String(row.id || "").trim();
    if (!orderId) continue;

    const shippingRaw = unprotectJsonFromStorage<unknown>(row.shipping_json, row.shipping_json ?? null);
    const nextShipping = shippingRaw == null ? null : protectJsonForStorage(shippingRaw);

    const changed = asComparableJson(row.shipping_json) !== asComparableJson(nextShipping);
    if (!changed) continue;
    updated += 1;

    if (dryRun) continue;
    await query(
      `
      UPDATE orders
      SET
        shipping_json = $2::jsonb,
        updated_at = NOW()
      WHERE id = $1::uuid
      `,
      [orderId, JSON.stringify(nextShipping)]
    );
  }

  return {
    scanned: result.rows.length,
    updated
  };
}

async function main() {
  const dryRun = parseArg("dry-run", "1") !== "0";
  const limit = Math.max(1, Number.parseInt(parseArg("limit", "5000"), 10) || 5000);

  const probe = encryptSensitiveString("probe");
  if (probe === "probe") {
    throw new Error("DATA_ENCRYPTION_KEY is required to run this backfill.");
  }

  const users = await backfillUsers(dryRun, limit);
  const orders = await backfillOrders(dryRun, limit);

  // eslint-disable-next-line no-console
  console.log(
    `[backfill-sensitive] dry-run=${dryRun ? "1" : "0"} users=${users.updated}/${users.scanned} orders=${orders.updated}/${orders.scanned}`
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[backfill-sensitive] failed:", error?.message || error);
  process.exit(1);
});
