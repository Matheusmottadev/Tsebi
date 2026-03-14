export {};

type JsonRecord = Record<string, unknown>;
type QueryResult<TRow extends JsonRecord> = { rows: TRow[]; rowCount: number };
type DbClient = {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
};

const { query, withTransaction } = require("./db") as {
  query: <TRow extends JsonRecord = JsonRecord>(text: string, params?: unknown[]) => Promise<QueryResult<TRow>>;
  withTransaction: <T>(work: (client: DbClient) => Promise<T>) => Promise<T>;
};

let repairSchemaPromise: Promise<void> | null = null;

type RepairPhotoRow = {
  url?: unknown;
  fileName?: unknown;
};

type RepairRequestRow = JsonRecord & {
  id: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  order_id?: string;
  order_ref?: string;
  order_item_id?: string;
  piece_name?: string;
  piece_image_url?: string;
  repair_type?: string;
  description?: string;
  return_address?: string;
  photos_json?: unknown;
  status?: string;
  rejection_reason?: string;
  admin_note?: string;
  reviewed_at?: string;
  reviewed_by_admin_id?: string;
  created_at?: string;
  updated_at?: string;
};

function createRepairError(code: string, status = 400, message = code) {
  const error = new Error(message) as Error & { code?: string; status?: number };
  error.code = code;
  error.status = status;
  return error;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeDate(value: unknown): string | null {
  const raw = normalizeText(value);
  return raw || null;
}

function normalizeRepairStatus(
  value: unknown
): "pending" | "awaiting_shipment" | "item_received" | "in_repair" | "completed" | "returned" | "rejected" {
  const raw = normalizeText(value).toLowerCase();
  if (["awaiting_shipment", "aguardando_envio", "aguardando envio", "accepted", "aceito", "aprovado"].includes(raw)) {
    return "awaiting_shipment";
  }
  if (["item_received", "peca_recebida", "peça recebida", "peca recebida", "recebido"].includes(raw)) {
    return "item_received";
  }
  if (["in_repair", "em_reparo", "em reparo"].includes(raw)) return "in_repair";
  if (["completed", "finalizado", "concluido", "concluído"].includes(raw)) return "completed";
  if (["returned", "devolvido"].includes(raw)) return "returned";
  if (["rejected", "rejeitado", "recusado"].includes(raw)) return "rejected";
  return "pending";
}

function normalizePhotoRow(entry: unknown): { url: string; fileName: string } | null {
  if (!entry || typeof entry !== "object") return null;
  const row = entry as RepairPhotoRow;
  const url = normalizeText(row.url);
  if (!url) return null;
  return {
    url,
    fileName: normalizeText(row.fileName),
  };
}

function normalizePhotoList(value: unknown): Array<{ url: string; fileName: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizePhotoRow(entry))
    .filter((entry): entry is { url: string; fileName: string } => Boolean(entry))
    .slice(0, 8);
}

function mapRepairRow(row: RepairRequestRow) {
  return {
    id: normalizeText(row.id),
    userId: normalizeText(row.user_id),
    userName: normalizeText(row.user_name),
    userEmail: normalizeText(row.user_email),
    orderId: normalizeText(row.order_id),
    orderRef: normalizeText(row.order_ref),
    orderItemId: normalizeText(row.order_item_id),
    pieceName: normalizeText(row.piece_name),
    pieceImageUrl: normalizeText(row.piece_image_url) || null,
    repairType: normalizeText(row.repair_type),
    description: normalizeText(row.description),
    returnAddress: normalizeText(row.return_address),
    photos: normalizePhotoList(row.photos_json),
    status: normalizeRepairStatus(row.status),
    rejectionReason: normalizeText(row.rejection_reason),
    adminNote: normalizeText(row.admin_note),
    reviewedAt: normalizeDate(row.reviewed_at),
    reviewedByAdminId: normalizeText(row.reviewed_by_admin_id) || null,
    createdAt: normalizeDate(row.created_at),
    updatedAt: normalizeDate(row.updated_at),
  };
}

