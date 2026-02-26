export {};
const path = require("node:path");
const { readJson, writeJson } = require("./json-store") as {
  readJson: <T>(filePath: string, fallback: T) => Promise<T>;
  writeJson: (filePath: string, value: unknown) => Promise<void>;
};

type AccessCodeType = "percent" | "fixed";
type AccessCode = {
  code: string;
  type: AccessCodeType;
  percentOff: number;
  amountOffCents: number;
  minSubtotalCents: number;
  maxDiscountCents: number;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};
type AccessCodeUpsertResult = { ok: true; created: boolean; code: AccessCode } | { ok: false; error: string };
type AccessCodeDeleteResult = { ok: true; removed: AccessCode } | { ok: false; error: string };
type EvaluateAccessCodeResult =
  | { ok: true; entry: AccessCode; discountCents: number; subtotalCents: number; shippingCents: number; totalCents: number }
  | { ok: false; error: string };

const ACCESS_CODES_FILE = path.resolve(__dirname, "..", "..", "data", "access-codes.json");
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  writeQueue = writeQueue.then(task, task);
  return writeQueue as Promise<T>;
}

function normalizeCode(value: unknown): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function toSafeMoneyCents(value: unknown, max = 9_999_999): number {
  const n = Math.floor(Number(value || 0));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, n));
}

function normalizeType(value: unknown): AccessCodeType {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "fixed" ? "fixed" : "percent";
}

function sanitizeAccessCode(raw: Record<string, unknown>): AccessCode {
  const code = normalizeCode(raw?.code || "");
  const type = normalizeType(raw?.type || "percent");
  const percentOff = Math.max(0, Math.min(100, Math.floor(Number(raw?.percentOff || 0))));
  const amountOffCents = toSafeMoneyCents(raw?.amountOffCents || 0);
  const minSubtotalCents = toSafeMoneyCents(raw?.minSubtotalCents || 0);
  const maxDiscountCents = toSafeMoneyCents(raw?.maxDiscountCents || 0);
  const active = raw?.active !== false;
  const startsAt = String(raw?.startsAt || "").trim();
  const expiresAt = String(raw?.expiresAt || "").trim();
  const description = String(raw?.description || "").trim().slice(0, 180);
  const createdAt = String(raw?.createdAt || "").trim();
  const updatedAt = String(raw?.updatedAt || "").trim();

  return {
    code,
    type,
    percentOff: type === "percent" ? percentOff : 0,
    amountOffCents: type === "fixed" ? amountOffCents : 0,
    minSubtotalCents,
    maxDiscountCents,
    active,
    startsAt,
    expiresAt,
    description,
    createdAt,
    updatedAt
  };
}

function isNowBetween(start: string, end: string, nowIso: string): boolean {
  const now = new Date(nowIso);
  const startDate = start ? new Date(start) : null;
  const endDate = end ? new Date(end) : null;
  if (startDate && !Number.isNaN(startDate.getTime()) && now < startDate) return false;
  if (endDate && !Number.isNaN(endDate.getTime()) && now > endDate) return false;
  return true;
}

function computeDiscountCents(codeEntry: AccessCode, subtotalCents: number): number {
  const subtotal = toSafeMoneyCents(subtotalCents);
  const minSubtotal = toSafeMoneyCents(codeEntry?.minSubtotalCents || 0);
  if (subtotal <= 0) return 0;
  if (minSubtotal > 0 && subtotal < minSubtotal) return 0;

  let discount = 0;
  if (String(codeEntry?.type || "") === "fixed") {
    discount = toSafeMoneyCents(codeEntry?.amountOffCents || 0);
  } else {
    const percent = Math.max(0, Math.min(100, Number(codeEntry?.percentOff || 0)));
    discount = Math.floor((subtotal * percent) / 100);
  }

  const cap = toSafeMoneyCents(codeEntry?.maxDiscountCents || 0);
  if (cap > 0) discount = Math.min(discount, cap);
  return Math.max(0, Math.min(subtotal, discount));
}

