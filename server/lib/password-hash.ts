export {};

const argon2 = require("argon2") as {
  argon2id: number;
  hash: (password: string, options?: Record<string, unknown>) => Promise<string>;
  verify: (digest: string, password: string) => Promise<boolean>;
  needsRehash: (digest: string, options?: Record<string, unknown>) => boolean;
};
const bcrypt = require("bcrypt") as {
  compare: (raw: string, hash: string) => Promise<boolean>;
};

function getPasswordPepper(): string {
  const value = String(process.env.PASSWORD_PEPPER || "").trim();
  if (!value) {
    throw new Error("PASSWORD_PEPPER nao definido nas variaveis de ambiente.");
  }
  return value;
}

function applyPepper(rawPassword: string): string {
  return `${String(rawPassword || "")}${getPasswordPepper()}`;
}

function parsePositiveIntEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const normalized = Math.trunc(raw);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

const argon2HashConfig = {
  type: argon2.argon2id,
  memoryCost: parsePositiveIntEnv("PASSWORD_ARGON2_MEMORY_COST", 32768, 8 * 1024, 1024 * 1024),
  timeCost: parsePositiveIntEnv("PASSWORD_ARGON2_TIME_COST", 3, 1, 10),
  parallelism: parsePositiveIntEnv("PASSWORD_ARGON2_PARALLELISM", 1, 1, 16),
  hashLength: parsePositiveIntEnv("PASSWORD_ARGON2_HASH_LENGTH", 32, 16, 128),
  saltLength: parsePositiveIntEnv("PASSWORD_ARGON2_SALT_LENGTH", 16, 16, 64)
};

function isArgon2Hash(hash: string): boolean {
  return String(hash || "").trim().startsWith("$argon2");
}

function isBcryptHash(hash: string): boolean {
  return /^\$2[abxy]\$\d{2}\$/.test(String(hash || "").trim());
}

async function hashPassword(rawPassword: string): Promise<string> {
  return argon2.hash(applyPepper(rawPassword), argon2HashConfig);
}

type VerifyPasswordResult = { ok: boolean; valid: boolean; needsRehash: boolean };

function result(valid: boolean, needsRehash: boolean): VerifyPasswordResult {
  return { ok: valid, valid, needsRehash };
}

async function verifyPassword(rawPassword: string, storedHash: string): Promise<VerifyPasswordResult> {
  const safeHash = String(storedHash || "").trim();
  if (!safeHash) return result(false, false);
  const pepperedPassword = applyPepper(rawPassword);

  if (isArgon2Hash(safeHash)) {
    try {
      const pepperedOk = await argon2.verify(safeHash, pepperedPassword);
      if (pepperedOk) {
        const needsRehash = Boolean(argon2.needsRehash(safeHash, argon2HashConfig));
        return result(true, needsRehash);
      }

      // Legacy migration path: argon2 hash gerado sem pepper.
      const legacyOk = await argon2.verify(safeHash, String(rawPassword || ""));
      if (legacyOk) return result(true, true);
      return result(false, false);
    } catch {
      return result(false, false);
    }
  }

  if (isBcryptHash(safeHash)) {
    try {
      const ok = await bcrypt.compare(String(rawPassword || ""), safeHash);
      return result(ok, ok);
    } catch {
      return result(false, false);
    }
  }

  return result(false, false);
}

module.exports = {
  argon2HashConfig,
  hashPassword,
  verifyPassword
};
