export {};
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
const express = require("express");
const { requireAdmin, requireAdminCsrfForMutations } = require("./middlewares/requireAdmin");
const { findUserById, normalizeEmail, publicUser } = require("./user-repository");
const {
  getAdminIdleTimeoutMs,
  findAdminAccessEntry,
  generateCsrfToken,
  setAdminCsrfCookie,
} = require("./lib/admin-security");
const { trocarCodigoBlingPorToken, emitirNFSeNoBling, cancelarNFSeNoBling } = require("../lib/bling");
const { enviarEmailNfse } = require("../lib/email");
const {
  listarNfse,
  buscarStatsNfse,
  criarNfse,
  atualizarNfse,
  registrarEmailLog,
  buscarNfsePorId,
} = require("../lib/nfse");
const { query } = require("./lib/db");

const nfseRouter = express.Router();
const blingIntegrationsRouter = express.Router();

const emitirNfseSchema = z.object({
  pedido_id: z.string().trim().uuid(),
  tomador_nome: z.string().trim().min(2).max(255),
  tomador_documento: z.string().trim().min(11).max(20),
  tomador_email: z.string().trim().email().optional().or(z.literal("")).default(""),
  tomador_cep: z.string().trim().min(8).max(10),
  tomador_logradouro: z.string().trim().min(2).max(255),
  tomador_numero: z.string().trim().min(1).max(20),
  tomador_bairro: z.string().trim().min(2).max(100),
  tomador_municipio: z.string().trim().min(2).max(100),
  tomador_uf: z.string().trim().min(2).max(2),
  servico_descricao: z.string().trim().min(3),
  servico_codigo: z.string().trim().min(1).max(20),
  valor_servicos: z.coerce.number().positive(),
  aliquota_iss: z.coerce.number().min(0).max(1),
  competencia: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  enviar_email: z.coerce.boolean().optional().default(true),
});

type EmissaoError = Error & { statusCode?: number; details?: string };

function renderHtmlPage(title: string, body: string, status = 200): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin: 0; padding: 32px; background: #0f0f10; color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .card { max-width: 760px; margin: 0 auto; background: #17181b; border: 1px solid #27272a; border-radius: 16px; padding: 28px; }
      h1 { margin: 0 0 8px; font-size: 24px; font-weight: 600; }
      p { color: #b4b4b8; line-height: 1.6; }
      pre { white-space: pre-wrap; word-break: break-word; background: #0f1012; color: #e4e4e7; border: 1px solid #27272a; border-radius: 12px; padding: 16px; font-size: 12px; line-height: 1.6; }
      .success { color: #8ce0a0; }
      .error { color: #f0a6a6; }
      .muted { color: #8b8b91; font-size: 12px; }
      a { color: #c4d7ff; }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensureAdminHtmlSession(req: Request & any, res: Response): Promise<Record<string, unknown> | null> {
  const adminAuth = req.session?.adminAuth;
  if (!adminAuth?.userId) {
    res
      .status(401)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Login necessário",
          "<h1>Login necessário</h1><p>Abra esta URL estando logado no admin da Tsebi para concluir a conexão com o Bling.</p>"
        )
      );
    return null;
  }

  const user = await findUserById(adminAuth.userId);
  if (!user) {
    res
      .status(401)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Login necessário",
          "<h1>Login necessário</h1><p>Sua sessão do admin expirou. Entre novamente e refaça a autorização do Bling.</p>"
        )
      );
    return null;
  }

  const adminAccess = await findAdminAccessEntry(user.email);
  if (!adminAccess?.id || !adminAccess.isActive) {
    res
      .status(403)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Acesso negado",
          "<h1 class=\"error\">Acesso negado</h1><p>Sua conta não tem acesso ativo ao painel administrativo.</p>"
        )
      );
    return null;
  }

  if (!user.adminMfaEnabled || !adminAuth.mfaVerified) {
    res
      .status(403)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Confirmação necessária",
          "<h1 class=\"error\">Confirmação necessária</h1><p>Conclua o acesso com MFA no admin e tente autorizar o Bling novamente.</p>"
        )
      );
    return null;
  }

  const now = Date.now();
  const timeoutMs = getAdminIdleTimeoutMs();
  const lastActiveAt = Number(adminAuth.lastActiveAt || 0);
  if (!Number.isFinite(lastActiveAt) || now - lastActiveAt > timeoutMs) {
    res
      .status(401)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Sessão expirada",
          "<h1 class=\"error\">Sessão expirada</h1><p>Entre novamente no admin da Tsebi e repita a autorização do Bling.</p>"
        )
      );
    return null;
  }

  const csrfToken = String(adminAuth.csrfToken || "").trim() || generateCsrfToken();
  req.session.adminAuth = {
    ...adminAuth,
    userId: user.id,
    email: normalizeEmail(user.email),
    mfaVerified: true,
    lastActiveAt: now,
    csrfToken,
  };
  setAdminCsrfCookie(res, csrfToken);
  req.adminUser = publicUser(user);
  req.adminSession = req.session.adminAuth;
  req.admin = {
    id: adminAccess.id,
    email: adminAccess.email,
    role: adminAccess.role,
    isActive: adminAccess.isActive,
    permissions: adminAccess.permissions,
    createdAt: adminAccess.createdAt,
    updatedAt: adminAccess.updatedAt,
  };
  return req.admin;
}

