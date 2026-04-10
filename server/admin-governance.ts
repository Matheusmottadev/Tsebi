export {};
const express = require("express");
const { z } = require("zod");
const { requireRole } = require("./middlewares/requireRole");
const { requirePermission } = require("./middlewares/requirePermission");
const { requireAdminStepUp } = require("./middlewares/requireAdminStepUp");
const {
  listAdminAccess,
  findAdminAccessById,
  createAdminAccess,
  setAdminAccessRole,
  replaceAdminPermissions,
  setAdminAccessStatus,
  listPrivilegedAdmins,
} = require("./lib/admin-access-repository");
const {
  getBalanceCustomerById,
  searchBalanceCustomers,
  listBalanceHistoryByCustomerId,
  createBalanceRequest,
  listBalanceRequestsByRequester,
  listBalanceRequests,
  findBalanceRequestById,
  approveBalanceRequest,
  rejectBalanceRequest,
} = require("./lib/balance-request-repository");
const {
  createAdminNotifications,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} = require("./lib/admin-notifications-repository");
const {
  insertOpsAuditLog,
  listOpsAuditLogs,
} = require("./lib/ops-audit-repository");
const { listOrdersByUserId } = require("./lib/order-repository");
const { query } = require("./lib/db");

const adminGovernanceRouter = express.Router();
const SECURITY_AUDIT_ACTIONS = [
  "ADMIN_SUSPICIOUS_LOGIN",
  "ADMIN_SUSPICIOUS_ACCESS",
  "ADMIN_CREATED",
  "ADMIN_ROLE_UPDATED",
  "ADMIN_PERMISSIONS_UPDATED",
  "ADMIN_STATUS_UPDATED",
  "BALANCE_APPROVED",
  "BALANCE_REJECTED",
];

const adminRoleSchema = z.enum(["admin", "director", "superadmin"]);
const adminPermissionsSchema = z.object({
  modules: z.array(z.enum(["balance", "orders", "users", "products"])).max(10).default([]),
});
const adminCreateSchema = z.object({
  email: z.string().trim().email(),
  role: adminRoleSchema.default("admin"),
  modules: z.array(z.enum(["balance", "orders", "users", "products"])).max(10).optional().default([]),
});
const adminRoleUpdateSchema = z.object({
  role: adminRoleSchema,
});
const adminStatusSchema = z.object({
  isActive: z.coerce.boolean(),
});
const balanceRequestSchema = z.object({
  customerId: z.string().trim().uuid(),
  type: z.enum(["credit", "debit"]),
  amount: z.coerce.number().positive().max(99999999),
  reason: z.enum(["product_return", "billing_error", "courtesy", "manual_adjustment", "other"]),
  reasonDetail: z.string().trim().max(4000).optional().default(""),
  relatedOrderId: z.string().trim().uuid().optional().or(z.literal("")).default(""),
  internalNote: z.string().trim().max(4000).optional().default(""),
}).superRefine((value: any, ctx: any) => {
  if (value.reason === "other" && !String(value.reasonDetail || "").trim()) {
    ctx.addIssue({
      code: "custom",
      message: "REASON_DETAIL_REQUIRED",
      path: ["reasonDetail"],
    });
  }
});
const balanceRejectSchema = z.object({
  rejectionReason: z.string().trim().min(3).max(4000),
});

function buildRequestMeta(req: any, extra: Record<string, unknown> = {}) {
  return {
    ip: String(req.ip || ""),
    userAgent: String(req.headers["user-agent"] || ""),
    route: String(req.originalUrl || req.url || ""),
    ...extra,
  };
}

function toAuditPayload(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "object") return value;
  return value;
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function formatPendingCurrency(value: unknown) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