async function readAllCodes(): Promise<AccessCode[]> {
  const raw = await readJson<unknown[]>(ACCESS_CODES_FILE, []);
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => sanitizeAccessCode((item && typeof item === "object" ? item : {}) as Record<string, unknown>))
    .filter((entry) => entry.code);
}

async function listAccessCodes({ query = "", page = 1, pageSize = 50 }: { query?: string; page?: number; pageSize?: number } = {}): Promise<{
  rows: AccessCode[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const text = String(query || "").trim().toLowerCase();
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(200, Number(pageSize || 50)));
  const all = await readAllCodes();
  const filtered = text
    ? all.filter((entry) => {
        const hay = [
          entry.code,
          entry.type,
          entry.description,
          entry.active ? "active" : "inactive"
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(text);
      })
    : all;

  const sorted = filtered.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const total = sorted.length;
  const offset = (safePage - 1) * safePageSize;
  const rows = sorted.slice(offset, offset + safePageSize);
  return { rows, total, page: safePage, pageSize: safePageSize };
}

async function upsertAccessCode(input: Record<string, unknown>): Promise<AccessCodeUpsertResult> {
  const nowIso = new Date().toISOString();
  const parsed = sanitizeAccessCode(input || {});
  if (!parsed.code) return { ok: false, error: "INVALID_CODE" };

  return enqueueWrite(async () => {
    const list = await readAllCodes();
    const idx = list.findIndex((entry) => entry.code === parsed.code);
    if (idx >= 0) {
      const previous = list[idx];
      const next = {
        ...previous,
        ...parsed,
        createdAt: previous.createdAt || nowIso,
        updatedAt: nowIso
      };
      list[idx] = next;
      await writeJson(ACCESS_CODES_FILE, list);
      return { ok: true, created: false, code: next };
    }

    const next = {
      ...parsed,
      createdAt: nowIso,
      updatedAt: nowIso
    };
    list.unshift(next);
    await writeJson(ACCESS_CODES_FILE, list);
    return { ok: true, created: true, code: next };
  });
}

async function deleteAccessCode(code: string): Promise<AccessCodeDeleteResult> {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, error: "INVALID_CODE" };
  return enqueueWrite(async () => {
    const list = await readAllCodes();
    const idx = list.findIndex((entry) => entry.code === normalized);
    if (idx < 0) return { ok: false, error: "NOT_FOUND" };
    const removed = list[idx];
    const next = list.filter((entry) => entry.code !== normalized);
    await writeJson(ACCESS_CODES_FILE, next);
    return { ok: true, removed };
  });
}

async function evaluateAccessCode({
  code,
  subtotalCents = 0,
  shippingCents = 0,
  nowIso = new Date().toISOString()
}: {
  code: string;
  subtotalCents?: number;
  shippingCents?: number;
  nowIso?: string;
}): Promise<EvaluateAccessCodeResult> {
  const normalized = normalizeCode(code);
  if (!normalized) return { ok: false, error: "INVALID_CODE" };

  const all = await readAllCodes();
  const entry = all.find((item) => item.code === normalized);
  if (!entry) return { ok: false, error: "CODE_NOT_FOUND" };
  if (!entry.active) return { ok: false, error: "CODE_INACTIVE" };
  if (!isNowBetween(entry.startsAt, entry.expiresAt, nowIso)) return { ok: false, error: "CODE_NOT_AVAILABLE_NOW" };

  const subtotal = toSafeMoneyCents(subtotalCents);
  const shipping = toSafeMoneyCents(shippingCents);
  const discountCents = computeDiscountCents(entry, subtotal);
  if (discountCents <= 0) return { ok: false, error: "CODE_NOT_APPLICABLE" };
  const totalCents = Math.max(0, subtotal + shipping - discountCents);

  return {
    ok: true,
    entry,
    discountCents,
    subtotalCents: subtotal,
    shippingCents: shipping,
    totalCents
  };
}

module.exports = {
  normalizeCode,
  listAccessCodes,
  upsertAccessCode,
  deleteAccessCode,
  evaluateAccessCode
};