function buildBlingPayload(body: z.infer<typeof emitirNfseSchema>): Record<string, unknown> {
  return {
    naturezaOperacao: 1,
    dataEmissao: new Date().toISOString().split("T")[0],
    prestador: { cpfCnpj: process.env.BLING_CNPJ_PRESTADOR },
    tomador: {
      nome: body.tomador_nome,
      cpfCnpj: body.tomador_documento,
      email: body.tomador_email || undefined,
      endereco: {
        logradouro: body.tomador_logradouro,
        numero: body.tomador_numero,
        bairro: body.tomador_bairro,
        municipio: body.tomador_municipio,
        uf: body.tomador_uf,
        cep: body.tomador_cep,
      },
    },
    servico: {
      descricao: body.servico_descricao,
      valorServicos: body.valor_servicos,
      codigoServico: body.servico_codigo,
      aliquota: body.aliquota_iss * 100,
      issRetido: false,
      municipioPrestacao: "3550308",
    },
  };
}

async function processarEmissaoNfse(body: z.infer<typeof emitirNfseSchema>): Promise<{ id: string }> {
  const nfse = await criarNfse(body);
  const blingPayload = buildBlingPayload(body);

  let blingResult;
  try {
    blingResult = await emitirNFSeNoBling(blingPayload);
  } catch (err) {
    await atualizarNfse(nfse.id, {
      status: "erro",
      erro_mensagem: err instanceof Error ? err.message : "Erro desconhecido",
      bling_payload: blingPayload,
    });
    throw Object.assign(new Error("Erro ao emitir no Bling"), {
      statusCode: 422,
      details: String(err),
    }) as EmissaoError;
  }

  const blingData = blingResult?.data ?? {};
  await atualizarNfse(nfse.id, {
    status: "autorizada",
    bling_id: String(blingData.id ?? ""),
    numero: String(blingData.numero ?? ""),
    serie: String(blingData.serie ?? ""),
    pdf_url: String(blingData.linkPdf ?? ""),
    xml_url: String(blingData.linkXml ?? ""),
    link_nota: String(blingData.linkNota ?? ""),
    bling_payload: blingPayload,
    erro_mensagem: null,
  });

  if (body.enviar_email && body.tomador_email) {
    const nfseAtualizada = {
      ...nfse,
      status: "autorizada",
      numero: String(blingData.numero ?? ""),
      serie: String(blingData.serie ?? ""),
      pdf_url: String(blingData.linkPdf ?? ""),
      xml_url: String(blingData.linkXml ?? ""),
      link_nota: String(blingData.linkNota ?? ""),
    };
    try {
      const resendId = await enviarEmailNfse(nfseAtualizada);
      await registrarEmailLog({
        nfse_id: nfse.id,
        destinatario: body.tomador_email,
        status: "enviado",
        resend_id: resendId,
      });
      await atualizarNfse(nfse.id, { email_enviado_em: new Date().toISOString() });
    } catch (emailErr) {
      await registrarEmailLog({
        nfse_id: nfse.id,
        destinatario: body.tomador_email,
        status: "falhou",
        erro: String(emailErr),
      });
    }
  }

  return { id: nfse.id };
}

async function authenticateRetryRequest(req: Request & any, res: Response, next: NextFunction) {
  const cronSecret = String(process.env.CRON_SECRET || "").trim();
  const authHeader = String(req.get("authorization") || "").trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return next();
  }
  return requireAdmin(req, res, next);
}