async function loadPendingNfseSummary(limit = 4) {
  const [countResult, listResult] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS total
      FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM nfse n WHERE n.pedido_id = o.id)
        AND o.canceled_at IS NULL
        AND o.refunded_at IS NULL
        AND (o.paid_at IS NOT NULL OR LOWER(COALESCE(o.status, '')) = 'paid')
      `
    ),
    query(
      `
      SELECT
        o.id,
        COALESCE(NULLIF(o.user_name, ''), NULLIF(o.user_email, ''), 'Pedido sem cliente') AS customer_name,
        COALESCE(NULLIF(o.order_number, ''), UPPER(LEFT(o.id::text, 8))) AS order_label,
        ROUND(COALESCE(o.total_cents, 0)::numeric / 100, 2) AS amount,
        COALESCE(o.paid_at, o.created_at) AS created_at
      FROM orders o
      WHERE NOT EXISTS (SELECT 1 FROM nfse n WHERE n.pedido_id = o.id)
        AND o.canceled_at IS NULL
        AND o.refunded_at IS NULL
        AND (o.paid_at IS NOT NULL OR LOWER(COALESCE(o.status, '')) = 'paid')
      ORDER BY COALESCE(o.paid_at, o.created_at) DESC
      LIMIT $1
      `,
      [limit]
    ),
  ]);

  return {
    key: "nfse_pending",
    label: "Pedidos sem nota",
    description: "Pedidos pagos aguardando emissão de NFS-e.",
    count: Number(countResult.rows?.[0]?.total || 0),
    targetPage: null,
    targetHref: "/admin/nfse",
    items: (listResult.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      title: String(row.customer_name || "Pedido sem cliente"),
      subtitle: `${String(row.order_label || "")} · ${formatPendingCurrency(row.amount)}`,
      createdAt: row.created_at || null,
      amount: Number(row.amount || 0),
    })),
  };
}

async function loadPendingBalanceSummary(limit = 4) {
  const result = await listBalanceRequests({ status: "pending", page: 1, limit });
  return {
    key: "balance_pending",
    label: "Saldo pendente",
    description: "Solicitações aguardando decisão da gerência ou diretoria.",
    count: Number(result.total || 0),
    targetPage: "diretoria",
    targetHref: null,
    items: (result.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      title: String(row.customerName || row.customerEmail || "Cliente"),
      subtitle: `${row.type === "debit" ? "Remover saldo" : "Adicionar saldo"} · ${formatPendingCurrency(row.amount)}`,
      createdAt: row.createdAt || null,
      amount: Number(row.amount || 0),
    })),
  };
}

async function loadGiftCardSuspiciousSummary(limit = 4) {
  const [countResult, listResult] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS total
      FROM admin_audit_logs
      WHERE entity_type = 'gift_card'
        AND action = 'security_alert'
        AND created_at >= NOW() - INTERVAL '7 days'
      `
    ),
    query(
      `
      SELECT id, summary, created_at
      FROM admin_audit_logs
      WHERE entity_type = 'gift_card'
        AND action = 'security_alert'
        AND created_at >= NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT $1
      `,
      [limit]
    ),
  ]);

  return {
    key: "gift_card_suspicious",
    label: "Gift cards suspeitos",
    description: "Alertas recentes de uso incomum ou abuso.",
    count: Number(countResult.rows?.[0]?.total || 0),
    targetPage: "gift_cards",
    targetHref: null,
    items: (listResult.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      title: "Atividade suspeita em gift card",
      subtitle: String(row.summary || "Tentativa incomum detectada."),
      createdAt: row.created_at || null,
    })),
  };
}

async function loadSecurityAlertsSummary(limit = 4) {
  const result = await listOpsAuditLogs({
    includedActions: ["ADMIN_SUSPICIOUS_LOGIN", "ADMIN_SUSPICIOUS_ACCESS"],
    page: 1,
    limit,
  });
  return {
    key: "security_alerts",
    label: "Alertas de segurança",
    description: "Logins ou acessos administrativos marcados como suspeitos.",
    count: Number(result.total || 0),
    targetPage: "diretoria",
    targetHref: null,
    items: (result.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      title: row.action === "ADMIN_SUSPICIOUS_LOGIN" ? "Login suspeito" : "Acesso suspeito",
      subtitle: String(row.performerEmail || row.performerName || "Admin não identificado"),
      createdAt: row.createdAt || null,
    })),
  };
}

