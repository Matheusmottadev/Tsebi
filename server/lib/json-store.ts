export {};
const fs = require("node:fs/promises");
const path = require("node:path");

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed as T;
  } catch (error: unknown) {
    if ((error as { code?: unknown })?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

module.exports = {
  readJson,
  writeJson
};

