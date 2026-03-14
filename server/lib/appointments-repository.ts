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

let appointmentSchemaPromise: Promise<void> | null = null;

type AppointmentSlotRow = JsonRecord & {
  id: string;
  starts_at: string;
  ends_at: string;
  label?: string;
  modality?: string;
  location?: string;
  admin_note?: string;
  is_available?: boolean;
  is_blocked?: boolean;
  capacity?: number;
  created_by_admin_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type AppointmentRow = JsonRecord & {
  id: string;
  slot_id: string;
  user_id: string;
  status?: string;
  service_type?: string;
  modality?: string;
  notes?: string;
  admin_note?: string;
  created_at?: string;
  updated_at?: string;
  user_name?: string;
  user_email?: string;
  slot_starts_at?: string;
  slot_ends_at?: string;
  slot_label?: string;
  slot_location?: string;
};

function createAppointmentError(code: string, status = 400, message = code) {
  const error = new Error(message) as Error & { code?: string; status?: number };
  error.code = code;
  error.status = status;
  return error;
}

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function normalizeDateKey(value: unknown): string {
  const raw = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function normalizeAppointmentStatus(value: unknown): "scheduled" | "completed" | "canceled" {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "completed" || raw === "concluido" || raw === "concluído") return "completed";
  if (raw === "canceled" || raw === "cancelado" || raw === "cancelled") return "canceled";
  return "scheduled";
}

function normalizeSlotStatus(value: unknown): "available" | "unavailable" | "blocked" | "filled" | "booked" | "" {
  const raw = normalizeText(value).toLowerCase();
  if (["available", "disponivel", "disponível"].includes(raw)) return "available";
  if (["unavailable", "indisponivel", "indisponível"].includes(raw)) return "unavailable";
  if (["blocked", "bloqueado"].includes(raw)) return "blocked";
  if (["filled", "lotado"].includes(raw)) return "filled";
  if (["booked", "agendado"].includes(raw)) return "booked";
  return "";
}

function formatDateDisplay(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function formatTimeDisplay(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function mapAppointmentRow(row: AppointmentRow) {
  const startsAt = normalizeText(row.slot_starts_at);
  const endsAt = normalizeText(row.slot_ends_at);
  return {
    id: String(row.id || ""),
    slotId: String(row.slot_id || ""),
    userId: String(row.user_id || ""),
    userName: normalizeText(row.user_name),
    userEmail: normalizeText(row.user_email),
    status: normalizeAppointmentStatus(row.status),
    serviceType: normalizeText(row.service_type),
    modality: normalizeText(row.modality),
    notes: normalizeText(row.notes),
    adminNote: normalizeText(row.admin_note),
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    date: startsAt ? formatDateDisplay(startsAt) : "",
    time: startsAt ? formatTimeDisplay(startsAt) : "",
    label: normalizeText(row.slot_label),
    location: normalizeText(row.slot_location),
  };
}

function computeSlotStatus(input: {
  isAvailable: boolean;
  isBlocked: boolean;
  capacity: number;
  bookedCount: number;
}): "available" | "unavailable" | "blocked" | "filled" | "booked" {
  if (input.isBlocked) return "blocked";
  if (!input.isAvailable) return "unavailable";
  if (input.bookedCount <= 0) return "available";
  if (input.bookedCount >= input.capacity) return "filled";
  return "booked";
}

function mapSlotRow(
  row: AppointmentSlotRow,
  appointments: Array<ReturnType<typeof mapAppointmentRow>> = []
) {
  const capacity = Math.max(1, Number(row.capacity || 1));
  const activeAppointments = appointments.filter((item) => item.status !== "canceled");
  const bookedCount = activeAppointments.length;
  const startsAt = normalizeText(row.starts_at);
  const endsAt = normalizeText(row.ends_at);
  const isAvailable = Boolean(row.is_available);
  const isBlocked = Boolean(row.is_blocked);

  return {
    id: String(row.id || ""),
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    date: startsAt ? formatDateDisplay(startsAt) : "",
    time: startsAt ? formatTimeDisplay(startsAt) : "",
    label: normalizeText(row.label),
    modality: normalizeText(row.modality),
    location: normalizeText(row.location),
    adminNote: normalizeText(row.admin_note),
    isAvailable,
    isBlocked,
    capacity,
    bookedCount,
    remainingCount: Math.max(0, capacity - bookedCount),
    status: computeSlotStatus({ isAvailable, isBlocked, capacity, bookedCount }),
    createdByAdminId: normalizeText(row.created_by_admin_id) || null,
    createdAt: normalizeText(row.created_at) || null,
    updatedAt: normalizeText(row.updated_at) || null,
    appointments,
  };
}

async function ensureAppointmentTables(): Promise<void> {
  if (!appointmentSchemaPromise) {
    appointmentSchemaPromise = (async () => {
      await query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
      await query(`
        CREATE TABLE IF NOT EXISTS appointment_slots (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          starts_at TIMESTAMPTZ NOT NULL,
          ends_at TIMESTAMPTZ NOT NULL,
          label TEXT NOT NULL DEFAULT '',
          modality TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          admin_note TEXT NOT NULL DEFAULT '',
          is_available BOOLEAN NOT NULL DEFAULT TRUE,
          is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
          capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity >= 1 AND capacity <= 20),
          created_by_admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS appointments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          slot_id UUID NOT NULL REFERENCES appointment_slots(id) ON DELETE RESTRICT,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'scheduled',
          service_type TEXT NOT NULL DEFAULT '',
          modality TEXT NOT NULL DEFAULT '',
          notes TEXT NOT NULL DEFAULT '',
          admin_note TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS appointment_slots_starts_at_idx
          ON appointment_slots (starts_at ASC);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS appointments_slot_id_idx
          ON appointments (slot_id, status);
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS appointments_user_id_idx
          ON appointments (user_id, created_at DESC);
      `);
    })().catch((error: unknown) => {
      appointmentSchemaPromise = null;
      throw error;
    });
  }

  await appointmentSchemaPromise;
}

async function listAppointmentsBySlotIds(slotIds: string[]): Promise<Map<string, Array<ReturnType<typeof mapAppointmentRow>>>> {
  if (!slotIds.length) return new Map();

  const result = await query<AppointmentRow>(
    `
    SELECT
      a.id,
      a.slot_id,
      a.user_id,
      a.status,
      a.service_type,
      a.modality,
      a.notes,
      a.admin_note,
      a.created_at,
      a.updated_at,
      u.name AS user_name,
      u.email AS user_email,
      s.starts_at AS slot_starts_at,
      s.ends_at AS slot_ends_at,
      s.label AS slot_label,
      s.location AS slot_location
    FROM appointments a
    JOIN users u ON u.id = a.user_id
    JOIN appointment_slots s ON s.id = a.slot_id
    WHERE a.slot_id = ANY($1::uuid[])
    ORDER BY s.starts_at ASC, a.created_at ASC
    `,
    [slotIds]
  );

  const map = new Map<string, Array<ReturnType<typeof mapAppointmentRow>>>();
  for (const row of result.rows) {
    const slotId = String(row.slot_id || "");
    const list = map.get(slotId) || [];
    list.push(mapAppointmentRow(row));
    map.set(slotId, list);
  }
  return map;
}

async function listAppointmentSlotsForDate(date: string) {
  await ensureAppointmentTables();
  const safeDate = normalizeDateKey(date);
  if (!safeDate) throw createAppointmentError("INVALID_DATE", 400, "Data invalida.");

  const slotsResult = await query<AppointmentSlotRow>(
    `
    SELECT *
    FROM appointment_slots
    WHERE (starts_at AT TIME ZONE 'America/Sao_Paulo') >= $1::date
      AND (starts_at AT TIME ZONE 'America/Sao_Paulo') < ($1::date + INTERVAL '1 day')
    ORDER BY starts_at ASC
    `,
    [safeDate]
  );
  const slotIds = slotsResult.rows.map((row) => String(row.id || "")).filter(Boolean);
  const appointmentsBySlotId = await listAppointmentsBySlotIds(slotIds);

  return slotsResult.rows
    .map((row) => mapSlotRow(row, appointmentsBySlotId.get(String(row.id || "")) || []))
    .filter(
      (slot) =>
        slot.isAvailable &&
        !slot.isBlocked &&
        slot.remainingCount > 0 &&
        Boolean(slot.startsAt) &&
        new Date(String(slot.startsAt)).getTime() > Date.now()
    );
}

async function listMyAppointments(userId: string) {
  await ensureAppointmentTables();
  const safeUserId = normalizeText(userId);
  if (!safeUserId) return [];

  const result = await query<AppointmentRow>(
    `
    SELECT
      a.id,
      a.slot_id,
      a.user_id,
      a.status,
      a.service_type,
      a.modality,
      a.notes,
      a.admin_note,
      a.created_at,
      a.updated_at,
      s.starts_at AS slot_starts_at,
      s.ends_at AS slot_ends_at,
      s.label AS slot_label,
      s.location AS slot_location
    FROM appointments a
    JOIN appointment_slots s ON s.id = a.slot_id
    WHERE a.user_id = $1::uuid
    ORDER BY s.starts_at DESC, a.created_at DESC
    `,
    [safeUserId]
  );

  return result.rows.map((row) => mapAppointmentRow(row));
}

async function createAppointment(input: {
  slotId: string;
  userId: string;
  serviceType: string;
  modality?: string;
  notes?: string;
}) {
  await ensureAppointmentTables();
  const slotId = normalizeText(input.slotId);
  const userId = normalizeText(input.userId);
  const serviceType = normalizeText(input.serviceType);
  const modality = normalizeText(input.modality);
  const notes = normalizeText(input.notes);

  if (!slotId || !userId || !serviceType) {
    throw createAppointmentError("INVALID_INPUT", 400, "Dados incompletos para agendamento.");
  }

  return withTransaction(async (client) => {
    const slotResult = await client.query<AppointmentSlotRow>(
      `
      SELECT *
      FROM appointment_slots
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE
      `,
      [slotId]
    );
    const slotRow = slotResult.rows[0] || null;
    if (!slotRow) throw createAppointmentError("SLOT_NOT_FOUND", 404, "Horario nao encontrado.");

    const slot = mapSlotRow(slotRow, []);
    if (!slot.startsAt || new Date(slot.startsAt).getTime() <= Date.now()) {
      throw createAppointmentError("SLOT_IN_PAST", 409, "Horario indisponivel.");
    }
    if (slot.isBlocked || !slot.isAvailable) {
      throw createAppointmentError("SLOT_UNAVAILABLE", 409, "Horario indisponivel.");
    }

    const countResult = await client.query<{ booked_count: string } & JsonRecord>(
      `
      SELECT COUNT(*)::text AS booked_count
      FROM appointments
      WHERE slot_id = $1::uuid
        AND status <> 'canceled'
      `,
      [slotId]
    );
    const bookedCount = Math.max(0, Number(countResult.rows[0]?.booked_count || 0));
    if (bookedCount >= slot.capacity) {
      throw createAppointmentError("SLOT_FULL", 409, "Horario sem vagas.");
    }

    const duplicateResult = await client.query<{ id: string } & JsonRecord>(
      `
      SELECT id
      FROM appointments
      WHERE slot_id = $1::uuid
        AND user_id = $2::uuid
        AND status <> 'canceled'
      LIMIT 1
      `,
      [slotId, userId]
    );
    if (duplicateResult.rowCount) {
      throw createAppointmentError("APPOINTMENT_ALREADY_EXISTS", 409, "Voce ja agendou este horario.");
    }

    const inserted = await client.query<AppointmentRow>(
      `
      INSERT INTO appointments (
        slot_id,
        user_id,
        status,
        service_type,
        modality,
        notes,
        updated_at
      ) VALUES (
        $1::uuid,
        $2::uuid,
        'scheduled',
        $3,
        $4,
        $5,
        NOW()
      )
      RETURNING id, slot_id, user_id, status, service_type, modality, notes, admin_note, created_at, updated_at
      `,
      [slotId, userId, serviceType, modality || slot.modality || "", notes]
    );
    const appointmentRow = inserted.rows[0];
    if (!appointmentRow) throw createAppointmentError("APPOINTMENT_CREATE_FAILED", 500, "Falha ao criar agendamento.");

    const joined = await client.query<AppointmentRow>(
      `
      SELECT
        a.id,
        a.slot_id,
        a.user_id,
        a.status,
        a.service_type,
        a.modality,
        a.notes,
        a.admin_note,
        a.created_at,
        a.updated_at,
        u.name AS user_name,
        u.email AS user_email,
        s.starts_at AS slot_starts_at,
        s.ends_at AS slot_ends_at,
        s.label AS slot_label,
        s.location AS slot_location
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      JOIN appointment_slots s ON s.id = a.slot_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [appointmentRow.id]
    );

    return mapAppointmentRow(joined.rows[0] || appointmentRow);
  });
}

async function listAdminAppointmentSlots(input: {
  date?: string;
  status?: string;
  includePast?: boolean;
}) {
  await ensureAppointmentTables();

  const safeDate = normalizeDateKey(input.date);
  const statusFilter = normalizeSlotStatus(input.status);
  const includePast = normalizeBoolean(input.includePast, false);
  const params: unknown[] = [];
  let where = "WHERE 1 = 1";

  if (safeDate) {
    params.push(safeDate);
    where += ` AND (starts_at AT TIME ZONE 'America/Sao_Paulo') >= $${params.length}::date`;
    where += ` AND (starts_at AT TIME ZONE 'America/Sao_Paulo') < ($${params.length}::date + INTERVAL '1 day')`;
  } else if (!includePast) {
    where += ` AND starts_at >= NOW() - INTERVAL '1 day'`;
  }

  const slotsResult = await query<AppointmentSlotRow>(
    `
    SELECT *
    FROM appointment_slots
    ${where}
    ORDER BY starts_at ASC, created_at ASC
    `,
    params
  );
  const slotIds = slotsResult.rows.map((row) => String(row.id || "")).filter(Boolean);
  const appointmentsBySlotId = await listAppointmentsBySlotIds(slotIds);

  return slotsResult.rows
    .map((row) => mapSlotRow(row, appointmentsBySlotId.get(String(row.id || "")) || []))
    .filter((slot) => {
      if (!statusFilter) return true;
      return slot.status === statusFilter;
    });
}

async function createAdminAppointmentSlot(input: {
  startsAt: string;
  endsAt: string;
  label?: string;
  modality?: string;
  location?: string;
  adminNote?: string;
  capacity?: number;
  isAvailable?: boolean;
  isBlocked?: boolean;
  createdByAdminId?: string | null;
}) {
  await ensureAppointmentTables();
  const startsAt = normalizeText(input.startsAt);
  const endsAt = normalizeText(input.endsAt);
  const capacity = Math.max(1, Math.min(20, Number(input.capacity || 1) || 1));
  if (!startsAt || !endsAt) throw createAppointmentError("INVALID_INPUT", 400, "Horario invalido.");

  const startDate = new Date(startsAt);
  const endDate = new Date(endsAt);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
    throw createAppointmentError("INVALID_TIME_RANGE", 400, "Intervalo de horario invalido.");
  }

  const result = await query<AppointmentSlotRow>(
    `
    INSERT INTO appointment_slots (
      starts_at,
      ends_at,
      label,
      modality,
      location,
      admin_note,
      is_available,
      is_blocked,
      capacity,
      created_by_admin_id,
      updated_at
    ) VALUES (
      $1::timestamptz,
      $2::timestamptz,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10::uuid,
      NOW()
    )
    RETURNING *
    `,
    [
      startsAt,
      endsAt,
      normalizeText(input.label),
      normalizeText(input.modality),
      normalizeText(input.location),
      normalizeText(input.adminNote),
      normalizeBoolean(input.isAvailable, true),
      normalizeBoolean(input.isBlocked, false),
      capacity,
      normalizeText(input.createdByAdminId) || null,
    ]
  );

  const row = result.rows[0];
  if (!row) throw createAppointmentError("SLOT_CREATE_FAILED", 500, "Falha ao criar horario.");
  return mapSlotRow(row, []);
}

async function updateAdminAppointmentSlot(
  slotId: string,
  patch: {
    startsAt?: string;
    endsAt?: string;
    label?: string;
    modality?: string;
    location?: string;
    adminNote?: string;
    capacity?: number;
    isAvailable?: boolean;
    isBlocked?: boolean;
  }
) {
  await ensureAppointmentTables();
  const safeSlotId = normalizeText(slotId);
  if (!safeSlotId) throw createAppointmentError("INVALID_ID", 400, "Horario invalido.");

  return withTransaction(async (client) => {
    const currentResult = await client.query<AppointmentSlotRow>(
      `
      SELECT *
      FROM appointment_slots
      WHERE id = $1::uuid
      LIMIT 1
      FOR UPDATE
      `,
      [safeSlotId]
    );
    const currentRow = currentResult.rows[0] || null;
    if (!currentRow) throw createAppointmentError("SLOT_NOT_FOUND", 404, "Horario nao encontrado.");

    const currentAppointments = await client.query<{ booked_count: string } & JsonRecord>(
      `
      SELECT COUNT(*)::text AS booked_count
      FROM appointments
      WHERE slot_id = $1::uuid
        AND status <> 'canceled'
      `,
      [safeSlotId]
    );
    const bookedCount = Math.max(0, Number(currentAppointments.rows[0]?.booked_count || 0));
    const nextCapacity = patch.capacity == null ? Math.max(1, Number(currentRow.capacity || 1)) : Math.max(1, Math.min(20, Number(patch.capacity || 1) || 1));
    if (nextCapacity < bookedCount) {
      throw createAppointmentError("SLOT_CAPACITY_CONFLICT", 409, "Capacidade menor que os agendamentos existentes.");
    }

    const nextStartsAt = patch.startsAt == null ? normalizeText(currentRow.starts_at) : normalizeText(patch.startsAt);
    const nextEndsAt = patch.endsAt == null ? normalizeText(currentRow.ends_at) : normalizeText(patch.endsAt);
    const startDate = new Date(nextStartsAt);
    const endDate = new Date(nextEndsAt);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate.getTime() <= startDate.getTime()) {
      throw createAppointmentError("INVALID_TIME_RANGE", 400, "Intervalo de horario invalido.");
    }

    const updated = await client.query<AppointmentSlotRow>(
      `
      UPDATE appointment_slots
      SET starts_at = $2::timestamptz,
          ends_at = $3::timestamptz,
          label = $4,
          modality = $5,
          location = $6,
          admin_note = $7,
          is_available = $8,
          is_blocked = $9,
          capacity = $10,
          updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *
      `,
      [
        safeSlotId,
        nextStartsAt,
        nextEndsAt,
        patch.label == null ? normalizeText(currentRow.label) : normalizeText(patch.label),
        patch.modality == null ? normalizeText(currentRow.modality) : normalizeText(patch.modality),
        patch.location == null ? normalizeText(currentRow.location) : normalizeText(patch.location),
        patch.adminNote == null ? normalizeText(currentRow.admin_note) : normalizeText(patch.adminNote),
        patch.isAvailable == null ? Boolean(currentRow.is_available) : Boolean(patch.isAvailable),
        patch.isBlocked == null ? Boolean(currentRow.is_blocked) : Boolean(patch.isBlocked),
        nextCapacity,
      ]
    );
    const row = updated.rows[0];
    if (!row) throw createAppointmentError("SLOT_UPDATE_FAILED", 500, "Falha ao atualizar horario.");

    const appointmentsBySlotId = await listAppointmentsBySlotIds([safeSlotId]);
    return mapSlotRow(row, appointmentsBySlotId.get(safeSlotId) || []);
  });
}

async function deleteAdminAppointmentSlot(slotId: string) {
  await ensureAppointmentTables();
  const safeSlotId = normalizeText(slotId);
  if (!safeSlotId) throw createAppointmentError("INVALID_ID", 400, "Horario invalido.");

  return withTransaction(async (client) => {
    const appointmentsResult = await client.query<{ active_count: string } & JsonRecord>(
      `
      SELECT COUNT(*)::text AS active_count
      FROM appointments
      WHERE slot_id = $1::uuid
        AND status <> 'canceled'
      `,
      [safeSlotId]
    );
    const activeCount = Math.max(0, Number(appointmentsResult.rows[0]?.active_count || 0));
    if (activeCount > 0) {
      throw createAppointmentError("SLOT_HAS_APPOINTMENTS", 409, "Nao e possivel excluir um horario com agendamentos.");
    }

    const deleted = await client.query<AppointmentSlotRow>(
      `
      DELETE FROM appointment_slots
      WHERE id = $1::uuid
      RETURNING *
      `,
      [safeSlotId]
    );
    const row = deleted.rows[0] || null;
    if (!row) throw createAppointmentError("SLOT_NOT_FOUND", 404, "Horario nao encontrado.");
    return mapSlotRow(row, []);
  });
}

async function cancelAdminAppointment(appointmentId: string) {
  await ensureAppointmentTables();
  const safeId = normalizeText(appointmentId);
  if (!safeId) throw createAppointmentError("INVALID_ID", 400, "ID invalido.");

  return withTransaction(async (client) => {
    const checkResult = await client.query<AppointmentRow>(
      `SELECT id, status FROM appointments WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
      [safeId]
    );
    const existing = checkResult.rows[0];
    if (!existing) throw createAppointmentError("APPOINTMENT_NOT_FOUND", 404, "Agendamento nao encontrado.");
    if (normalizeAppointmentStatus(existing.status) === "canceled") {
      throw createAppointmentError("ALREADY_CANCELED", 409, "Agendamento ja cancelado.");
    }

    await client.query(
      `UPDATE appointments SET status = 'canceled', updated_at = NOW() WHERE id = $1::uuid`,
      [safeId]
    );

    const joined = await client.query<AppointmentRow>(
      `SELECT a.id, a.slot_id, a.user_id, a.status, a.service_type, a.modality, a.notes, a.admin_note, a.created_at, a.updated_at,
              u.name AS user_name, u.email AS user_email,
              s.starts_at AS slot_starts_at, s.ends_at AS slot_ends_at, s.label AS slot_label, s.location AS slot_location
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       JOIN appointment_slots s ON s.id = a.slot_id
       WHERE a.id = $1::uuid LIMIT 1`,
      [safeId]
    );
    return mapAppointmentRow(joined.rows[0] || existing);
  });
}

async function cancelUserAppointment(userId: string, appointmentId: string) {
  await ensureAppointmentTables();
  const safeUserId = normalizeText(userId);
  const safeId = normalizeText(appointmentId);
  if (!safeUserId || !safeId) throw createAppointmentError("INVALID_ID", 400, "ID invalido.");

  return withTransaction(async (client) => {
    const checkResult = await client.query<AppointmentRow>(
      `
      SELECT
        a.id,
        a.slot_id,
        a.user_id,
        a.status,
        a.service_type,
        a.modality,
        a.notes,
        a.admin_note,
        a.created_at,
        a.updated_at,
        u.name AS user_name,
        u.email AS user_email,
        s.starts_at AS slot_starts_at,
        s.ends_at AS slot_ends_at,
        s.label AS slot_label,
        s.location AS slot_location
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      JOIN appointment_slots s ON s.id = a.slot_id
      WHERE a.id = $1::uuid AND a.user_id = $2::uuid
      LIMIT 1
      FOR UPDATE
      `,
      [safeId, safeUserId]
    );
    const existing = checkResult.rows[0];
    if (!existing) throw createAppointmentError("APPOINTMENT_NOT_FOUND", 404, "Agendamento nao encontrado.");

    const status = normalizeAppointmentStatus(existing.status);
    if (status === "canceled") {
      throw createAppointmentError("ALREADY_CANCELED", 409, "Agendamento ja cancelado.");
    }
    if (status === "completed") {
      throw createAppointmentError("APPOINTMENT_COMPLETED", 409, "Agendamento ja concluido.");
    }

    const startsAtMs = existing.slot_starts_at ? new Date(String(existing.slot_starts_at)).getTime() : NaN;
    if (Number.isFinite(startsAtMs) && startsAtMs <= Date.now()) {
      throw createAppointmentError("SLOT_IN_PAST", 409, "Nao e possivel cancelar um horario que ja passou.");
    }

    await client.query(
      `UPDATE appointments SET status = 'canceled', updated_at = NOW() WHERE id = $1::uuid`,
      [safeId]
    );

    const joined = await client.query<AppointmentRow>(
      `
      SELECT
        a.id,
        a.slot_id,
        a.user_id,
        a.status,
        a.service_type,
        a.modality,
        a.notes,
        a.admin_note,
        a.created_at,
        a.updated_at,
        u.name AS user_name,
        u.email AS user_email,
        s.starts_at AS slot_starts_at,
        s.ends_at AS slot_ends_at,
        s.label AS slot_label,
        s.location AS slot_location
      FROM appointments a
      JOIN users u ON u.id = a.user_id
      JOIN appointment_slots s ON s.id = a.slot_id
      WHERE a.id = $1::uuid
      LIMIT 1
      `,
      [safeId]
    );
    return mapAppointmentRow(joined.rows[0] || existing);
  });
}

async function rescheduleAdminAppointment(appointmentId: string, newSlotId: string) {
  await ensureAppointmentTables();
  const safeId = normalizeText(appointmentId);
  const safeNewSlotId = normalizeText(newSlotId);
  if (!safeId || !safeNewSlotId) throw createAppointmentError("INVALID_INPUT", 400, "Dados invalidos.");

  return withTransaction(async (client) => {
    const apptResult = await client.query<AppointmentRow>(
      `SELECT a.id, a.slot_id, a.user_id, a.status, a.service_type, a.modality, a.notes, a.admin_note, a.created_at, a.updated_at,
              u.name AS user_name, u.email AS user_email,
              s.starts_at AS slot_starts_at, s.ends_at AS slot_ends_at, s.label AS slot_label, s.location AS slot_location
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       JOIN appointment_slots s ON s.id = a.slot_id
       WHERE a.id = $1::uuid LIMIT 1 FOR UPDATE`,
      [safeId]
    );
    const apptRow = apptResult.rows[0];
    if (!apptRow) throw createAppointmentError("APPOINTMENT_NOT_FOUND", 404, "Agendamento nao encontrado.");
    if (normalizeAppointmentStatus(apptRow.status) === "canceled") {
      throw createAppointmentError("APPOINTMENT_CANCELED", 409, "Agendamento cancelado.");
    }

    const oldSlotInfo = {
      startsAt: normalizeText(apptRow.slot_starts_at),
      label: normalizeText(apptRow.slot_label),
      location: normalizeText(apptRow.slot_location),
    };

    const newSlotResult = await client.query<AppointmentSlotRow>(
      `SELECT * FROM appointment_slots WHERE id = $1::uuid LIMIT 1 FOR UPDATE`,
      [safeNewSlotId]
    );
    const newSlotRow = newSlotResult.rows[0];
    if (!newSlotRow) throw createAppointmentError("SLOT_NOT_FOUND", 404, "Novo horario nao encontrado.");

    const newSlot = mapSlotRow(newSlotRow, []);
    if (newSlot.isBlocked || !newSlot.isAvailable) {
      throw createAppointmentError("SLOT_UNAVAILABLE", 409, "Novo horario indisponivel.");
    }

    const countResult = await client.query<{ booked_count: string } & JsonRecord>(
      `SELECT COUNT(*)::text AS booked_count FROM appointments
       WHERE slot_id = $1::uuid AND status <> 'canceled' AND id <> $2::uuid`,
      [safeNewSlotId, safeId]
    );
    const bookedCount = Math.max(0, Number(countResult.rows[0]?.booked_count || 0));
    if (bookedCount >= newSlot.capacity) {
      throw createAppointmentError("SLOT_FULL", 409, "Novo horario sem vagas.");
    }

    await client.query(
      `UPDATE appointments SET slot_id = $2::uuid, status = 'scheduled', updated_at = NOW() WHERE id = $1::uuid`,
      [safeId, safeNewSlotId]
    );

    const updatedResult = await client.query<AppointmentRow>(
      `SELECT a.id, a.slot_id, a.user_id, a.status, a.service_type, a.modality, a.notes, a.admin_note, a.created_at, a.updated_at,
              u.name AS user_name, u.email AS user_email,
              s.starts_at AS slot_starts_at, s.ends_at AS slot_ends_at, s.label AS slot_label, s.location AS slot_location
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       JOIN appointment_slots s ON s.id = a.slot_id
       WHERE a.id = $1::uuid LIMIT 1`,
      [safeId]
    );
    return {
      appointment: mapAppointmentRow(updatedResult.rows[0] || apptRow),
      oldSlot: oldSlotInfo,
    };
  });
}

module.exports = {
  ensureAppointmentTables,
  listAppointmentSlotsForDate,
  listMyAppointments,
  createAppointment,
  listAdminAppointmentSlots,
  createAdminAppointmentSlot,
  updateAdminAppointmentSlot,
  deleteAdminAppointmentSlot,
  cancelAdminAppointment,
  cancelUserAppointment,
  rescheduleAdminAppointment,
};