async function loadPendingRepairsSummary(limit = 4) {
  const statuses = ["pending", "awaiting_shipment", "item_received", "in_repair"];
  const [countResult, listResult] = await Promise.all([
    query(
      `
      SELECT COUNT(*)::int AS total
      FROM repair_requests
      WHERE status = ANY($1::text[])
      `,
      [statuses]
    ),
    query(
      `
      SELECT id, user_name, piece_name, status, created_at
      FROM repair_requests
      WHERE status = ANY($1::text[])
      ORDER BY created_at DESC
      LIMIT $2
      `,
      [statuses, limit]
    ),
  ]);

  return {
    key: "repairs_pending",
    label: "Reparos pendentes",
    description: "Solicitações de reparo ainda em andamento.",
    count: Number(countResult.rows?.[0]?.total || 0),
    targetPage: "reparos",
    targetHref: null,
    items: (listResult.rows || []).map((row: any) => ({
      id: String(row.id || ""),
      title: String(row.user_name || "Cliente sem nome"),
      subtitle: `${String(row.piece_name || "Peça sem nome")} · ${String(row.status || "pendente")}`,
      createdAt: row.created_at || null,
    })),
  };
}

async function loadRecentNfseFailures(limit = 5) {
  const result = await query(
    `
    SELECT
      id,
      pedido_id,
      COALESCE(NULLIF(tomador_nome, ''), 'Cliente não informado') AS tomador_nome,
      COALESCE(NULLIF(erro_mensagem, ''), 'Falha sem detalhe') AS erro_mensagem,
      tentativas,
      COALESCE(updated_at, created_at) AS happened_at
    FROM nfse
    WHERE status = 'erro'
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT $1
    `,
    [limit]
  );

  return (result.rows || []).map((row: any) => ({
    id: String(row.id || ""),
    pedidoId: String(row.pedido_id || ""),
    customerName: String(row.tomador_nome || "Cliente não informado"),
    message: String(row.erro_mensagem || "Falha sem detalhe"),
    attempts: Number(row.tentativas || 0),
    happenedAt: row.happened_at || null,
  }));
}

async function loadCriticalAlerts(limit = 5) {
  const result = await listOpsAuditLogs({
    includedActions: ["ADMIN_SUSPICIOUS_LOGIN", "ADMIN_SUSPICIOUS_ACCESS", "BALANCE_REJECTED", "BALANCE_APPROVED"],
    page: 1,
    limit,
  });

  return (result.rows || []).map((row: any) => ({
    id: String(row.id || ""),
    action: String(row.action || ""),
    title:
      row.action === "ADMIN_SUSPICIOUS_LOGIN"
        ? "Login suspeito"
        : row.action === "ADMIN_SUSPICIOUS_ACCESS"
          ? "Acesso suspeito"
          : row.action === "BALANCE_REJECTED"
            ? "Solicitação de saldo rejeitada"
            : row.action === "BALANCE_APPROVED"
              ? "Solicitação de saldo aprovada"
              : String(row.action || "Evento crítico"),
    subtitle: String(row.performerEmail || row.performerName || "Admin não identificado"),
    createdAt: row.createdAt || null,
  }));
}

function mapAdminRowForUi(admin: any) {
  return {
    id: String(admin.id || ""),
    userId: admin.userId || null,
    name: String(admin.name || "").trim(),
    nickname: String(admin.nickname || "").trim(),
    email: String(admin.email || "").trim(),
    role: String(admin.role || "admin"),
    isActive: Boolean(admin.isActive),
    createdBy: admin.createdBy || null,
    createdByEmail: admin.createdByEmail || null,
    createdByName: admin.createdByName || null,
    permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
    createdAt: admin.createdAt || null,
    updatedAt: admin.updatedAt || null,
  };
}

function mapBalanceRequestForUi(row: any) {
  const amount = Number(row.amount || 0);
  const rawCustomerWalletCents = Number(row.customerWalletCents || 0);
  const amountCents = Math.round(amount * 100);
  const normalizedStatus = String(row.status || "pending").trim().toLowerCase();
  const isDebit = row.type === "debit";

  let customerWalletCents = rawCustomerWalletCents;
  let resultingBalanceCents = isDebit
    ? rawCustomerWalletCents - amountCents
    : rawCustomerWalletCents + amountCents;

  // After approval, `customerWalletCents` coming from the DB already reflects the
  // applied balance. For the review UI we keep showing the historical "before -> after"
  // snapshot so the row does not look like the request could be applied twice.
  if (normalizedStatus === "approved") {
    customerWalletCents = isDebit
      ? rawCustomerWalletCents + amountCents
      : rawCustomerWalletCents - amountCents;
    resultingBalanceCents = rawCustomerWalletCents;
  }

  return {
    id: String(row.id || ""),
    requestedBy: row.requestedBy || "",
    requesterEmail: row.requesterEmail || null,
    requesterName: row.requesterName || null,
    customerId: row.customerId || "",
    customerEmail: row.customerEmail || null,
    customerName: row.customerName || null,
    customerWalletCents,
    type: row.type || "credit",
    amount,
    reason: row.reason || "manual_adjustment",
    reasonDetail: row.reasonDetail || null,
    relatedOrderId: row.relatedOrderId || null,
    internalNote: row.internalNote || null,
    status: row.status || "pending",
    reviewedBy: row.reviewedBy || null,
    reviewerEmail: row.reviewerEmail || null,
    reviewerName: row.reviewerName || null,
    reviewedAt: row.reviewedAt || null,
    rejectionReason: row.rejectionReason || null,
    createdAt: row.createdAt || null,
    resultingBalanceCents,
  };
}

