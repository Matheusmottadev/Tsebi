const express = require("express");
const { z } = require("zod");
const { requireRole } = require("./middlewares/requireRole");
const { requirePermission } = require("./middlewares/requirePermission");
const {
  listAdminAccess,
  findAdminAccessById,
  createAdminAccess,
  replaceAdminPermissions,
  setAdminAccessStatus,
  listPrivilegedAdmins,
} = require("./lib/admin-access-repository");
const {
  getBalanceCustomerById,
  searchBalanceCustomers,
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

const adminGovernanceRouter = express.Router();

const adminRoleSchema = z.enum(["admin", "director", "superadmin"]);
const adminPermissionsSchema = z.object({
  modules: z.array(z.enum(["balance", "orders", "users", "products"])).max(10).default([]),
});
const adminCreateSchema = z.object({
  email: z.string().trim().email(),
  role: adminRoleSchema.default("admin"),
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
  const customerWalletCents = Number(row.customerWalletCents || 0);
  const amountCents = Math.round(amount * 100);
  const resultingBalanceCents = row.type === "debit"
    ? customerWalletCents - amountCents
    : customerWalletCents + amountCents;

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

adminGovernanceRouter.post("/diretoria/admins", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
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

    await recordGovernanceAudit(req, {
      action: "ADMIN_CREATED",
      targetType: "admin",
      targetId: created.id,
      beforeState: null,
      afterState: mapAdminRowForUi(created),
    });

    return res.status(201).json({ ok: true, admin: mapAdminRowForUi(created) });
  } catch {
    return res.status(500).json({ error: "ADMIN_CREATE_FAILED" });
  }
});

adminGovernanceRouter.patch("/diretoria/admins/:id/permissions", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
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

adminGovernanceRouter.patch("/diretoria/admins/:id/status", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
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

adminGovernanceRouter.get("/diretoria/balance/requests/:id", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  try {
    const requestRow = await findBalanceRequestById(String(req.params.id || "").trim());
    if (!requestRow) return res.status(404).json({ error: "NOT_FOUND" });
    return res.json({ request: mapBalanceRequestForUi(requestRow) });
  } catch {
    return res.status(500).json({ error: "BALANCE_REVIEW_FETCH_FAILED" });
  }
});

adminGovernanceRouter.post("/diretoria/balance/requests/:id/approve", requireRole(["director", "superadmin"]), async (req: any, res: any) => {
  try {
    const before = await findBalanceRequestById(String(req.params.id || "").trim());
    const result = await approveBalanceRequest(String(req.params.id || "").trim(), req.admin?.id || "");
    if (!result.ok) {
      if (result.error === "NOT_FOUND") return res.status(404).json({ error: result.error });
      if (result.error === "SELF_APPROVAL_FORBIDDEN") return res.status(403).json({ error: result.error });
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
    const result = await listOpsAuditLogs({
      action: String(req.query.action || ""),
      performedBy: String(req.query.performed_by || ""),
      targetType: String(req.query.target_type || ""),
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