async function ensureRepairTables(): Promise<void> {
  if (!repairSchemaPromise) {
    repairSchemaPromise = (async () => {
      await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await query(`
        CREATE TABLE IF NOT EXISTS repair_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          user_name TEXT NOT NULL DEFAULT '',
          user_email TEXT NOT NULL DEFAULT '',
          order_id TEXT NOT NULL DEFAULT '',
          order_ref TEXT NOT NULL DEFAULT '',
          order_item_id TEXT NOT NULL DEFAULT '',
          piece_name TEXT NOT NULL DEFAULT '',
          piece_image_url TEXT NOT NULL DEFAULT '',
          repair_type TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          return_address TEXT NOT NULL DEFAULT '',
          photos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          status TEXT NOT NULL DEFAULT 'pending',
          rejection_reason TEXT NOT NULL DEFAULT '',
          admin_note TEXT NOT NULL DEFAULT '',
          reviewed_at TIMESTAMPTZ NULL,
          reviewed_by_admin_id UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS repair_requests_user_id_idx
          ON repair_requests (user_id, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS repair_requests_status_idx
          ON repair_requests (status, created_at DESC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS repair_requests_order_id_idx
          ON repair_requests (order_id);
      `);
    })().catch((error: unknown) => {
      repairSchemaPromise = null;
      throw error;
    });
  }

  await repairSchemaPromise;
}

async function createRepairRequest(input: {
  userId: string;
  userName: string;
  userEmail: string;
  orderId: string;
  orderRef: string;
  orderItemId?: string;
  pieceName: string;
  pieceImageUrl?: string;
  repairType: string;
  description: string;
  returnAddress: string;
  photos?: Array<{ url: string; fileName?: string }>;
}) {
  await ensureRepairTables();

  const userId = normalizeText(input.userId);
  const userName = normalizeText(input.userName);
  const userEmail = normalizeText(input.userEmail).toLowerCase();
  const orderId = normalizeText(input.orderId);
  const orderRef = normalizeText(input.orderRef);
  const orderItemId = normalizeText(input.orderItemId);
  const pieceName = normalizeText(input.pieceName);
  const pieceImageUrl = normalizeText(input.pieceImageUrl);
  const repairType = normalizeText(input.repairType);
  const description = normalizeText(input.description);
  const returnAddress = normalizeText(input.returnAddress);
  const photos = normalizePhotoList(input.photos || []);

  if (!userId || !userEmail || !pieceName || !repairType || !description) {
    throw createRepairError("INVALID_INPUT", 400, "Dados inválidos para solicitação de reparo.");
  }

  const result = await query<RepairRequestRow>(
    `
    INSERT INTO repair_requests (
      user_id,
      user_name,
      user_email,
      order_id,
      order_ref,
      order_item_id,
      piece_name,
      piece_image_url,
      repair_type,
      description,
      return_address,
      photos_json,
      status,
      updated_at
    ) VALUES (
      $1::uuid,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10,
      $11,
      $12::jsonb,
      'pending',
      NOW()
    )
    RETURNING *
    `,
    [
      userId,
      userName,
      userEmail,
      orderId,
      orderRef,
      orderItemId,
      pieceName,
      pieceImageUrl,
      repairType,
      description,
      returnAddress,
      JSON.stringify(photos),
    ]
  );

  const row = result.rows[0];
  if (!row) throw createRepairError("REPAIR_CREATE_FAILED", 500, "Falha ao criar solicitação de reparo.");
  return mapRepairRow(row);
}

async function listMyRepairRequests(userId: string) {
  await ensureRepairTables();
  const safeUserId = normalizeText(userId);
  if (!safeUserId) return [];

  const result = await query<RepairRequestRow>(
    `
    SELECT *
    FROM repair_requests
    WHERE user_id = $1::uuid
    ORDER BY created_at DESC
    `,
    [safeUserId]
  );

  return result.rows.map((row) => mapRepairRow(row));
}