async function recordGovernanceAudit(req: any, payload: {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}) {
  if (!req.admin?.id) return null;
  return insertOpsAuditLog({
    action: payload.action,
    performedBy: req.admin.id,
    targetType: payload.targetType || null,
    targetId: payload.targetId || null,
    beforeState: toAuditPayload(payload.beforeState),
    afterState: toAuditPayload(payload.afterState),
    metadata: buildRequestMeta(req, payload.metadata || {}),
  });
}

adminGovernanceRouter.get("/diretoria/admins", requireRole(["director", "superadmin"]), async (_req: any, res: any) => {
  try {
    const rows = await listAdminAccess();
    return res.json({ rows: rows.map(mapAdminRowForUi) });
  } catch {
    return res.status(500).json({ error: "ADMIN_LIST_FAILED" });
  }
});

adminGovernanceRouter.post("/diretoria/admins", requireRole(["director", "superadmin"]), requireAdminStepUp("mfa", "admin_create"), async (req: any, res: any) => {
  const parsed = adminCreateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const desiredRole = parsed.data.role;
  const actorRole = String(req.admin?.role || "admin");
  if (desiredRole === "superadmin" && actorRole !== "superadmin") {
    return res.status(403).json({ error: "SUPERADMIN_CREATE_FORBIDDEN" });
  }

  try {
    const created = await createAdminAccess({
      email: parsed.data.email,
      role: desiredRole,
      createdBy: req.admin?.id || null,
    });
    if (!created) return res.status(500).json({ error: "ADMIN_CREATE_FAILED" });
    const permissions = await replaceAdminPermissions(created.id, parsed.data.modules || [], req.admin?.id || "");
    const after = await findAdminAccessById(created.id);

    await recordGovernanceAudit(req, {
      action: "ADMIN_CREATED",
      targetType: "admin",
      targetId: created.id,
      beforeState: null,
      afterState: {
        ...mapAdminRowForUi(after || created),
        permissions,
      },
    });

    return res.status(201).json({ ok: true, admin: mapAdminRowForUi(after || created), permissions });
  } catch {
    return res.status(500).json({ error: "ADMIN_CREATE_FAILED" });
  }
});

adminGovernanceRouter.patch("/diretoria/admins/:id/role", requireRole(["director", "superadmin"]), requireAdminStepUp("mfa", "admin_role_update"), async (req: any, res: any) => {
  const parsed = adminRoleUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await findAdminAccessById(String(req.params.id || "").trim());
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    if (before.role === "superadmin") {
      return res.status(403).json({ error: "SUPERADMIN_PROTECTED" });
    }

    const actorRole = String(req.admin?.role || "admin");
    if (parsed.data.role === "superadmin" && actorRole !== "superadmin") {
      return res.status(403).json({ error: "SUPERADMIN_CREATE_FORBIDDEN" });
    }
    if (before.id === req.admin?.id && parsed.data.role !== before.role) {
      return res.status(403).json({ error: "SELF_ROLE_CHANGE_FORBIDDEN" });
    }

    const after = await setAdminAccessRole(before.id, parsed.data.role);

    await recordGovernanceAudit(req, {
      action: "ADMIN_ROLE_UPDATED",
      targetType: "admin",
      targetId: before.id,
      beforeState: { role: before.role },
      afterState: { role: after?.role ?? parsed.data.role },
    });

    return res.json({ ok: true, admin: after ? mapAdminRowForUi(after) : null });
  } catch {
    return res.status(500).json({ error: "ADMIN_ROLE_UPDATE_FAILED" });
  }
});

