import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";
import { createRequire } from "node:module";
import "./helpers/resolve-ts-require";
import { createAuthenticatedAgent } from "./helpers/auth-agent";

const state = vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.VERCEL = "1";
  process.env.STRIPE_SECRET_KEY = "sk_test_mock";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.AUTH_LOGIN_EMAIL_CODE_REQUIRED = "false";

  const baseUser = {
    id: "user-1",
    title: "",
    name: "Test User",
    email: "user@example.com",
    phone: "11999999999",
    isGuest: false,
    createdVia: "register",
    loginDisabled: false,
    lastLoginAt: null,
    emailVerified: true,
    emailVerifiedAt: null,
    birthDate: "",
    cpf: "",
    cep: "",
    addresses: [],
    defaultAddressId: "",
    passwordHash: "hash",
    adminMfaEnabled: false,
    adminMfaSecretEnc: "",
    adminMfaRecoveryCodes: [],
    adminMfaEnabledAt: null,
    adminMfaDisabledAt: null,
    passwordResetRequired: false,
    createdAt: null,
    updatedAt: null,
  };

  const makeOrder = (overrides: Record<string, unknown> = {}) => {
    const now = new Date().toISOString();
    return {
      id: "order-generic",
      orderNumber: "PED-TEST0001",
      status: "pending_payment",
      currentStatus: "ORDER_PLACED",
      stockCommitted: false,
      createdAt: now,
      updatedAt: now,
      paymentMethod: "automatic",
      installments: 1,
      currency: "brl",
      amount: 11000,
      itemsAmount: 10000,
      shippingAmount: 1000,
      shippingPriceCents: 1000,
      shippingSelectedProvider: "",
      shippingSelectedService: "",
      shippingSelectedServiceCode: "",
      shippingSelectedCarrierName: "",
      shippingDeadlineDays: null,
      shippingDestinationZip: "01001000",
      shippingDeadline: null,
      adminNotes: "",
      trackingCode: "",
      trackingId: "",
      trackingStatus: "",
      carrier: "",
      lastTrackingUpdate: null,
      items: [
        {
          id: "sku-1",
          name: "Product sku-1",
          qty: 1,
          unitAmount: 10000,
          currency: "brl",
        },
      ],
      shipping: {
        shippingMethod: "standard",
        cep: "01001000",
      },
      userId: "user-1",
      userEmail: "user@example.com",
      userName: "Test User",
      stripePaymentIntentId: null,
      stripeRefundId: null,
      paidAt: null,
      shippedAt: null,
      deliveredAt: null,
      canceledAt: null,
      refundedAt: null,
      failureReason: null,
      cancellationReason: null,
      stockIssues: null,
      ...overrides,
    };
  };

  const runtimeState = {
    baseUser,
    orders: new Map<string, Record<string, unknown>>(),
    webhookEventIds: new Set<string>(),
    stripeCreateParams: [] as Array<Record<string, unknown>>,
    lastCheckAvailabilityInput: null as unknown,
    webhookStatusUpdateCount: 0,
    nextOrderNumber: 1,
    reset() {
      runtimeState.orders.clear();
      runtimeState.webhookEventIds.clear();
      runtimeState.stripeCreateParams = [];
      runtimeState.lastCheckAvailabilityInput = null;
      runtimeState.webhookStatusUpdateCount = 0;
      runtimeState.nextOrderNumber = 1;

      runtimeState.orders.set(
        "order-existing-1",
        makeOrder({
          id: "order-existing-1",
          orderNumber: "PED-EXIST001",
          status: "paid",
          currentStatus: "DELIVERED",
          stockCommitted: true,
          amount: 12900,
          itemsAmount: 11900,
          shippingAmount: 1000,
          stripePaymentIntentId: null,
        })
      );
      runtimeState.orders.set(
        "order-webhook-1",
        makeOrder({
          id: "order-webhook-1",
          orderNumber: "PED-WEBH001",
          status: "pending_payment",
          currentStatus: "ORDER_PLACED",
          stockCommitted: false,
          stripePaymentIntentId: "pi_webhook_1",
        })
      );
    },
  };
  runtimeState.reset();
  return runtimeState;
});

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function toDbOrderRow(order: Record<string, unknown>) {
  return {
    id: order.id,
    status: order.status,
    stock_committed: Boolean(order.stockCommitted),
    created_at: order.createdAt || null,
    updated_at: order.updatedAt || null,
    payment_method: order.paymentMethod || null,
    installments: Number(order.installments || 1),
    currency: String(order.currency || "brl"),
    total_cents: Number(order.amount || 0),
    items_cents: Number(order.itemsAmount || 0),
    shipping_cents: Number(order.shippingAmount || 0),
    shipping_price_cents: Number(order.shippingPriceCents || order.shippingAmount || 0),
    shipping_selected_provider: order.shippingSelectedProvider || null,
    shipping_selected_service: order.shippingSelectedService || null,
    shipping_selected_service_code: order.shippingSelectedServiceCode || null,
    shipping_selected_carrier_name: order.shippingSelectedCarrierName || null,
    shipping_deadline_days: order.shippingDeadlineDays ?? null,
    shipping_destination_zip: order.shippingDestinationZip || null,
    shipping_json: order.shipping || null,
    user_id: order.userId || null,
    user_email: order.userEmail || null,
    user_name: order.userName || null,
    stripe_payment_intent_id: order.stripePaymentIntentId || null,
    stripe_refund_id: order.stripeRefundId || null,
    paid_at: order.paidAt || null,
    canceled_at: order.canceledAt || null,
    refunded_at: order.refundedAt || null,
    failure_reason: order.failureReason || null,
    cancellation_reason: order.cancellationReason || null,
  };
}

