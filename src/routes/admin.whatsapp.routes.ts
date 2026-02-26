export {};
const express = require("express");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { requireAdmin, requireAdminCsrfForMutations } = require("../../server/middlewares/requireAdmin");
const {
  searchContacts,
  listVipContacts,
  upsertVipContact,
  deleteVipContact,
  listSendLogs
} = require("../../server/lib/whatsapp-repository");
const {
  estimateTemplateCost,
  sendNewCollectionToVIP
} = require("../../server/lib/whatsapp-service");

const adminWhatsAppRouter = express.Router();

const adminRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS" }
});

adminWhatsAppRouter.use(adminRateLimit);
adminWhatsAppRouter.use(requireAdmin);
adminWhatsAppRouter.use(requireAdminCsrfForMutations);

const vipUpsertSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().default(""),
  phone: z.string().trim().min(8).max(30),
  source: z.string().trim().max(60).optional().default("manual")
});

const vipImportSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional().default(""),
        phone: z.string().trim().min(8).max(30)
      })
    )
    .min(1)
    .max(2000)
});

const sendVipSchema = z.object({
  collectionName: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(500)
});

adminWhatsAppRouter.get("/whatsapp/contacts", async (req: any, res: any) => {
  const query = String(req.query.query || "").trim();
  const limit = Number(req.query.limit || 50);
  const rows = await searchContacts({ query, limit });
  return res.json({ rows, count: rows.length });
});

adminWhatsAppRouter.get("/whatsapp/vip", async (req: any, res: any) => {
  const query = String(req.query.query || "").trim();
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  const result = await listVipContacts({ query, limit, offset });
  return res.json({ rows: result.rows, total: result.total, limit, offset });
});

adminWhatsAppRouter.post("/whatsapp/vip", async (req: any, res: any) => {
  const parsed = vipUpsertSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });
  const contact = await upsertVipContact(parsed.data);
  return res.status(201).json({ ok: true, contact });
});

adminWhatsAppRouter.post("/whatsapp/vip/import", async (req: any, res: any) => {
  const parsed = vipImportSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const results: any[] = [];
  for (const item of parsed.data.items) {
    const contact = await upsertVipContact({ ...item, source: "import" });
    if (contact) results.push(contact);
  }

  return res.status(201).json({ ok: true, imported: results.length });
});

adminWhatsAppRouter.delete("/whatsapp/vip/:id", async (req: any, res: any) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "INVALID_ID" });
  const removed = await deleteVipContact(id);
  if (!removed) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ ok: true, removed });
});

adminWhatsAppRouter.get("/whatsapp/vip/estimate", async (req: any, res: any) => {
  const limit = Number(req.query.limit || 5000);
  const result = await listVipContacts({ query: "", limit, offset: 0 });
  const quantity = result.total;
  const costEstimateCents = estimateTemplateCost(quantity);
  return res.json({ quantity, costEstimateCents });
});

adminWhatsAppRouter.post("/whatsapp/vip/send", async (req: any, res: any) => {
  const parsed = sendVipSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: "INVALID_INPUT" });

  const result = await sendNewCollectionToVIP(parsed.data.collectionName, parsed.data.message);
  return res.status(200).json(result);
});

adminWhatsAppRouter.get("/whatsapp/logs", async (req: any, res: any) => {
  const limit = Number(req.query.limit || 100);
  const offset = Number(req.query.offset || 0);
  const rows = await listSendLogs({ limit, offset });
  return res.json({ rows, count: rows.length, limit, offset });
});

module.exports = {
  adminWhatsAppRouter
};