adminGovernanceRouter.patch("/diretoria/admins/:id/permissions", requireRole(["director", "superadmin"]), requireAdminStepUp("mfa", "admin_permissions_update"), async (req: any, res: any) => {
  const parsed = adminPermissionsSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await findAdminAccessById(String(req.params.id || "").trim());
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    if (before.role === "superadmin") {
      return res.status(403).json({ error: "SUPERADMIN_PROTECTED" });
    }

    const permissions = await replaceAdminPermissions(before.id, parsed.data.modules, req.admin?.id || "");
    const after = await findAdminAccessById(before.id);

    await recordGovernanceAudit(req, {
      action: "ADMIN_PERMISSIONS_UPDATED",
      targetType: "admin",
      targetId: before.id,
      beforeState: { permissions: before.permissions },
      afterState: { permissions },
    });

    return res.json({ ok: true, permissions, admin: after ? mapAdminRowForUi(after) : null });
  } catch {
    return res.status(500).json({ error: "ADMIN_PERMISSIONS_UPDATE_FAILED" });
  }
});

adminGovernanceRouter.patch("/diretoria/admins/:id/status", requireRole(["director", "superadmin"]), requireAdminStepUp("mfa", "admin_status_update"), async (req: any, res: any) => {
  const parsed = adminStatusSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await findAdminAccessById(String(req.params.id || "").trim());
    if (!before) return res.status(404).json({ error: "NOT_FOUND" });
    if (before.role === "superadmin") {
      return res.status(403).json({ error: "SUPERADMIN_PROTECTED" });
    }
    if (!parsed.data.isActive && before.id === req.admin?.id) {
      return res.status(403).json({ error: "SELF_DEACTIVATION_FORBIDDEN" });
    }

    const after = await setAdminAccessStatus(before.id, parsed.data.isActive);
    await recordGovernanceAudit(req, {
      action: "ADMIN_STATUS_UPDATED",
      targetType: "admin",
      targetId: before.id,
      beforeState: { isActive: before.isActive },
      afterState: { isActive: after?.isActive ?? before.isActive },
    });

    return res.json({ ok: true, admin: after ? mapAdminRowForUi(after) : null });
  } catch {
    return res.status(500).json({ error: "ADMIN_STATUS_UPDATE_FAILED" });
  }
});

adminGovernanceRouter.get("/balance/customers", requirePermission("balance"), async (req: any, res: any) => {
  try {
    const rows = await searchBalanceCustomers(String(req.query.query || ""), Number(req.query.limit || 20));
    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "BALANCE_CUSTOMER_SEARCH_FAILED" });
  }
});

adminGovernanceRouter.get("/balance/customers/:id", requirePermission("balance"), async (req: any, res: any) => {
  try {
    const customer = await getBalanceCustomerById(String(req.params.id || "").trim());
    if (!customer) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ customer });
  } catch {
    return res.status(500).json({ error: "BALANCE_CUSTOMER_FETCH_FAILED" });
  }
});

adminGovernanceRouter.get("/balance/customers/:id/orders", requirePermission("balance"), async (req: any, res: any) => {
  try {
    const customerId = String(req.params.id || "").trim();
    const customer = await getBalanceCustomerById(customerId);
    if (!customer) return res.status(404).json({ error: "NOT_FOUND" });
    const orders = await listOrdersByUserId(customerId);
    return res.json({
      orders: orders.map((order: any) => ({
        id: String(order.id || ""),
        orderNumber: String(order.orderNumber || ""),
        createdAt: order.createdAt || null,
        status: String(order.status || ""),
        currency: String(order.currency || "brl"),
        amount: Number(order.amount || 0),
        userId: String(order.userId || ""),
        productName: String(order.items?.[0]?.name || order.shippingSelectedService || "Pedido sem item").trim(),
      })),
      count: orders.length,
    });
  } catch {
    return res.status(500).json({ error: "BALANCE_CUSTOMER_ORDERS_FETCH_FAILED" });
  }
});

