export {};
const express = require("express");
const { z } = require("zod");
const { upsertInboundContact } = require("../../server/lib/whatsapp-repository");

const whatsappRouter = express.Router();

const verifySchema = z.object({
  "hub.mode": z.string().trim().optional(),
  "hub.verify_token": z.string().trim().optional(),
  "hub.challenge": z.string().trim().optional()
});

function isValidVerificationToken(token: any) {
  const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  if (!expected) return false;
  return token === expected;
}

whatsappRouter.get("/webhook", (req: any, res: any) => {
  const parsed = verifySchema.safeParse(req.query || {});
  if (!parsed.success) return res.status(400).send("invalid");

  const mode = parsed.data["hub.mode"];
  const token = parsed.data["hub.verify_token"];
  const challenge = parsed.data["hub.challenge"];

  if (mode === "subscribe" && isValidVerificationToken(token) && challenge) {
    return res.status(200).send(String(challenge));
  }

  return res.status(403).send("forbidden");
});

whatsappRouter.post("/webhook", async (req: any, res: any) => {
  const payload = req.body || {};
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  try {
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const contactName = String(contacts[0]?.profile?.name || "").trim();

        for (const msg of messages) {
          const from = String(msg?.from || "").trim();
          const text = String(msg?.text?.body || "").trim();
          const timestampSec = Number(msg?.timestamp || 0);
          const timestamp = Number.isFinite(timestampSec) && timestampSec > 0
            ? new Date(timestampSec * 1000).toISOString()
            : null;

          if (from) {
            await upsertInboundContact({
              phone: from,
              name: contactName,
              text,
              timestamp
            });
          }
        }
      }
    }
  } catch {
    return res.status(500).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
});

module.exports = {
  whatsappRouter
};