const bcryptMock = {
  compare: vi.fn(async (plain: string, hash: string) => plain === "correct-password" && hash === "hash"),
  hash: vi.fn(async () => "hash-generated"),
};

const stripeConstructorMock = vi.fn(function StripeMock() {
  return {
    paymentIntents: {
      create: vi.fn(async (params: Record<string, unknown>) => {
        state.stripeCreateParams.push(clone(params));
        const id = `pi_created_${state.stripeCreateParams.length}`;
        return {
          id,
          client_secret: `${id}_secret_mock`,
          amount: Number(params.amount || 0),
          status: "requires_payment_method",
        };
      }),
      retrieve: vi.fn(async (id: string) => ({
        id,
        status: "requires_payment_method",
        amount: 11000,
        client_secret: `${id}_secret_mock`,
      })),
      cancel: vi.fn(async (id: string) => ({ id, status: "canceled" })),
    },
    webhooks: {
      constructEvent: vi.fn((rawBody: Buffer | string, signature: string) => {
        if (signature !== "valid-signature") {
          throw new Error("Invalid signature");
        }
        const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody || "");
        return JSON.parse(body);
      }),
    },
    refunds: {
      create: vi.fn(async () => ({ id: "re_test_1" })),
    },
  };
});

const requireCjs = createRequire(import.meta.url);
const moduleLib = requireCjs("module");
const originalLoad = moduleLib._load;
moduleLib._load = function mockedLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "bcrypt") return bcryptMock;
  if (request === "stripe") return stripeConstructorMock;
  return originalLoad.apply(this, [request, parent, isMain]);
};

afterAll(() => {
  moduleLib._load = originalLoad;
});

vi.mock("../../server/session", () => {
  const sessionStore = new Map<string, Record<string, unknown>>();
  let sessionCounter = 1;

  function readCookie(raw: string, key: string): string {
    const parts = String(raw || "")
      .split(";")
      .map((entry) => entry.trim());
    for (const part of parts) {
      if (!part.startsWith(`${key}=`)) continue;
      return part.slice(key.length + 1);
    }
    return "";
  }

  return {
    createSessionMiddleware() {
      return (req: any, res: any, next: any) => {
        let sid = readCookie(String(req.headers.cookie || ""), "tsebi.sid");
        if (!sid) {
          sid = `sid_${sessionCounter++}`;
        }

        const base = sessionStore.get(sid) || {};
        req.session = { ...base };
        req.session.save = (cb?: () => void) => {
          sessionStore.set(sid, { ...req.session });
          if (cb) cb();
        };

        res.setHeader("Set-Cookie", `tsebi.sid=${sid}; Path=/; HttpOnly`);
        res.on("finish", () => {
          sessionStore.set(sid, { ...req.session });
        });
        next();
      };
    },
  };
});