blingIntegrationsRouter.get("/callback", async (req: Request & any, res: Response) => {
  const admin = await ensureAdminHtmlSession(req, res);
  if (!admin) return;

  const error = String(req.query?.error || "").trim();
  const code = String(req.query?.code || "").trim();

  if (error) {
    return res
      .status(400)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Falha na autorização",
          `<h1 class="error">Falha na autorização</h1><p>O Bling retornou o erro <strong>${escapeHtml(error)}</strong>. Volte ao aplicativo do Bling e tente novamente.</p>`
        )
      );
  }

  if (!code) {
    return res
      .status(400)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Código ausente",
          "<h1 class=\"error\">Código ausente</h1><p>A callback foi aberta sem o <code>authorization_code</code> do Bling.</p>"
        )
      );
  }

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/bling/callback`;
    const tokens = await trocarCodigoBlingPorToken(code, redirectUri);
    const envSnippet = [
      `BLING_ACCESS_TOKEN=${tokens.access_token}`,
      `BLING_REFRESH_TOKEN=${tokens.refresh_token || ""}`,
    ].join("\n");

    return res
      .status(200)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Bling conectado",
          `<h1 class="success">Bling conectado com sucesso</h1>
<p>A troca do código OAuth foi concluída. Copie os tokens abaixo e atualize as variáveis do ambiente publicado.</p>
<pre>${escapeHtml(envSnippet)}</pre>
<p class="muted">Esses tokens foram carregados na memória do processo atual, mas você ainda deve salvar as envs em produção para a integração continuar funcionando após novo deploy.</p>
<p><a href="/admin/nfse/configuracoes">Abrir configurações de NFS-e</a></p>`
        )
      );
  } catch (err) {
    return res
      .status(500)
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "no-store")
      .send(
        renderHtmlPage(
          "Erro ao conectar Bling",
          `<h1 class="error">Erro ao conectar Bling</h1><p>${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`
        )
      );
  }
});

nfseRouter.get("/", requireAdmin, async (req: Request & any, res: Response) => {
  try {
    const stats = String(req.query?.stats || "").trim();
    if (stats === "true") {
      const data = await buscarStatsNfse();
      return res.json(data);
    }

    const notas = await listarNfse({
      status: String(req.query?.status || "").trim() || undefined,
      busca: String(req.query?.busca || "").trim() || undefined,
      pagina: Number(req.query?.pagina || 1),
      periodo: String(req.query?.periodo || "").trim() || undefined,
    });
    return res.json(notas);
  } catch (err) {
    console.error("[GET /api/nfse]", err);
    return res.status(500).json({ error: "Erro ao buscar notas" });
  }
});

nfseRouter.post("/", requireAdmin, requireAdminCsrfForMutations, async (req: Request & any, res: Response) => {
  try {
    const body = emitirNfseSchema.parse(req.body || {});
    const result = await processarEmissaoNfse(body);
    return res.status(201).json({ ok: true, id: result.id });
  } catch (err: unknown) {
    const typedError = err as EmissaoError;
    if (typedError?.name === "ZodError") {
      return res.status(400).json({ error: "Dados inválidos para emitir a nota." });
    }
    if (Number(typedError?.statusCode || 0) === 422) {
      return res.status(422).json({
        error: "Erro ao emitir no Bling",
        detalhes: String(typedError?.details || typedError?.message || typedError),
      });
    }
    console.error("[POST /api/nfse]", err);
    return res.status(500).json({ error: "Erro interno ao emitir nota" });
  }
});

nfseRouter.get("/export", requireAdmin, async (req: Request & any, res: Response) => {
  try {
    const { notas } = await listarNfse({
      status: String(req.query?.status || "").trim() || undefined,
      busca: String(req.query?.busca || "").trim() || undefined,
      pagina: 1,
      periodo: String(req.query?.periodo || "").trim() || undefined,
    });

    const header = "Número,Pedido,Cliente,Documento,Valor,ISS,Status,Emitida em\n";
    const rows = notas
      .map((n: any) =>
        [
          n.numero ?? "-",
          n.pedido_id,
          n.tomador_nome,
          n.tomador_documento,
          n.valor_servicos,
          n.valor_iss ?? "-",
          n.status,
          new Date(n.created_at).toLocaleDateString("pt-BR"),
        ]
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    return res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", 'attachment; filename="notas-fiscais.csv"')
      .send(header + rows);
  } catch (err) {
    console.error("[GET /api/nfse/export]", err);
    return res.status(500).json({ error: "Erro ao exportar" });
  }
});

nfseRouter.get("/retry", authenticateRetryRequest, async (_req: Request & any, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT * FROM nfse
      WHERE (
        status = 'erro' OR
        (status = 'processando' AND updated_at < NOW() - interval '5 minutes')
      )
      AND tentativas < 3
      ORDER BY created_at ASC
      LIMIT 10
    `);

    const resultados = [];

    for (const nfse of rows) {
      try {
        await atualizarNfse(nfse.id, { tentativas: Number(nfse.tentativas || 0) + 1, status: "processando" });

        const blingResult = await emitirNFSeNoBling(nfse.bling_payload);
        const blingData = blingResult?.data ?? {};

        await atualizarNfse(nfse.id, {
          status: "autorizada",
          bling_id: String(blingData.id ?? ""),
          numero: String(blingData.numero ?? ""),
          serie: String(blingData.serie ?? ""),
          pdf_url: String(blingData.linkPdf ?? ""),
          xml_url: String(blingData.linkXml ?? ""),
          link_nota: String(blingData.linkNota ?? ""),
          erro_mensagem: null,
        });

        if (nfse.tomador_email && !nfse.email_enviado_em) {
          const nfseAtualizada = {
            ...nfse,
            status: "autorizada",
            numero: String(blingData.numero ?? ""),
            serie: String(blingData.serie ?? ""),
            pdf_url: String(blingData.linkPdf ?? ""),
            xml_url: String(blingData.linkXml ?? ""),
            link_nota: String(blingData.linkNota ?? ""),
          };
          try {
            const resendId = await enviarEmailNfse(nfseAtualizada);
            await registrarEmailLog({
              nfse_id: nfse.id,
              destinatario: nfse.tomador_email,
              status: "enviado",
              resend_id: resendId,
            });
            await atualizarNfse(nfse.id, { email_enviado_em: new Date().toISOString() });
          } catch {}
        }

        resultados.push({ id: nfse.id, resultado: "sucesso" });
      } catch (err) {
        await atualizarNfse(nfse.id, { status: "erro", erro_mensagem: String(err) });
        resultados.push({ id: nfse.id, resultado: "falhou", erro: String(err) });
      }
    }

    return res.json({ processadas: resultados.length, resultados });
  } catch (err) {
    console.error("[GET /api/nfse/retry]", err);
    return res.status(500).json({ error: "Erro no retry" });
  }
});