async function listAdminRepairRequests(input: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  await ensureRepairTables();
  const page = Math.max(1, Number(input.page || 1) || 1);
  const pageSize = Math.max(1, Math.min(200, Number(input.pageSize || 50) || 50));
  const offset = (page - 1) * pageSize;
  const queryText = normalizeText(input.query).toLowerCase();
  const statusFilter = normalizeRepairStatus(input.status);
  const hasStatusFilter = Boolean(normalizeText(input.status));

  const result = await query<RepairRequestRow>(
    `
    SELECT *
    FROM repair_requests
    ORDER BY created_at DESC, updated_at DESC
    `
  );

  const rows = result.rows
    .map((row) => mapRepairRow(row))
    .filter((row) => {
      if (hasStatusFilter && row.status !== statusFilter) return false;
      if (!queryText) return true;
      const haystack = [
        row.id,
        row.userName,
        row.userEmail,
        row.orderRef,
        row.pieceName,
        row.repairType,
        row.description,
        row.returnAddress,
        row.rejectionReason,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(queryText);
    });

  return {
    rows: rows.slice(offset, offset + pageSize),
    total: rows.length,
    page,
    pageSize,
  };
}

async function getRepairRequestById(repairId: string) {
  await ensureRepairTables();
  const safeRepairId = normalizeText(repairId);
  if (!safeRepairId) return null;

  const result = await query<RepairRequestRow>(
    `
    SELECT *
    FROM repair_requests
    WHERE id = $1::uuid
    LIMIT 1
    `,
    [safeRepairId]
  );

  const row = result.rows[0] || null;
  return row ? mapRepairRow(row) : null;
}

async function reviewRepairRequest(
  repairId: string,
  input: {
    decision: "accepted" | "rejected";
    rejectionReason?: string;
    adminNote?: string;
    reviewedByAdminId?: string | null;
  }
) {
  await ensureRepairTables();
  const safeRepairId = normalizeText(repairId);
  if (!safeRepairId) throw createRepairError("INVALID_ID", 400, "Solicitação inválida.");

  const decision = input.decision === "rejected" ? "rejected" : "accepted";
  const rejectionReason = normalizeText(input.rejectionReason);
  const adminNote = normalizeText(input.adminNote);
  const reviewedByAdminId = normalizeText(input.reviewedByAdminId) || null;

  if (decision === "rejected" && !rejectionReason) {
    throw createRepairError("REJECTION_REASON_REQUIRED", 400, "Informe o motivo da recusa.");
  }

  return withTransaction(async (client) => {
    const currentResult = await client.query<RepairRequestRow>(
      `
      SELECT *
      FROM repair_requests
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE
      `,
      [safeRepairId]
    );
    const current = currentResult.rows[0] || null;
    if (!current) throw createRepairError("REPAIR_NOT_FOUND", 404, "Solicitação não encontrada.");

    const updatedResult = await client.query<RepairRequestRow>(
      `
      UPDATE repair_requests
      SET status = $2,
          rejection_reason = $3,
          admin_note = $4,
          reviewed_at = NOW(),
          reviewed_by_admin_id = $5::uuid,
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *
      `,
      [
        safeRepairId,
        decision,
        decision === "rejected" ? rejectionReason : "",
        adminNote,
        reviewedByAdminId,
      ]
    );

    const row = updatedResult.rows[0] || null;
    if (!row) throw createRepairError("REPAIR_REVIEW_FAILED", 500, "Falha ao atualizar solicitação.");

    return {
      before: mapRepairRow(current),
      repair: mapRepairRow(row),
    };
  });
}

module.exports = {
  ensureRepairTables,
  createRepairRequest,
  listMyRepairRequests,
  listAdminRepairRequests,
  getRepairRequestById,
  reviewRepairRequest,
};