vi.mock("../../server/user-repository", () => {
  const normalizeEmail = (value: string) => String(value || "").trim().toLowerCase();
  const publicUser = (user: Record<string, unknown>) => ({
    id: user.id,
    title: user.title || "",
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    defaultAddressId: user.defaultAddressId || "",
    addresses: user.addresses || [],
  });

  return {
    normalizeEmail,
    publicUser,
    findUserByEmail: vi.fn(async (email: string) => {
      if (normalizeEmail(email) === normalizeEmail(state.baseUser.email)) return clone(state.baseUser);
      return null;
    }),
    findUserById: vi.fn(async (id: string) => {
      if (id === state.baseUser.id) return clone(state.baseUser);
      return null;
    }),
    createUser: vi.fn(async () => ({ ok: true, user: clone(state.baseUser) })),
    updateUser: vi.fn(async () => clone(state.baseUser)),
    markUserLoggedInNow: vi.fn(async () => clone(state.baseUser)),
    markUserEmailVerified: vi.fn(async () => clone(state.baseUser)),
    upsertCheckoutGuestUser: vi.fn(async () => ({
      ok: true,
      user: {
        ...clone(state.baseUser),
        id: "guest-user-1",
        email: "guest@example.com",
      },
    })),
  };
});

vi.mock("../../server/lib/order-repository", () => {
  return {
    createOrder: vi.fn(async (payload: Record<string, unknown>) => {
      const id = `order-new-${state.nextOrderNumber++}`;
      const order = {
        ...clone(payload),
        id,
        orderNumber: `PED-NEW${String(state.nextOrderNumber).padStart(4, "0")}`,
        currentStatus: "ORDER_PLACED",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: Array.isArray(payload.items) ? clone(payload.items) : [],
        stripePaymentIntentId: null,
      };
      state.orders.set(id, order);
      return clone(order);
    }),
    updateOrder: vi.fn(async (orderId: string, patch: Record<string, unknown>) => {
      const current = state.orders.get(orderId);
      if (!current) return null;
      const next = {
        ...current,
        ...clone(patch),
        updatedAt: new Date().toISOString(),
      };
      state.orders.set(orderId, next);
      return clone(next);
    }),
    findOrderById: vi.fn(async (orderId: string) => {
      const order = state.orders.get(orderId);
      return order ? clone(order) : null;
    }),
    listOrdersByUserId: vi.fn(async (userId: string) => {
      const all = Array.from(state.orders.values()).filter((order) => String(order.userId || "") === String(userId || ""));
      return clone(all);
    }),
  };
});

