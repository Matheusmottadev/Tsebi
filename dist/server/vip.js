"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const bcrypt = require("bcrypt");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { normalizeEmail, findUserByEmail, createUser } = require("./user-repository");
const { upsertVipSubscriber, listVipSubscribers, setVipAccountCreated, deleteVipSubscriberById } = require("./lib/vip-repository");
const { getVipDatabaseUrl } = require("./lib/vip-db");
const vipRouter = express.Router();
const vipRegisterRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_ATTEMPTS" }
});
const vipListRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" }
});
const emailSchema = z.string().trim().email();
const passwordSchema = z
    .string()
    .min(8)
    .max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), {
    message: "INVALID_PASSWORD"
});
const vipRegisterSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: z.string().max(128).optional().default(""),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cpf: z
        .string()
        .transform((value) => String(value || "").replace(/\D/g, ""))
        .refine((value) => /^\d{11}$/.test(value)),
    cep: z
        .string()
        .transform((value) => String(value || "").replace(/\D/g, ""))
        .refine((value) => /^\d{8}$/.test(value))
});
const optionalDigits = (length) => z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => String(value || "").replace(/\D/g, ""))
    .refine((value) => value.length === 0 || value.length === length);
const vipAdminUpsertSchema = z.object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    birthDate: z
        .union([z.string(), z.null(), z.undefined()])
        .transform((value) => String(value || "").trim())
        .refine((value) => value.length === 0 || /^\d{4}-\d{2}-\d{2}$/.test(value)),
    cpf: optionalDigits(11),
    cep: optionalDigits(8),
    accountCreated: z.boolean().optional().default(false)
});
function parseBirthDate(value) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
        return false;
    const minAllowed = new Date("1900-01-01T00:00:00.000Z");
    if (date < minAllowed)
        return false;
    if (date > new Date())
        return false;
    return true;
}
function assertVipDbConfigured() {
    const vipDbUrl = getVipDatabaseUrl();
    if (!vipDbUrl) {
        const error = new Error("VIP_DATABASE_NOT_CONFIGURED");
        error.code = "VIP_DATABASE_NOT_CONFIGURED";
        throw error;
    }
}
function getAdminTokenFromRequest(req) {
    const bearer = String(req.headers.authorization || "");
    if (bearer.toLowerCase().startsWith("bearer ")) {
        return bearer.slice(7).trim();
    }
    return String(req.headers["x-vip-admin-token"] || req.query.token || "").trim();
}
function requireVipAdmin(req, res, next) {
    const expected = String(process.env.VIP_ADMIN_TOKEN || "").trim();
    if (!expected) {
        return res.status(500).json({ error: "VIP_ADMIN_TOKEN_NOT_CONFIGURED" });
    }
    const received = getAdminTokenFromRequest(req);
    if (!received || received !== expected) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return next();
}
vipRouter.post("/register", vipRegisterRateLimit, async (req, res) => {
    try {
        assertVipDbConfigured();
    }
    catch {
        return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    const parsed = vipRegisterSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_INPUT" });
    }
    const payload = parsed.data;
    if (!parseBirthDate(payload.birthDate)) {
        return res.status(400).json({ error: "INVALID_INPUT" });
    }
    const email = normalizeEmail(payload.email);
    const rawPassword = String(payload.password || "");
    try {
        let subscriber = await upsertVipSubscriber({
            ...payload,
            email,
            source: "launch_page",
            accountCreated: false,
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });
        let accountCreated = false;
        let accountExists = false;
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            accountExists = true;
            subscriber = await setVipAccountCreated(email);
        }
        else {
            const passwordParsed = passwordSchema.safeParse(rawPassword);
            if (!passwordParsed.success) {
                return res.status(400).json({ error: "PASSWORD_REQUIRED_FOR_NEW_ACCOUNT" });
            }
            const created = await createUser({
                name: payload.name,
                email,
                passwordHash: await bcrypt.hash(rawPassword, 12),
                birthDate: payload.birthDate,
                cpf: payload.cpf,
                cep: payload.cep
            });
            if (created.ok && created.user) {
                accountCreated = true;
                req.session.userId = created.user.id;
                subscriber = await setVipAccountCreated(email);
            }
            else if (created.error === "EMAIL_ALREADY_EXISTS") {
                accountExists = true;
                subscriber = await setVipAccountCreated(email);
            }
            else {
                return res.status(500).json({ error: "REGISTER_FAILED" });
            }
        }
        return res.status(201).json({
            ok: true,
            vipSaved: true,
            accountCreated,
            accountExists,
            subscriber
        });
    }
    catch {
        return res.status(500).json({ error: "VIP_SAVE_FAILED" });
    }
});
vipRouter.get("/subscribers", vipListRateLimit, requireVipAdmin, async (req, res) => {
    try {
        assertVipDbConfigured();
    }
    catch {
        return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    const limit = Number(req.query.limit || 100);
    const offset = Number(req.query.offset || 0);
    try {
        const subscribers = await listVipSubscribers({ limit, offset });
        return res.json({ subscribers, count: subscribers.length, limit, offset });
    }
    catch {
        return res.status(500).json({ error: "VIP_LIST_FAILED" });
    }
});
vipRouter.post("/subscribers", vipListRateLimit, requireVipAdmin, async (req, res) => {
    try {
        assertVipDbConfigured();
    }
    catch {
        return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    const parsed = vipAdminUpsertSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ error: "INVALID_INPUT" });
    }
    const payload = parsed.data;
    if (payload.birthDate && !parseBirthDate(payload.birthDate)) {
        return res.status(400).json({ error: "INVALID_INPUT" });
    }
    try {
        const subscriber = await upsertVipSubscriber({
            name: payload.name,
            email: normalizeEmail(payload.email),
            birthDate: payload.birthDate || "",
            cpf: payload.cpf || "",
            cep: payload.cep || "",
            source: "admin_panel",
            accountCreated: Boolean(payload.accountCreated),
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"]
        });
        return res.status(201).json({ ok: true, subscriber });
    }
    catch {
        return res.status(500).json({ error: "VIP_SAVE_FAILED" });
    }
});
vipRouter.delete("/subscribers/:id", vipListRateLimit, requireVipAdmin, async (req, res) => {
    try {
        assertVipDbConfigured();
    }
    catch {
        return res.status(500).json({ error: "VIP_DATABASE_NOT_CONFIGURED" });
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "INVALID_ID" });
    }
    try {
        const removed = await deleteVipSubscriberById(id);
        if (!removed) {
            return res.status(404).json({ error: "NOT_FOUND" });
        }
        return res.json({ ok: true, removed });
    }
    catch {
        return res.status(500).json({ error: "VIP_DELETE_FAILED" });
    }
});
module.exports = {
    vipRouter
};
//# sourceMappingURL=vip.js.map