nfseRouter.post("/:id/reenviar", requireAdmin, requireAdminCsrfForMutations, async (req: Request & any, res: Response) => {
  try {
    const nfse = await buscarNfsePorId(String(req.params?.id || "").trim());
    if (!nfse) return res.status(404).json({ error: "Nota não encontrada" });
    if (nfse.status !== "autorizada") {
      return res.status(400).json({ error: "Só é possível reenviar notas autorizadas" });
    }
    if (!nfse.tomador_email) {
      return res.status(400).json({ error: "Nota sem email do tomador" });
    }

    const resendId = await enviarEmailNfse(nfse);
    await registrarEmailLog({
      nfse_id: nfse.id,
      destinatario: nfse.tomador_email,
      status: "enviado",
      resend_id: resendId,
    });
    await atualizarNfse(req.params.id, { email_enviado_em: new Date().toISOString() });
    return res.json({ ok: true });
  } catch (err) {
    const nfse = await buscarNfsePorId(String(req.params?.id || "").trim()).catch(() => null);
    if (nfse?.tomador_email) {
      await registrarEmailLog({
        nfse_id: String(req.params?.id || "").trim(),
        destinatario: nfse.tomador_email,
        status: "falhou",
        erro: String(err),
      });
    }
    return res.status(500).json({ error: "Erro ao reenviar email" });
  }
});

nfseRouter.get("/:id", requireAdmin, async (req: Request & any, res: Response) => {
  try {
    const nfse = await buscarNfsePorId(String(req.params?.id || "").trim());
    if (!nfse) return res.status(404).json({ error: "Nota não encontrada" });
    return res.json(nfse);
  } catch (_err) {
    return res.status(500).json({ error: "Erro ao buscar nota" });
  }
});

nfseRouter.delete("/:id", requireAdmin, requireAdminCsrfForMutations, async (req: Request & any, res: Response) => {
  try {
    const nfse = await buscarNfsePorId(String(req.params?.id || "").trim());
    if (!nfse) return res.status(404).json({ error: "Nota não encontrada" });
    if (nfse.status !== "autorizada") {
      return res.status(400).json({ error: "Só é possível cancelar notas autorizadas" });
    }

    if (nfse.bling_id) await cancelarNFSeNoBling(nfse.bling_id);
    await atualizarNfse(req.params.id, { status: "cancelada" });
    return res.json({ ok: true });
  } catch (_err) {
    return res.status(500).json({ error: "Erro ao cancelar nota" });
  }
});

module.exports = {
  nfseRouter,
  blingIntegrationsRouter,
};