vi.mock("../../server/lib/inventory-repository", () => {
  return {
    checkAvailability: vi.fn(async (items: Array<{ id: string; qty: number }>) => {
      state.lastCheckAvailabilityInput = clone(items);
      return {
        ok: true,
        issues: [],
        resolvedItems: items.map((item) => ({
          id: item.id,
          name: `Product ${item.id}`,
          qty: item.qty,
          unitAmount: 5000,
          currency: "brl",
        })),
      };
    }),
    commitStock: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../../server/lib/access-code-repository", () => {
  return {
    evaluateAccessCode: vi.fn(async () => ({
      ok: true,
      discountCents: 0,
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
      entry: { code: "NONE", type: "amount", percentOff: 0, amountOffCents: 0 },
    })),
  };
});

vi.mock("../../server/lib/db", () => {
  const runQuery = async (sql: string, params: unknown[] = []) => {
    const compact = String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();

    if (compact.includes("insert into webhook_events")) {
      const stripeEventId = String(params[0] || "");
      if (state.webhookEventIds.has(stripeEventId)) return { rowCount: 0, rows: [] };
      state.webhookEventIds.add(stripeEventId);
      return { rowCount: 1, rows: [{ id: `wh_${stripeEventId}` }] };
    }

    if (compact.includes("select id from orders where id = $1")) {
      const id = String(params[0] || "");
      if (state.orders.has(id)) return { rowCount: 1, rows: [{ id }] };
      return { rowCount: 0, rows: [] };
    }

    if (compact.includes("select id from orders where stripe_payment_intent_id = $1")) {
      const paymentIntentId = String(params[0] || "");
      const order = Array.from(state.orders.values()).find(
        (entry) => String(entry.stripePaymentIntentId || "") === paymentIntentId
      );
      if (!order) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: order.id }] };
    }

    if (compact.includes("select * from orders where id = $1")) {
      const id = String(params[0] || "");
      const order = state.orders.get(id);
      if (!order) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [toDbOrderRow(order)] };
    }

    if (compact.includes("from order_items") && compact.includes("where order_id = $1")) {
      const id = String(params[0] || "");
      const order = state.orders.get(id);
      if (!order) return { rowCount: 0, rows: [] };
      const items = Array.isArray(order.items) ? order.items : [];
      return {
        rowCount: items.length,
        rows: items.map((item: Record<string, unknown>) => ({
          product_sku: item.id,
          product_id: null,
          name: item.name,
          qty: Number(item.qty || 0),
          price_cents: Number(item.unitAmount || 0),
          currency: item.currency || "brl",
        })),
      };
    }

    if (compact.startsWith("update orders")) {
      const orderId = String(params[0] || "");
      const current = state.orders.get(orderId);
      if (!current) return { rowCount: 0, rows: [] };
      const next = { ...current };
      const prevStatus = String(next.status || "");

      if (compact.includes("status = 'paid'")) {
        next.status = "paid";
        next.stockCommitted = true;
        next.paidAt = next.paidAt || new Date().toISOString();
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[1] || null;
      } else if (compact.includes("status = 'processing'")) {
        next.status = "processing";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[1] || null;
      } else if (compact.includes("status = 'failed'")) {
        next.status = "failed";
        next.failureReason = params[1] || "payment_failed";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      } else if (compact.includes("status = 'canceled'")) {
        next.status = "canceled";
        next.cancellationReason = params[1] || "canceled";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      } else if (compact.includes("status = 'refunded'")) {
        next.status = "refunded";
        next.stripeRefundId = params[1] || next.stripeRefundId || null;
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      }

      next.updatedAt = new Date().toISOString();
      if (prevStatus !== next.status) {
        state.webhookStatusUpdateCount += 1;
      }
      state.orders.set(orderId, next);
      return { rowCount: 1, rows: [] };
    }

    return { rowCount: 0, rows: [] };
  };

  return {
    query: vi.fn(runQuery),
    withTransaction: vi.fn(async (callback: (client: { query: typeof runQuery }) => Promise<unknown>) => {
      return callback({ query: runQuery });
    }),
    getPool: vi.fn(() => ({
      on: vi.fn(),
    })),
  };
});

vi.mock("../../server/lib/product-repository", () => {
  return {
    listProducts: vi.fn(async () => []),
    getProductByIdentifier: vi.fn(async () => null),
  };
});

vi.mock("../../src/shipping/shipping.service", () => {
  return {
    resolveQuoteForCheckout: vi.fn(async () => null),
    selectShippingForOrder: vi.fn(async () => null),
  };
});

