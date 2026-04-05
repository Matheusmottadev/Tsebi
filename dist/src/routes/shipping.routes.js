"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require("express");
const rateLimit = require("express-rate-limit");
const crypto = require("node:crypto");
const { z } = require("zod");
const { requireAuth } = require("../../server/middlewares/requireAuth");
const { requireAdmin } = require("../../server/middlewares/requireAdmin");
const { findOrderById } = require("../../server/lib/order-repository");
const { quoteShipping, selectShippingForOrder } = require("../shipping/shipping.service");
const { buildMelhorEnvioAuthorizeUrl, exchangeMelhorEnvioAuthCode, getMelhorEnvioConnectionStatus } = require("../shipping/melhorenvio-auth");
const shippingRouter = express.Router();
const shippingQuoteRateLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "TOO_MANY_REQUESTS" }
});
const shippingQuoteSchema = z.object({
    orderId: z.string().uuid().optional(),
    itemsCount: z.coerce.number().int().min(1).max(999).optional().default(1),
    destinationZip: z
        .string()
        .transform((value) => String(value || "").replace(/\D/g, "").slice(0, 8))
        .refine((value) => /^\d{8}$/.test(value), { message: "INVALID_DESTINATION_ZIP" })
});
const selectShippingSchema = z.object({
    quoteId: z.string().uuid(),
    destinationZip: z
        .string()
        .optional()
        .default("")
        .transform((value) => String(value || "").replace(/\D/g, "").slice(0, 8))
});
function mapShippingError(error) {
    const code = String(error?.code || error?.message || "SHIPPING_REQUEST_FAILED");
    const status = Number(error?.status || 0) || 400;
    return { status: Math.max(400, Math.min(500, status)), code };
}
function renderMelhorEnvioCallbackPage({ title, message, tone = "success", detail = "", nextStep = "" }) {
    const accent = tone === "success" ? "#111111" : "#9f2d2d";
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
        background: #f7f5f1;
        color: #111111;
      }
      .shell {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 32px 20px;
      }
      .card {
        width: min(560px, 100%);
        background: #ffffff;
        border: 1px solid #e7e1d8;
        padding: 28px 24px;
      }
      h1 {
        margin: 0 0 12px;
        font-size: 28px;
        line-height: 1.15;
        color: ${accent};
      }
      p {
        margin: 0 0 12px;
        font-size: 16px;
        line-height: 1.55;
      }
      .detail {
        color: #5f5a52;
        font-size: 14px;
      }
      .next {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #ece6dd;
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 13px;
        background: #f4f1eb;
        padding: 2px 5px;
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="card">
        <h1>${title}</h1>
        <p>${message}</p>
        ${detail ? `<p class="detail">${detail}</p>` : ""}
        ${nextStep ? `<div class="next"><p>${nextStep}</p></div>` : ""}
      </section>
    </main>
  </body>
</html>`;
}
shippingRouter.get("/shipping/melhorenvio/status", requireAdmin, async (_req, res) => {
    try {
        const status = await getMelhorEnvioConnectionStatus();
        return res.json({ ok: true, data: status });
    }
    catch (error) {
        const mapped = mapShippingError(error);
        return res.status(mapped.status).json({ ok: false, error: mapped.code });
    }
});
shippingRouter.get("/shipping/melhorenvio/connect", requireAdmin, async (req, res) => {
    try {
        const state = crypto.randomUUID();
        req.session.melhorEnvioOauth = {
            state,
            startedAt: Date.now()
        };
        if (typeof req.session.save === "function") {
            await new Promise((resolve, reject) => {
                req.session.save((error) => {
                    if (error)
                        return reject(error);
                    return resolve(true);
                });
            });
        }
        const authorizationUrl = buildMelhorEnvioAuthorizeUrl({ state });
        return res.redirect(302, authorizationUrl);
    }
    catch (error) {
        const mapped = mapShippingError(error);
        return res
            .status(mapped.status)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Nao foi possivel iniciar a conexao",
            message: "Verifique se o Client ID e o Client Secret do Melhor Envio ja foram preenchidos no ambiente.",
            tone: "error",
            detail: `Erro: ${mapped.code}`,
            nextStep: "Depois de ajustar as credenciais, abra novamente /api/shipping/melhorenvio/connect."
        }));
    }
});
shippingRouter.get("/shipping/melhorenvio/callback", async (req, res) => {
    const providerError = String(req.query?.error || "").trim();
    const providerErrorDescription = String(req.query?.error_description || "").trim();
    const code = String(req.query?.code || "").trim();
    const state = String(req.query?.state || "").trim();
    const expectedState = String(req.session?.melhorEnvioOauth?.state || "").trim();
    if (providerError) {
        return res
            .status(400)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Autorizacao recusada",
            message: "O Melhor Envio nao concluiu a autorizacao do aplicativo.",
            tone: "error",
            detail: providerErrorDescription || providerError,
            nextStep: "Volte ao painel do Melhor Envio e tente autorizar novamente."
        }));
    }
    if (!code) {
        return res
            .status(400)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Codigo nao recebido",
            message: "A callback foi chamada sem o codigo de autorizacao do Melhor Envio.",
            tone: "error",
            nextStep: "Abra novamente a rota /api/shipping/melhorenvio/connect a partir do navegador em que voce iniciou a conexao."
        }));
    }
    if (!state || !expectedState || state !== expectedState) {
        return res
            .status(400)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Sessao de autorizacao invalida",
            message: "Nao foi possivel validar o retorno do Melhor Envio com a sessao que iniciou a conexao.",
            tone: "error",
            nextStep: "Reinicie o fluxo abrindo /api/shipping/melhorenvio/connect no mesmo navegador."
        }));
    }
    try {
        const saved = await exchangeMelhorEnvioAuthCode(code);
        if (req.session?.melhorEnvioOauth) {
            delete req.session.melhorEnvioOauth;
            if (typeof req.session.save === "function") {
                await new Promise((resolve) => req.session.save(() => resolve(true)));
            }
        }
        return res
            .status(200)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Melhor Envio conectado",
            message: "A autorizacao foi concluida e os tokens foram salvos com sucesso.",
            detail: saved?.expiresAt ? `Token valido ate ${new Date(saved.expiresAt).toLocaleString("pt-BR")}.` : "",
            nextStep: "Agora voce ja pode testar o frete no site ou consultar /api/shipping/melhorenvio/status para confirmar a conexao."
        }));
    }
    catch (error) {
        const mapped = mapShippingError(error);
        return res
            .status(mapped.status)
            .type("html")
            .send(renderMelhorEnvioCallbackPage({
            title: "Falha ao salvar os tokens",
            message: "O Melhor Envio retornou para o site, mas a troca do codigo por tokens nao foi concluida.",
            tone: "error",
            detail: `Erro: ${mapped.code}`,
            nextStep: "Confira o Client ID, Client Secret e a URL de redirecionamento cadastrada no painel do Melhor Envio."
        }));
    }
});
shippingRouter.post("/shipping/quote", shippingQuoteRateLimit, async (req, res) => {
    const parsed = shippingQuoteSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    }
    const userId = req.session?.userId || null;
    const destinationZip = parsed.data.destinationZip;
    const orderId = parsed.data.orderId || null;
    const requestedItemsCount = Math.max(1, Number(parsed.data.itemsCount || 1));
    try {
        let itemsCount = requestedItemsCount;
        if (orderId) {
            const order = await findOrderById(orderId);
            if (!order || String(order.userId || "") !== String(userId || "")) {
                return res.status(404).json({ ok: false, error: "ORDER_NOT_FOUND" });
            }
            itemsCount = Math.max(1, (Array.isArray(order.items) ? order.items : []).reduce((sum, item) => sum + Math.max(1, Number(item?.qty || 1)), 0));
        }
        const quotes = await quoteShipping({
            orderId,
            userId,
            destinationZip,
            itemsCount
        });
        return res.json({
            ok: true,
            data: {
                destinationZip,
                quotes
            }
        });
    }
    catch (error) {
        const mapped = mapShippingError(error);
        return res.status(mapped.status).json({ ok: false, error: mapped.code });
    }
});
shippingRouter.post("/orders/:id/shipping/select", requireAuth, async (req, res) => {
    const parsed = selectShippingSchema.safeParse(req.body || {});
    if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "INVALID_INPUT" });
    }
    try {
        const selected = await selectShippingForOrder({
            orderId: String(req.params.id || "").trim(),
            userId: req.session.userId,
            quoteId: parsed.data.quoteId,
            destinationZip: parsed.data.destinationZip
        });
        return res.json({
            ok: true,
            data: selected
        });
    }
    catch (error) {
        const mapped = mapShippingError(error);
        return res.status(mapped.status).json({ ok: false, error: mapped.code });
    }
});
module.exports = {
    shippingRouter
};
//# sourceMappingURL=shipping.routes.js.map