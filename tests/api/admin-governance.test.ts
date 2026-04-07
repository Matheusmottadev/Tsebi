import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import "./helpers/resolve-ts-require";

const requireCjs = createRequire(import.meta.url);
const moduleLib = requireCjs("module");
const originalLoad = moduleLib._load;

const mocked = vi.hoisted(() => ({
  currentAdmin: {
    id: "director-1",
    email: "director@tsebi.com.br",
    role: "director",
    permissions: [] as string[],
  },
  listAdminAccess: vi.fn(),
  findAdminAccessById: vi.fn(),
  createAdminAccess: vi.fn(),
  replaceAdminPermissions: vi.fn(),
  setAdminAccessStatus: vi.fn(),
  listPrivilegedAdmins: vi.fn(),
  getBalanceCustomerById: vi.fn(),
  searchBalanceCustomers: vi.fn(),
  createBalanceRequest: vi.fn(),
  listBalanceRequestsByRequester: vi.fn(),
  listBalanceRequests: vi.fn(),
  findBalanceRequestById: vi.fn(),
  approveBalanceRequest: vi.fn(),
  rejectBalanceRequest: vi.fn(),
  createAdminNotifications: vi.fn(),
  listAdminNotifications: vi.fn(),
  markAdminNotificationRead: vi.fn(),
  markAllAdminNotificationsRead: vi.fn(),
  insertOpsAuditLog: vi.fn(),
  listOpsAuditLogs: vi.fn(),
}));

vi.mock("../../server/lib/admin-access-repository", () => ({
  listAdminAccess: mocked.listAdminAccess,
  findAdminAccessById: mocked.findAdminAccessById,
  createAdminAccess: mocked.createAdminAccess,
  replaceAdminPermissions: mocked.replaceAdminPermissions,
  setAdminAccessStatus: mocked.setAdminAccessStatus,
  listPrivilegedAdmins: mocked.listPrivilegedAdmins,
}));

vi.mock("../../server/lib/balance-request-repository", () => ({
  getBalanceCustomerById: mocked.getBalanceCustomerById,
  searchBalanceCustomers: mocked.searchBalanceCustomers,
  createBalanceRequest: mocked.createBalanceRequest,
  listBalanceRequestsByRequester: mocked.listBalanceRequestsByRequester,
  listBalanceRequests: mocked.listBalanceRequests,
  findBalanceRequestById: mocked.findBalanceRequestById,
  approveBalanceRequest: mocked.approveBalanceRequest,
  rejectBalanceRequest: mocked.rejectBalanceRequest,
}));

vi.mock("../../server/lib/admin-notifications-repository", () => ({
  createAdminNotifications: mocked.createAdminNotifications,
  listAdminNotifications: mocked.listAdminNotifications,
  markAdminNotificationRead: mocked.markAdminNotificationRead,
  markAllAdminNotificationsRead: mocked.markAllAdminNotificationsRead,
}));

vi.mock("../../server/lib/ops-audit-repository", () => ({
  insertOpsAuditLog: mocked.insertOpsAuditLog,
  listOpsAuditLogs: mocked.listOpsAuditLogs,
}));

type GovernanceRouterModule = {
  adminGovernanceRouter: express.Router;
};

let adminGovernanceRouter: express.Router;

function makeAdmin(overrides: Partial<typeof mocked.currentAdmin> = {}) {
  return {
    id: "director-1",
    email: "director@tsebi.com.br",
    role: "director",
    permissions: [] as string[],
    ...overrides,
  };
}

function makeAdminRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    userId: "user-1",
    name: "Admin One",
    nickname: "",
    email: "admin@tsebi.com.br",
    role: "admin",
    isActive: true,
    createdBy: "director-1",
    createdByEmail: "director@tsebi.com.br",
    createdByName: "Diretoria",
    permissions: ["balance"],
    createdAt: "2026-04-07T10:00:00.000Z",
    updatedAt: "2026-04-07T10:00:00.000Z",
    ...overrides,
  };
}

function makeBalanceRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1",
    requestedBy: "admin-1",
    requesterEmail: "admin@tsebi.com.br",
    requesterName: "Admin One",
    customerId: "customer-1",
    customerEmail: "customer@tsebi.com.br",
    customerName: "Cliente Teste",
    customerWalletCents: 25000,
    type: "credit",
    amount: 150,
    reason: "manual_adjustment",
    reasonDetail: null,
    relatedOrderId: null,
    internalNote: "observacao",
    status: "pending",
    reviewedBy: null,
    reviewerEmail: null,
    reviewerName: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: "2026-04-07T10:30:00.000Z",
    ...overrides,
  };
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.admin = { ...mocked.currentAdmin };
    next();
  });
  app.use("/api/admin", adminGovernanceRouter);
  return app;
}