vi.mock("../../src/shipping/order-tracking.service", () => {
  return {
    syncMelhorEnvioTrackingJob: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../../server/lib/order-notification-service", () => {
  return {
    notifyOrderConfirmed: vi.fn(async () => undefined),
    notifyPaymentApproved: vi.fn(async () => undefined),
  };
});

vi.mock("../../server/lib/whatsapp-service", () => {
  return {
    sendOrderConfirmedWhatsApp: vi.fn(async () => undefined),
  };
});

vi.mock("../../server/lib/passkey-repository", () => {
  return {
    listPasskeysByUserId: vi.fn(async () => []),
    findPasskeyByCredentialId: vi.fn(async () => null),
    createPasskey: vi.fn(async () => ({ ok: true })),
    updatePasskeyCounter: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../../server/lib/auth-email-code-repository", () => {
  return {
    issueAuthEmailCode: vi.fn(async () => ({
      ok: true,
      code: "123456",
      purpose: "login_verify",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    })),
    consumeAuthEmailCode: vi.fn(async () => ({ ok: true, userId: state.baseUser.id })),
  };
});

vi.mock("../../server/lib/email-service", () => {
  return {
    sendAccountVerificationEmail: vi.fn(async () => ({ ok: true })),
    sendLoginVerificationEmail: vi.fn(async () => ({ ok: true })),
    sendPasswordResetEmail: vi.fn(async () => ({ ok: true })),
  };
});

vi.mock("../../server/studio-auth", () => {
  const express = require("express");
  return {
    studioAuthRouter: express.Router(),
  };
});

vi.mock("../../server/vip", () => {
  const express = require("express");
  return {
    vipRouter: express.Router(),
  };
});

vi.mock("../../server/admin", () => {
  const express = require("express");
  const router = express.Router();
  router.get("/me", (req: any, res: any) => {
    if (!req.session?.adminAuth?.userId) {
      return res.status(401).json({ error: "ADMIN_UNAUTHORIZED" });
    }
    return res.json({ admin: { id: req.session.adminAuth.userId } });
  });
  return {
    adminRouter: router,
  };
});

vi.mock("../../src/routes/shipping.routes", () => {
  const express = require("express");
  return { shippingRouter: express.Router() };
});

vi.mock("../../src/routes/admin.shipping.routes", () => {
  const express = require("express");
  return { adminShippingRouter: express.Router() };
});

vi.mock("../../src/routes/admin.whatsapp.routes", () => {
  const express = require("express");
  return { adminWhatsAppRouter: express.Router() };
});

vi.mock("../../src/routes/order-tracking.routes", () => {
  const express = require("express");
  return { orderTrackingRouter: express.Router() };
});

vi.mock("../../src/routes/whatsapp.routes", () => {
  const express = require("express");
  return { whatsappRouter: express.Router() };
});

let app: Express;
const sessionStore = new Map<string, Record<string, unknown>>();
let sessionCounter = 1;

function readCookie(raw: string, key: string): string {
  const parts = String(raw || "")
    .split(";")
    .map((entry) => entry.trim());
  for (const part of parts) {
    if (!part.startsWith(`${key}=`)) continue;
    return part.slice(key.length + 1);
  }
  return "";
}

beforeAll(async () => {
  const normalizeEmail = (value: string) => String(value || "").trim().toLowerCase();
  const publicUser = (user: Record<string, unknown>) => ({
    id: user.id,
    title: user.title || "",
    name: user.name,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt || null,
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
    cep: user.cep || "",
    defaultAddressId: user.defaultAddressId || "",
    addresses: user.addresses || [],
  });

  const runQuery = async (sql: string, params: unknown[] = []) => {
    const compact = String(sql || "").replace(/\s+/g, " ").trim().toLowerCase();

    if (compact.includes("insert into webhook_events")) {
      const stripeEventId = String(params[0] || "");
      if (state.webhookEventIds.has(stripeEventId)) return { rowCount: 0, rows: [] };
      state.webhookEventIds.add(stripeEventId);
      return { rowCount: 1, rows: [{ id: `wh_${stripeEventId}` }] };
    }

    if (compact.includes("select id from orders where id = $1")) {
      const id = String(params[0] || "");
      if (state.orders.has(id)) return { rowCount: 1, rows: [{ id }] };
      return { rowCount: 0, rows: [] };
    }

    if (compact.includes("select id from orders where stripe_payment_intent_id = $1")) {
      const paymentIntentId = String(params[0] || "");
      const order = Array.from(state.orders.values()).find(
        (entry) => String(entry.stripePaymentIntentId || "") === paymentIntentId
      );
      if (!order) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ id: order.id }] };
    }

    if (compact.includes("select * from orders where id = $1")) {
      const id = String(params[0] || "");
      const order = state.orders.get(id);
      if (!order) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [toDbOrderRow(order)] };
    }

    if (compact.includes("from order_items") && compact.includes("where order_id = $1")) {
      const id = String(params[0] || "");
      const order = state.orders.get(id);
      if (!order) return { rowCount: 0, rows: [] };
      const items = Array.isArray(order.items) ? order.items : [];
      return {
        rowCount: items.length,
        rows: items.map((item: Record<string, unknown>) => ({
          product_sku: item.id,
          product_id: null,
          name: item.name,
          qty: Number(item.qty || 0),
          price_cents: Number(item.unitAmount || 0),
          currency: item.currency || "brl",
        })),
      };
    }

    if (compact.startsWith("update orders")) {
      const orderId = String(params[0] || "");
      const current = state.orders.get(orderId);
      if (!current) return { rowCount: 0, rows: [] };
      const next = { ...current };
      const prevStatus = String(next.status || "");

      if (compact.includes("status = 'paid'")) {
        next.status = "paid";
        next.stockCommitted = true;
        next.paidAt = next.paidAt || new Date().toISOString();
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[1] || null;
      } else if (compact.includes("status = 'processing'")) {
        next.status = "processing";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[1] || null;
      } else if (compact.includes("status = 'failed'")) {
        next.status = "failed";
        next.failureReason = params[1] || "payment_failed";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      } else if (compact.includes("status = 'canceled'")) {
        next.status = "canceled";
        next.cancellationReason = params[1] || "canceled";
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      } else if (compact.includes("status = 'refunded'")) {
        next.status = "refunded";
        next.stripeRefundId = params[1] || next.stripeRefundId || null;
        next.stripePaymentIntentId = next.stripePaymentIntentId || params[2] || null;
      }

      next.updatedAt = new Date().toISOString();
      if (prevStatus !== next.status) {
        state.webhookStatusUpdateCount += 1;
      }
      state.orders.set(orderId, next);
      return { rowCount: 1, rows: [] };
    }

    return { rowCount: 0, rows: [] };
  };

  const sessionModule = requireCjs("../../server/session");
  vi.spyOn(sessionModule, "createSessionMiddleware").mockImplementation(() => {
    return (req: any, res: any, next: any) => {
      let sid = readCookie(String(req.headers.cookie || ""), "tsebi.sid");
      if (!sid) sid = `sid_${sessionCounter++}`;

      const base = sessionStore.get(sid) || {};
      req.session = { ...base };
      req.session.save = (cb?: () => void) => {
        sessionStore.set(sid, { ...req.session });
        if (cb) cb();
      };
      res.setHeader("Set-Cookie", `tsebi.sid=${sid}; Path=/; HttpOnly`);
      res.on("finish", () => {
        sessionStore.set(sid, { ...req.session });
      });
      next();
    };
  });

  const userRepository = requireCjs("../../server/user-repository");
  vi.spyOn(userRepository, "normalizeEmail").mockImplementation(normalizeEmail);
  vi.spyOn(userRepository, "publicUser").mockImplementation(publicUser);
  vi.spyOn(userRepository, "findUserByEmail").mockImplementation(async (email: string) => {
    if (normalizeEmail(email) === normalizeEmail(state.baseUser.email)) return clone(state.baseUser);
    return null;
  });
  vi.spyOn(userRepository, "findUserById").mockImplementation(async (id: string) => {
    if (id === state.baseUser.id) return clone(state.baseUser);
    return null;
  });
  vi.spyOn(userRepository, "createUser").mockImplementation(async () => ({ ok: true, user: clone(state.baseUser) }));
  vi.spyOn(userRepository, "updateUser").mockImplementation(async () => clone(state.baseUser));
  vi.spyOn(userRepository, "markUserLoggedInNow").mockImplementation(async () => clone(state.baseUser));
  vi.spyOn(userRepository, "markUserEmailVerified").mockImplementation(async () => clone(state.baseUser));
  vi.spyOn(userRepository, "upsertCheckoutGuestUser").mockImplementation(async () => ({
    ok: true,
    user: {
      ...clone(state.baseUser),
      id: "guest-user-1",
      email: "guest@example.com",
    },
  }));

  const orderRepository = requireCjs("../../server/lib/order-repository");
  vi.spyOn(orderRepository, "createOrder").mockImplementation(async (payload: Record<string, unknown>) => {
    const id = `order-new-${state.nextOrderNumber++}`;
    const order = {
      ...clone(payload),
      id,
      orderNumber: `PED-NEW${String(state.nextOrderNumber).padStart(4, "0")}`,
      currentStatus: "ORDER_PLACED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: Array.isArray(payload.items) ? clone(payload.items) : [],
      stripePaymentIntentId: null,
    };
    state.orders.set(id, order);
    return clone(order);
  });
  vi.spyOn(orderRepository, "updateOrder").mockImplementation(async (orderId: string, patch: Record<string, unknown>) => {
    const current = state.orders.get(orderId);
    if (!current) return null;
    const next = {
      ...current,
      ...clone(patch),
      updatedAt: new Date().toISOString(),
    };
    state.orders.set(orderId, next);
    return clone(next);
  });
  vi.spyOn(orderRepository, "findOrderById").mockImplementation(async (orderId: string) => {
    const order = state.orders.get(orderId);
    return order ? clone(order) : null;
  });
  vi.spyOn(orderRepository, "listOrdersByUserId").mockImplementation(async (userId: string) => {
    const all = Array.from(state.orders.values()).filter((order) => String(order.userId || "") === String(userId || ""));
    return clone(all);
  });

  const inventoryRepository = requireCjs("../../server/lib/inventory-repository");
  vi.spyOn(inventoryRepository, "checkAvailability").mockImplementation(async (items: Array<{ id: string; qty: number }>) => {
    state.lastCheckAvailabilityInput = clone(items);
    return {
      ok: true,
      issues: [],
      resolvedItems: items.map((item) => ({
        id: item.id,
        name: `Product ${item.id}`,
        qty: item.qty,
        unitAmount: 5000,
        currency: "brl",
      })),
    };
  });
  vi.spyOn(inventoryRepository, "commitStock").mockImplementation(async () => ({ ok: true }));

  const accessCodeRepository = requireCjs("../../server/lib/access-code-repository");
  vi.spyOn(accessCodeRepository, "evaluateAccessCode").mockImplementation(async () => ({
    ok: true,
    discountCents: 0,
    subtotalCents: 0,
    shippingCents: 0,
    totalCents: 0,
    entry: { code: "NONE", type: "amount", percentOff: 0, amountOffCents: 0 },
  }));

  const dbModule = requireCjs("../../server/lib/db");
  vi.spyOn(dbModule, "query").mockImplementation(runQuery);
  vi.spyOn(dbModule, "withTransaction").mockImplementation(async (callback: (client: { query: typeof runQuery }) => Promise<unknown>) => {
    return callback({ query: runQuery });
  });
  vi.spyOn(dbModule, "getPool").mockImplementation(() => ({ on: vi.fn() }));

  const productRepository = requireCjs("../../server/lib/product-repository");
  vi.spyOn(productRepository, "listProducts").mockImplementation(async () => []);
  vi.spyOn(productRepository, "getProductByIdentifier").mockImplementation(async () => null);

  const shippingService = requireCjs("../../src/shipping/shipping.service");
  vi.spyOn(shippingService, "resolveQuoteForCheckout").mockImplementation(async () => null);
  vi.spyOn(shippingService, "selectShippingForOrder").mockImplementation(async () => null);

  const trackingService = requireCjs("../../src/shipping/order-tracking.service");
  vi.spyOn(trackingService, "syncMelhorEnvioTrackingJob").mockImplementation(async () => ({ ok: true }));

  const notificationService = requireCjs("../../server/lib/order-notification-service");
  vi.spyOn(notificationService, "notifyOrderConfirmed").mockImplementation(async () => undefined);
  vi.spyOn(notificationService, "notifyPaymentApproved").mockImplementation(async () => undefined);

  const whatsappService = requireCjs("../../server/lib/whatsapp-service");
  vi.spyOn(whatsappService, "sendOrderConfirmedWhatsApp").mockImplementation(async () => undefined);

  const passkeyRepository = requireCjs("../../server/lib/passkey-repository");
  vi.spyOn(passkeyRepository, "listPasskeysByUserId").mockImplementation(async () => []);
  vi.spyOn(passkeyRepository, "findPasskeyByCredentialId").mockImplementation(async () => null);
  vi.spyOn(passkeyRepository, "createPasskey").mockImplementation(async () => ({ ok: true }));
  vi.spyOn(passkeyRepository, "updatePasskeyCounter").mockImplementation(async () => ({ ok: true }));

  const authEmailCodeRepository = requireCjs("../../server/lib/auth-email-code-repository");
  vi.spyOn(authEmailCodeRepository, "issueAuthEmailCode").mockImplementation(async () => ({
    ok: true,
    code: "123456",
    purpose: "login_verify",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  }));
  vi.spyOn(authEmailCodeRepository, "consumeAuthEmailCode").mockImplementation(async () => ({
    ok: true,
    userId: state.baseUser.id,
  }));

  const emailService = requireCjs("../../server/lib/email-service");
  vi.spyOn(emailService, "sendAccountVerificationEmail").mockImplementation(async () => ({ ok: true }));
  vi.spyOn(emailService, "sendLoginVerificationEmail").mockImplementation(async () => ({ ok: true }));
  vi.spyOn(emailService, "sendPasswordResetEmail").mockImplementation(async () => ({ ok: true }));
  const mod = await import("../../server/index");
  app = mod.app as Express;
});