adminGovernanceRouter.get("/balance/customers/:id/history", requirePermission("balance"), async (req: any, res: any) => {
  try {
    const customerId = String(req.params.id || "").trim();
    const customer = await getBalanceCustomerById(customerId);
    if (!customer) return res.status(404).json({ error: "NOT_FOUND" });
    const rows = await listBalanceHistoryByCustomerId(customerId, Number(req.query.limit || 12));
    return res.json({ rows });
  } catch {
    return res.status(500).json({ error: "BALANCE_CUSTOMER_HISTORY_FETCH_FAILED" });
  }
});

adminGovernanceRouter.post("/balance/requests", requirePermission("balance"), async (req: any, res: any) => {
  const parsed = balanceRequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const customer = await getBalanceCustomerById(parsed.data.customerId);
    if (!customer) return res.status(404).json({ error: "CUSTOMER_NOT_FOUND" });

    const created = await createBalanceRequest({
      requestedBy: req.admin?.id || "",
      customerId: parsed.data.customerId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      reasonDetail: parsed.data.reasonDetail || null,
      relatedOrderId: parsed.data.relatedOrderId || null,
      internalNote: parsed.data.internalNote || null,
    });
    if (!created) return res.status(500).json({ error: "BALANCE_REQUEST_CREATE_FAILED" });

    const privilegedAdmins = await listPrivilegedAdmins();
    await createAdminNotifications(
      privilegedAdmins.map((entry: any) => String(entry.id || "")),
      {
        type: "balance_pending",
        title: "Nova aprovação de saldo pendente",
        message: `Solicitação de ${created.type === "debit" ? "débito" : "crédito"} para ${customer.name || customer.email}.`,
        referenceId: created.id,
      }
    );

    await recordGovernanceAudit(req, {
      action: "BALANCE_REQUESTED",
      targetType: "balance_request",
      targetId: created.id,
      beforeState: null,
      afterState: mapBalanceRequestForUi(created),
    });

    return res.status(201).json({ ok: true, request: mapBalanceRequestForUi(created) });
  } catch {
    return res.status(500).json({ error: "BALANCE_REQUEST_CREATE_FAILED" });
  }
});

adminGovernanceRouter.get("/balance/requests/mine", requirePermission("balance"), async (req: any, res: any) => {
  try {
    const rows = await listBalanceRequestsByRequester(req.admin?.id || "");
    return res.json({ rows: rows.map(mapBalanceRequestForUi) });
  } catch {
    return res.status(500).json({ error: "BALANCE_REQUEST_LIST_FAILED" });
  }
});

adminGovernanceRouter.get("/diretoria/balance/requests", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  try {
    const result = await listBalanceRequests({
      requestedBy: String(req.query.requested_by || ""),
      status: String(req.query.status || ""),
      dateFrom: String(req.query.date_from || ""),
      dateTo: String(req.query.date_to || ""),
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 50),
    });
    return res.json({
      rows: result.rows.map(mapBalanceRequestForUi),
      total: result.total,
      page: result.page,
      limit: result.limit,
    });
  } catch {
    return res.status(500).json({ error: "BALANCE_REVIEW_LIST_FAILED" });
  }
});