beforeAll(() => {
  moduleLib._load = function patchedLoad(request: string, parent: { filename?: string } | undefined, isMain: boolean) {
    if (request === "./lib/admin-access-repository") {
      return {
        listAdminAccess: mocked.listAdminAccess,
        findAdminAccessById: mocked.findAdminAccessById,
        createAdminAccess: mocked.createAdminAccess,
        replaceAdminPermissions: mocked.replaceAdminPermissions,
        setAdminAccessStatus: mocked.setAdminAccessStatus,
        listPrivilegedAdmins: mocked.listPrivilegedAdmins,
      };
    }

    if (request === "./lib/balance-request-repository") {
      return {
        getBalanceCustomerById: mocked.getBalanceCustomerById,
        searchBalanceCustomers: mocked.searchBalanceCustomers,
        createBalanceRequest: mocked.createBalanceRequest,
        listBalanceRequestsByRequester: mocked.listBalanceRequestsByRequester,
        listBalanceRequests: mocked.listBalanceRequests,
        findBalanceRequestById: mocked.findBalanceRequestById,
        approveBalanceRequest: mocked.approveBalanceRequest,
        rejectBalanceRequest: mocked.rejectBalanceRequest,
      };
    }

    if (request === "./lib/admin-notifications-repository") {
      return {
        createAdminNotifications: mocked.createAdminNotifications,
        listAdminNotifications: mocked.listAdminNotifications,
        markAdminNotificationRead: mocked.markAdminNotificationRead,
        markAllAdminNotificationsRead: mocked.markAllAdminNotificationsRead,
      };
    }

    if (request === "./lib/ops-audit-repository") {
      return {
        insertOpsAuditLog: mocked.insertOpsAuditLog,
        listOpsAuditLogs: mocked.listOpsAuditLogs,
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  const moduleValue = requireCjs("../../server/admin-governance") as GovernanceRouterModule;
  adminGovernanceRouter = moduleValue.adminGovernanceRouter;
});

afterAll(() => {
  moduleLib._load = originalLoad;
});

beforeEach(() => {
  mocked.currentAdmin = makeAdmin();
  mocked.listAdminAccess.mockReset();
  mocked.findAdminAccessById.mockReset();
  mocked.createAdminAccess.mockReset();
  mocked.replaceAdminPermissions.mockReset();
  mocked.setAdminAccessStatus.mockReset();
  mocked.listPrivilegedAdmins.mockReset();
  mocked.getBalanceCustomerById.mockReset();
  mocked.searchBalanceCustomers.mockReset();
  mocked.createBalanceRequest.mockReset();
  mocked.listBalanceRequestsByRequester.mockReset();
  mocked.listBalanceRequests.mockReset();
  mocked.findBalanceRequestById.mockReset();
  mocked.approveBalanceRequest.mockReset();
  mocked.rejectBalanceRequest.mockReset();
  mocked.createAdminNotifications.mockReset();
  mocked.listAdminNotifications.mockReset();
  mocked.markAdminNotificationRead.mockReset();
  mocked.markAllAdminNotificationsRead.mockReset();
  mocked.insertOpsAuditLog.mockReset();
  mocked.listOpsAuditLogs.mockReset();
  mocked.insertOpsAuditLog.mockResolvedValue({ id: "audit-1" });
});

describe("admin governance router", () => {
  it("blocks Diretoria routes for regular admins", async () => {
    mocked.currentAdmin = makeAdmin({ role: "admin", permissions: ["balance"] });
    const app = buildApp();

    const response = await request(app).get("/api/admin/diretoria/admins");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ADMIN_ROLE_FORBIDDEN");
  });

  it("lists admins for directors", async () => {
    mocked.listAdminAccess.mockResolvedValue([makeAdminRow()]);
    const app = buildApp();

    const response = await request(app).get("/api/admin/diretoria/admins");

    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].email).toBe("admin@tsebi.com.br");
  });

  it("blocks balance requests without module permission", async () => {
    mocked.currentAdmin = makeAdmin({ role: "admin", permissions: ["orders"] });
    const app = buildApp();

    const response = await request(app).post("/api/admin/balance/requests").send({
      customerId: "8be2f456-760f-4785-b871-7861418760de",
      type: "credit",
      amount: 150,
      reason: "manual_adjustment",
    });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ADMIN_PERMISSION_FORBIDDEN");
  });

  it("requires reason detail when reason is other", async () => {
    mocked.currentAdmin = makeAdmin({ role: "admin", permissions: ["balance"] });
    const app = buildApp();

    const response = await request(app).post("/api/admin/balance/requests").send({
      customerId: "8be2f456-760f-4785-b871-7861418760de",
      type: "credit",
      amount: 150,
      reason: "other",
      reasonDetail: "",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_INPUT");
  });

  it("creates a pending balance request, notification, and audit log", async () => {
    mocked.currentAdmin = makeAdmin({ id: "admin-balance", role: "admin", permissions: ["balance"] });
    mocked.getBalanceCustomerById.mockResolvedValue({
      id: "customer-1",
      name: "Cliente Teste",
      email: "customer@tsebi.com.br",
      phone: "11999999999",
      walletCents: 25000,
      createdAt: "2026-04-01T10:00:00.000Z",
    });
    mocked.createBalanceRequest.mockResolvedValue(makeBalanceRequest({
      id: "req-created",
      requestedBy: "admin-balance",
      type: "credit",
      amount: 150,
    }));
    mocked.listPrivilegedAdmins.mockResolvedValue([
      makeAdminRow({ id: "director-1", role: "director", permissions: [] }),
      makeAdminRow({ id: "superadmin-1", role: "superadmin", permissions: [] }),
    ]);

    const app = buildApp();
    const response = await request(app).post("/api/admin/balance/requests").send({
      customerId: "8be2f456-760f-4785-b871-7861418760de",
      type: "credit",
      amount: 150,
      reason: "manual_adjustment",
      internalNote: "Ajuste operacional",
    });

    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
    expect(mocked.createAdminNotifications).toHaveBeenCalledWith(
      ["director-1", "superadmin-1"],
      expect.objectContaining({
        type: "balance_pending",
        referenceId: "req-created",
      })
    );
    expect(mocked.insertOpsAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BALANCE_REQUESTED",
        performedBy: "admin-balance",
        targetId: "req-created",
      })
    );
  });

  it("protects superadmin status updates", async () => {
    mocked.findAdminAccessById.mockResolvedValue(makeAdminRow({
      id: "superadmin-1",
      role: "superadmin",
      email: "root@tsebi.com.br",
    }));
    const app = buildApp();

    const response = await request(app)
      .patch("/api/admin/diretoria/admins/superadmin-1/status")
      .send({ isActive: false });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("SUPERADMIN_PROTECTED");
  });

  it("blocks self-approval on balance review", async () => {
    mocked.findBalanceRequestById.mockResolvedValue(makeBalanceRequest());
    mocked.approveBalanceRequest.mockResolvedValue({ ok: false, error: "SELF_APPROVAL_FORBIDDEN" });
    const app = buildApp();

    const response = await request(app).post("/api/admin/diretoria/balance/requests/req-1/approve");

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("approves a request and notifies the requester", async () => {
    const before = makeBalanceRequest();
    const after = makeBalanceRequest({
      status: "approved",
      reviewedBy: "director-1",
      reviewerEmail: "director@tsebi.com.br",
      reviewerName: "Diretoria",
      reviewedAt: "2026-04-07T11:00:00.000Z",
    });
    mocked.findBalanceRequestById.mockResolvedValue(before);
    mocked.approveBalanceRequest.mockResolvedValue({
      ok: true,
      request: after,
      beforeBalanceCents: 25000,
      afterBalanceCents: 40000,
    });
    const app = buildApp();

    const response = await request(app).post("/api/admin/diretoria/balance/requests/req-1/approve");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.afterBalanceCents).toBe(40000);
    expect(mocked.createAdminNotifications).toHaveBeenCalledWith(
      ["admin-1"],
      expect.objectContaining({
        type: "balance_approved",
        referenceId: "req-1",
      })
    );
    expect(mocked.insertOpsAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "BALANCE_APPROVED",
        performedBy: "director-1",
      })
    );
  });

  it("lists notifications for the current admin", async () => {
    mocked.listAdminNotifications.mockResolvedValue({
      rows: [
        {
          id: "notif-1",
          adminId: "director-1",
          type: "balance_pending",
          title: "Nova aprovação",
          message: "Existe uma solicitação pendente.",
          referenceId: "req-1",
          read: false,
          createdAt: "2026-04-07T12:00:00.000Z",
        },
      ],
      unreadCount: 1,
    });
    const app = buildApp();

    const response = await request(app).get("/api/admin/notifications");

    expect(response.status).toBe(200);
    expect(response.body.unreadCount).toBe(1);
    expect(response.body.rows).toHaveLength(1);
  });

  it("exports audit logs as csv for directors", async () => {
    mocked.listOpsAuditLogs.mockResolvedValue({
      rows: [
        {
          id: "audit-1",
          action: "BALANCE_REQUESTED",
          performerEmail: "director@tsebi.com.br",
          performerName: "Diretoria",
          targetType: "balance_request",
          targetId: "req-1",
          beforeState: null,
          afterState: { status: "pending" },
          metadata: {},
          createdAt: "2026-04-07T12:30:00.000Z",
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    const app = buildApp();

    const response = await request(app).get("/api/admin/diretoria/audit-logs?export=csv");

    expect(response.status).toBe(200);
    expect(String(response.headers["content-type"] || "")).toContain("text/csv");
    expect(response.text).toContain("timestamp,admin,action,target_type,target_id,before_state,after_state");
    expect(response.text).toContain("BALANCE_REQUESTED");
  });
});