beforeEach(() => {
  state.reset();
  vi.clearAllMocks();
});

describe("Express critical API flows", () => {
  it("POST /api/auth/login sets session cookie and GET /api/auth/me respects session", async () => {
    const meBefore = await request(app).get("/api/auth/me");
    expect(meBefore.status).toBe(200);
    expect(meBefore.body.authenticated).toBe(false);

    const agent = request.agent(app);
    const loginResponse = await agent.post("/api/auth/login").send({
      email: "user@example.com",
      password: "correct-password",
    });

    expect(loginResponse.status).toBe(200);
    expect(Array.isArray(loginResponse.headers["set-cookie"])).toBe(true);
    expect(String(loginResponse.headers["set-cookie"][0] || "")).toContain("tsebi.sid=");

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(200);
    expect(meAfter.body.authenticated).toBe(true);
    expect(meAfter.body.user.email).toBe("user@example.com");
  });

  it("POST /api/orders/payment-intent returns clientSecret and validates checkout items", async () => {
    const agent = await createAuthenticatedAgent(app);

    const response = await agent.post("/api/orders/payment-intent").send({
      items: [{ id: "sku-1", qty: 2 }],
      shipping: {
        fullName: "Test User",
        email: "user@example.com",
        phone: "11999999999",
        cep: "01001000",
        street: "Rua Teste",
        number: "100",
        district: "Centro",
        city: "Sao Paulo",
        state: "SP",
        shippingMethod: "standard",
      },
      customer: {
        firstName: "Test",
        lastName: "User",
        email: "user@example.com",
        phone: "11999999999",
      },
      shippingAddress: {
        zip: "01001000",
        street: "Rua Teste",
        number: "100",
        district: "Centro",
        city: "Sao Paulo",
        state: "SP",
        country: "BR",
      },
    });

    expect([200, 201]).toContain(response.status);
    expect(typeof response.body.clientSecret).toBe("string");
    expect(response.body.clientSecret.length).toBeGreaterThan(10);
    expect(state.lastCheckAvailabilityInput).toEqual([{ id: "sku-1", qty: 2 }]);
  });

  it("POST /api/stripe/webhook verifies signature and ignores duplicate stripe_event_id", async () => {
    const eventPayload = {
      id: "evt_test_1",
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "pi_webhook_1",
          metadata: {
            orderId: "order-webhook-1",
          },
        },
      },
    };

    const invalidSignature = await request(app)
      .post("/api/stripe/webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify(eventPayload));
    expect(invalidSignature.status).toBe(400);

    const first = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "valid-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify(eventPayload));
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "valid-signature")
      .set("content-type", "application/json")
      .send(JSON.stringify(eventPayload));
    expect(second.status).toBe(200);

    const updatedOrder = state.orders.get("order-webhook-1");
    expect(updatedOrder?.status).toBe("paid");
    expect(state.webhookEventIds.size).toBe(1);
    expect(state.webhookStatusUpdateCount).toBe(1);
  });

  it("GET /api/my/orders returns list when authenticated", async () => {
    const agent = await createAuthenticatedAgent(app);
    const response = await agent.get("/api/my/orders");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.orders)).toBe(true);
    expect(response.body.orders.length).toBeGreaterThan(0);
    expect(response.body.orders[0].orderNumber).toBeDefined();
  });

  it("GET /api/admin/me rejects non-admin session", async () => {
    const response = await request(app).get("/api/admin/me");
    expect(response.status).toBe(401);
    expect(response.body.error).toBe("ADMIN_UNAUTHORIZED");
  });
});