adminGovernanceRouter.get("/pending-summary", async (req: any, res: any) => {
  try {
    const role = String(req.admin?.role || "admin");
    const sections = [
      await loadPendingNfseSummary(),
      await loadPendingRepairsSummary(),
      await loadGiftCardSuspiciousSummary(),
    ];

    if (role === "director" || role === "superadmin") {
      sections.splice(1, 0, await loadPendingBalanceSummary());
      sections.push(await loadSecurityAlertsSummary());
    }

    return res.json({
      totalCount: sections.reduce((sum: number, section: any) => sum + Number(section.count || 0), 0),
      updatedAt: new Date().toISOString(),
      sections,
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_PENDING_SUMMARY_FAILED" });
  }
});

adminGovernanceRouter.get("/status-overview", async (req: any, res: any) => {
  try {
    const role = String(req.admin?.role || "admin");
    const isPrivileged = role === "director" || role === "superadmin";

    const [nfsePending, repairsPending, suspiciousGiftCards, balancePending, nfseFailures, criticalAlerts] = await Promise.all([
      loadPendingNfseSummary(4),
      loadPendingRepairsSummary(4),
      loadGiftCardSuspiciousSummary(4),
      isPrivileged ? loadPendingBalanceSummary(4) : Promise.resolve(null),
      loadRecentNfseFailures(5),
      isPrivileged ? loadCriticalAlerts(5) : Promise.resolve([]),
    ]);

    const blingConfigured = Boolean(
      process.env.BLING_CLIENT_ID &&
      process.env.BLING_CLIENT_SECRET &&
      process.env.BLING_REFRESH_TOKEN &&
      process.env.BLING_CNPJ_PRESTADOR
    );
    const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

    return res.json({
      updatedAt: new Date().toISOString(),
      services: {
        bling: {
          configured: blingConfigured,
          label: blingConfigured ? "Bling configurado" : "Bling incompleto",
          description: blingConfigured
            ? "Credenciais e CNPJ do prestador disponíveis para o emissor."
            : "Faltam credenciais, refresh token ou CNPJ do prestador.",
        },
        resend: {
          configured: resendConfigured,
          label: resendConfigured ? "Resend configurado" : "Resend incompleto",
          description: resendConfigured
            ? "Envio de e-mail habilitado para notas e avisos."
            : "Faltam chave da Resend ou remetente padrão.",
        },
      },
      queues: [
        { key: nfsePending.key, label: nfsePending.label, count: nfsePending.count, description: nfsePending.description },
        ...(balancePending
          ? [{ key: balancePending.key, label: balancePending.label, count: balancePending.count, description: balancePending.description }]
          : []),
        { key: suspiciousGiftCards.key, label: suspiciousGiftCards.label, count: suspiciousGiftCards.count, description: suspiciousGiftCards.description },
        { key: repairsPending.key, label: repairsPending.label, count: repairsPending.count, description: repairsPending.description },
      ],
      nfseFailures,
      criticalAlerts,
    });
  } catch {
    return res.status(500).json({ error: "ADMIN_STATUS_OVERVIEW_FAILED" });
  }
});

adminGovernanceRouter.get("/diretoria/balance/requests/:id", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  try {
    const requestRow = await findBalanceRequestById(String(req.params.id || "").trim());
    if (!requestRow) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ request: mapBalanceRequestForUi(requestRow) });
  } catch {
    return res.status(500).json({ error: "BALANCE_REVIEW_FETCH_FAILED" });
  }
});

adminGovernanceRouter.post(
  "/diretoria/balance/requests/:id/approve",
  requireRole(["director", "superadmin"]),
  requireAdminStepUp(async (req: any) => {
    const requestRow = await findBalanceRequestById(String(req.params.id || "").trim());
    if (!requestRow) return "mfa";
    const amount = Number(requestRow.amount || 0);
    if (amount > 1000 || requestRow.relatedOrderId) return "mfa";
    return "password";
  }, "balance_approve"),
  async (req: any, res: any) => {
  try {
    const before = await findBalanceRequestById(String(req.params.id || "").trim());
    const result = await approveBalanceRequest(String(req.params.id || "").trim(), req.admin?.id || "");
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: result.error });
      if (result.error === "INSUFFICIENT_CUSTOMER_BALANCE") return res.status(409).json({ error: result.error });
      if (result.error === "REQUEST_ALREADY_REVIEWED") return res.status(409).json({ error: result.error });
      return res.status(400).json({ error: result.error });
    }

    const after = result.request ? mapBalanceRequestForUi(result.request) : null;
    await recordGovernanceAudit(req, {
      action: "BALANCE_APPROVED",
      targetType: "balance_request",
      targetId: before?.id || null,
      beforeState: {
        request: before ? mapBalanceRequestForUi(before) : null,
        customerWalletCents: result.beforeBalanceCents,
      },
      afterState: {
        request: after,
        customerWalletCents: result.afterBalanceCents,
      },
    });

    if (result.request?.requestedBy) {
      await createAdminNotifications([String(result.request.requestedBy)], {
        type: "balance_approved",
        title: "Solicitação de saldo aprovada",
        message: `Sua solicitação de ${result.request.type === "debit" ? "débito" : "crédito"} foi aprovada.`,
        referenceId: result.request.id,
      });
    }

    return res.json({
      ok: true,
      request: after,
      beforeBalanceCents: result.beforeBalanceCents,
      afterBalanceCents: result.afterBalanceCents,
    });
  } catch {
    return res.status(500).json({ error: "BALANCE_APPROVE_FAILED" });
  }
});

