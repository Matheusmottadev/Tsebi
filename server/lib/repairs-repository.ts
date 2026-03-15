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
  tracking_code?: string;
  piece_received_at?: string;
  return_posted_at?: string;
  returned_delivered_at?: string;
  status?: string;
  rejection_reason?: string;
  admin_note?: string;
  decision_outcome?: string;
  decision_reason?: string;
  decision_at?: string;
  decision_by_admin_id?: string;
  decision_by_admin_name?: string;
  decision_by_admin_email?: string;
  reviewed_at?: string;
  reviewed_by_admin_id?: string;
  created_at?: string;
  updated_at?: string;
};

type NormalizedRepairStatus =
  | "pending"
  | "awaiting_shipment"
  | "item_received"
  | "in_repair"
  | "completed"
  | "returned"
  | "rejected";

type UpdateRepairAction = "decision" | "progress";
type RepairDecisionOutcome = "accepted" | "rejected" | null;

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

function normalizeOptionalIsoDate(value: unknown): string | null {
  const raw = normalizeText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw createRepairError("INVALID_LOGISTICS_DATE", 400, "Data logistica invalida.");
  }
  return parsed.toISOString();
}

function normalizeRepairStatus(value: unknown): NormalizedRepairStatus {
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

function normalizeRepairDecisionOutcome(value: unknown): RepairDecisionOutcome {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "accepted") return "accepted";
  if (raw === "rejected") return "rejected";
  return null;
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
    trackingCode: normalizeText(row.tracking_code),
    pieceReceivedAt: normalizeDate(row.piece_received_at),
    returnPostedAt: normalizeDate(row.return_posted_at),
    returnedDeliveredAt: normalizeDate(row.returned_delivered_at),
    status: normalizeRepairStatus(row.status),
    rejectionReason: normalizeText(row.rejection_reason),
    adminNote: normalizeText(row.admin_note),
    decisionOutcome: normalizeRepairDecisionOutcome(row.decision_outcome),
    decisionReason: normalizeText(row.decision_reason),
    decisionAt: normalizeDate(row.decision_at),
    decisionByAdminId: normalizeText(row.decision_by_admin_id) || null,
    decisionByAdminName: normalizeText(row.decision_by_admin_name),
    decisionByAdminEmail: normalizeText(row.decision_by_admin_email),
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
          tracking_code TEXT NOT NULL DEFAULT '',
          piece_received_at TIMESTAMPTZ NULL,
          return_posted_at TIMESTAMPTZ NULL,
          returned_delivered_at TIMESTAMPTZ NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          rejection_reason TEXT NOT NULL DEFAULT '',
          admin_note TEXT NOT NULL DEFAULT '',
          decision_outcome TEXT NOT NULL DEFAULT '',
          decision_reason TEXT NOT NULL DEFAULT '',
          decision_at TIMESTAMPTZ NULL,
          decision_by_admin_id UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
          decision_by_admin_name TEXT NOT NULL DEFAULT '',
          decision_by_admin_email TEXT NOT NULL DEFAULT '',
          reviewed_at TIMESTAMPTZ NULL,
          reviewed_by_admin_id UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`
        ALTER TABLE repair_requests
          ADD COLUMN IF NOT EXISTS tracking_code TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS piece_received_at TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS return_posted_at TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS returned_delivered_at TIMESTAMPTZ NULL;
      `);
      await query(`
        ALTER TABLE repair_requests
          ADD COLUMN IF NOT EXISTS decision_outcome TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS decision_reason TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ NULL,
          ADD COLUMN IF NOT EXISTS decision_by_admin_id UUID NULL REFERENCES admins(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS decision_by_admin_name TEXT NOT NULL DEFAULT '',
          ADD COLUMN IF NOT EXISTS decision_by_admin_email TEXT NOT NULL DEFAULT '';
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
    throw createRepairError("INVALID_INPUT", 400, "Dados invalidos para solicitacao de reparo.");
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
  if (!row) throw createRepairError("REPAIR_CREATE_FAILED", 500, "Falha ao criar solicitacao de reparo.");
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
        row.trackingCode,
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

async function updateRepairRequestStatus(
  repairId: string,
  input: {
    action: UpdateRepairAction;
    status: "awaiting_shipment" | "item_received" | "in_repair" | "completed" | "returned" | "rejected";
    rejectionReason?: string;
    adminNote?: string;
    reviewedByAdminId?: string | null;
    actorAdminName?: string;
    actorAdminEmail?: string;
    trackingCode?: string;
    pieceReceivedAt?: string | null;
    returnPostedAt?: string | null;
    returnedDeliveredAt?: string | null;
  }
) {
  await ensureRepairTables();
  const safeRepairId = normalizeText(repairId);
  if (!safeRepairId) throw createRepairError("INVALID_ID", 400, "Solicitacao invalida.");

  const action: UpdateRepairAction = input.action === "decision" ? "decision" : "progress";
  const nextStatus = normalizeRepairStatus(input.status);
  const rejectionReason = normalizeText(input.rejectionReason);
  const adminNote = normalizeText(input.adminNote);
  const reviewedByAdminId = normalizeText(input.reviewedByAdminId) || null;
  const actorAdminName = normalizeText(input.actorAdminName);
  const actorAdminEmail = normalizeText(input.actorAdminEmail).toLowerCase();
  const trackingCode = normalizeText(input.trackingCode);
  const pieceReceivedAt =
    Object.prototype.hasOwnProperty.call(input, "pieceReceivedAt") ? normalizeOptionalIsoDate(input.pieceReceivedAt) : undefined;
  const returnPostedAt =
    Object.prototype.hasOwnProperty.call(input, "returnPostedAt") ? normalizeOptionalIsoDate(input.returnPostedAt) : undefined;
  const returnedDeliveredAt =
    Object.prototype.hasOwnProperty.call(input, "returnedDeliveredAt")
      ? normalizeOptionalIsoDate(input.returnedDeliveredAt)
      : undefined;

  if (nextStatus === "pending") {
    throw createRepairError("INVALID_STATUS", 400, "Status de reparo invalido.");
  }
  if (nextStatus === "rejected" && !rejectionReason) {
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
    if (!current) throw createRepairError("REPAIR_NOT_FOUND", 404, "Solicitacao nao encontrada.");

    const currentMapped = mapRepairRow(current);
    if (currentMapped.status === "rejected" || currentMapped.status === "returned") {
      throw createRepairError("REPAIR_STATUS_LOCKED", 409, "Solicitacao ja encerrada.");
    }

    if (action === "decision" && currentMapped.status !== "pending") {
      throw createRepairError("REPAIR_DECISION_LOCKED", 409, "A decisao inicial do reparo ja foi tomada.");
    }
    if (action === "progress" && currentMapped.status === "pending") {
      throw createRepairError("REPAIR_DECISION_REQUIRED", 409, "Aceite ou recuse a solicitacao antes de avancar etapas.");
    }

    const allowedTransitions: Record<NormalizedRepairStatus, NormalizedRepairStatus[]> = {
      pending: ["awaiting_shipment", "rejected"],
      awaiting_shipment: ["item_received", "rejected"],
      item_received: ["in_repair", "completed", "rejected"],
      in_repair: ["completed", "rejected"],
      completed: ["returned"],
      returned: [],
      rejected: [],
    };

    const nextAllowed = allowedTransitions[currentMapped.status] || [];
    if (action === "decision" && !["awaiting_shipment", "rejected"].includes(nextStatus)) {
      throw createRepairError("REPAIR_DECISION_INVALID", 400, "A decisao inicial so pode aceitar ou recusar a solicitacao.");
    }
    if (action === "progress" && ["awaiting_shipment", "rejected"].includes(nextStatus) && currentMapped.status !== nextStatus) {
      throw createRepairError("REPAIR_PROGRESS_INVALID", 409, "A decisao inicial nao pode ser alterada apos o aceite.");
    }
    if (!nextAllowed.includes(nextStatus) && currentMapped.status !== nextStatus) {
      throw createRepairError("REPAIR_INVALID_TRANSITION", 409, "Transicao de status invalida.");
    }

    const nextDecisionOutcome: RepairDecisionOutcome =
      action === "decision" ? (nextStatus === "rejected" ? "rejected" : "accepted") : currentMapped.decisionOutcome;
    const nextDecisionReason =
      action === "decision"
        ? nextStatus === "rejected"
          ? rejectionReason
          : adminNote
        : currentMapped.decisionReason;
    const nextDecisionAt = action === "decision" ? "NOW()" : "decision_at";
    const nextDecisionByAdminId = action === "decision" ? reviewedByAdminId : currentMapped.decisionByAdminId;
    const nextDecisionByAdminName = action === "decision" ? actorAdminName : currentMapped.decisionByAdminName;
    const nextDecisionByAdminEmail = action === "decision" ? actorAdminEmail : currentMapped.decisionByAdminEmail;
    const nextTrackingCode =
      Object.prototype.hasOwnProperty.call(input, "trackingCode") ? trackingCode : currentMapped.trackingCode;
    const nextPieceReceivedAt = pieceReceivedAt === undefined ? currentMapped.pieceReceivedAt : pieceReceivedAt;
    const nextReturnPostedAt = returnPostedAt === undefined ? currentMapped.returnPostedAt : returnPostedAt;
    const nextReturnedDeliveredAt =
      returnedDeliveredAt === undefined ? currentMapped.returnedDeliveredAt : returnedDeliveredAt;

    const updatedResult = await client.query<RepairRequestRow>(
      `
      UPDATE repair_requests
      SET status = $2,
          rejection_reason = $3,
          admin_note = $4,
          tracking_code = $5,
          piece_received_at = $6::timestamptz,
          return_posted_at = $7::timestamptz,
          returned_delivered_at = $8::timestamptz,
          decision_outcome = $9,
          decision_reason = $10,
          decision_at = ${nextDecisionAt},
          decision_by_admin_id = $11::uuid,
          decision_by_admin_name = $12,
          decision_by_admin_email = $13,
          reviewed_at = NOW(),
          reviewed_by_admin_id = $14::uuid,
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *
      `,
      [
        safeRepairId,
        nextStatus,
        nextStatus === "rejected" ? rejectionReason : currentMapped.rejectionReason,
        adminNote,
        nextTrackingCode,
        nextPieceReceivedAt,
        nextReturnPostedAt,
        nextReturnedDeliveredAt,
        nextDecisionOutcome || "",
        nextDecisionReason,
        nextDecisionByAdminId,
        nextDecisionByAdminName,
        nextDecisionByAdminEmail,
        reviewedByAdminId,
      ]
    );

    const row = updatedResult.rows[0] || null;
    if (!row) throw createRepairError("REPAIR_REVIEW_FAILED", 500, "Falha ao atualizar solicitacao.");

    return {
      before: currentMapped,
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
  updateRepairRequestStatus,
};