adminGovernanceRouter.post("/diretoria/balance/requests/:id/reject", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  const parsed = balanceRejectSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const before = await findBalanceRequestById(String(req.params.id || "").trim());
    const result = await rejectBalanceRequest(String(req.params.id || "").trim(), req.admin?.id || "", parsed.data.rejectionReason);
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: result.error });
      if (result.error === "REQUEST_ALREADY_REVIEWED") return res.status(409).json({ error: result.error });
      return res.status(400).json({ error: result.error });
    }

    const after = result.request ? mapBalanceRequestForUi(result.request) : null;
    await recordGovernanceAudit(req, {
      action: "BALANCE_REJECTED",
      targetType: "balance_request",
      targetId: before?.id || null,
      beforeState: before ? mapBalanceRequestForUi(before) : null,
      afterState: after,
    });

    if (result.request?.requestedBy) {
      await createAdminNotifications([String(result.request.requestedBy)], {
        type: "balance_rejected",
        title: "Solicitação de saldo rejeitada",
        message: `Sua solicitação foi rejeitada. Motivo: ${parsed.data.rejectionReason}`,
        referenceId: result.request.id,
      });
    }

    return res.json({ ok: true, request: after });
  } catch {
    return res.status(500).json({ error: "BALANCE_REJECT_FAILED" });
  }
});

adminGovernanceRouter.get("/notifications", async (req: any, res: any) => {
  try {
    const result = await listAdminNotifications(req.admin?.id || "", Number(req.query.limit || 20));
    return res.json(result);
  } catch {
    return res.status(500).json({ error: "ADMIN_NOTIFICATIONS_LIST_FAILED" });
  }
});

adminGovernanceRouter.patch("/notifications/:id/read", async (req: any, res: any) => {
  try {
    const notification = await markAdminNotificationRead(req.admin?.id || "", String(req.params.id || "").trim());
    if (!notification) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ ok: true, notification });
  } catch {
    return res.status(500).json({ error: "ADMIN_NOTIFICATION_READ_FAILED" });
  }
});

adminGovernanceRouter.patch("/notifications/read-all", async (req: any, res: any) => {
  try {
    const count = await markAllAdminNotificationsRead(req.admin?.id || "");
    return res.json({ ok: true, count });
  } catch {
    return res.status(500).json({ error: "ADMIN_NOTIFICATIONS_READ_ALL_FAILED" });
  }
});

adminGovernanceRouter.get("/diretoria/audit-logs", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  try {
    const securityOnly = String(req.query.security_only || "").trim().toLowerCase() === "true";
    const excludedActions = String(req.admin?.role || "") === "superadmin"
      ? []
      : ["ADMIN_SUSPICIOUS_LOGIN", "ADMIN_SUSPICIOUS_ACCESS"];
    const result = await listOpsAuditLogs({
      action: String(req.query.action || ""),
      performedBy: String(req.query.performed_by || ""),
      targetType: String(req.query.target_type || ""),
      includedActions: securityOnly ? SECURITY_AUDIT_ACTIONS : [],
      excludedActions,
      dateFrom: String(req.query.date_from || ""),
      dateTo: String(req.query.date_to || ""),
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 50),
    });

    if (String(req.query.export || "").trim().toLowerCase() === "csv") {
      const header = [
        "timestamp",
        "admin",
        "action",
        "target_type",
        "target_id",
        "before_state",
        "after_state",
      ];
      const lines = [header.join(",")];
      result.rows.forEach((row: any) => {
        lines.push(
          [
            row.createdAt || "",
            row.performerEmail || row.performerName || "",
            row.action || "",
            row.targetType || "",
            row.targetId || "",
            JSON.stringify(row.beforeState || {}),
            JSON.stringify(row.afterState || {}),
          ].map(csvEscape).join(",")
        );
      });
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", `attachment; filename=\"audit-logs-${new Date().toISOString().slice(0, 10)}.csv\"`);
      return res.send(lines.join("\n"));
    }

    return res.json(result);
  } catch {
    return res.status(500).json({ error: "AUDIT_LOGS_LIST_FAILED" });
  }
});

module.exports = {
  adminGovernanceRouter,
};
