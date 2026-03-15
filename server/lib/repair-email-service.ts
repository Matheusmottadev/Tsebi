export {};

const { sendEmail } = require("./email-service") as {
  sendEmail: (payload: { to: string; subject?: string; text?: string; html?: string }) => Promise<{ ok: true; provider: string }>;
};

export interface RepairEmailData {
  clientName: string;
  clientEmail: string;
  pieceName: string;
  orderRef: string;
  repairDescription: string;
}

type RepairStageEmailStatus = "awaiting_shipment" | "item_received" | "in_repair" | "completed" | "returned";

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeBaseUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/+$/, "");
}

function getPublicBaseUrl(): string {
  const explicit = String(
    process.env.APP_BASE_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.SITE_URL ||
      process.env.PUBLIC_SITE_URL ||
      ""
  ).trim();
  if (explicit) return normalizeBaseUrl(explicit);
  return "https://tsebi.com.br";
}

function dataOrEmpty(value: unknown): string {
  return String(value || "").trim();
}

function wrapEmail(content: string): string {
  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>TSEBI</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f4f2;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f4f4f2;">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #ebebeb;">
                ${content}
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function buildEmailLayout(input: {
  eyebrow: string;
  title: string;
  intro: string;
  pieceName: string;
  orderRef: string;
  bannerLabel: string;
  reasonLabel?: string;
  reasonText?: string;
  extraBlockHtml?: string;
}) {
  const followUrl = `${getPublicBaseUrl()}/account#repairs`;
  const safePieceName = escapeHtml(input.pieceName);
  const safeOrderRef = escapeHtml(input.orderRef);
  const safeReasonLabel = escapeHtml(input.reasonLabel || "");
  const safeReasonText = escapeHtml(input.reasonText || "");

  return wrapEmail(`
    <tr>
      <td align="center" style="padding:36px 24px 22px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="center" style="font-family:Arial,sans-serif;font-size:30px;letter-spacing:.24em;color:#1a1a1a;">TSEBI</td>
          </tr>
          <tr>
            <td align="center" style="padding-top:8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.16em;color:#b0b0b0;text-transform:uppercase;">Serviço de Reparos</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;line-height:1.2;color:#1a1a1a;">${escapeHtml(input.title)}</td>
          </tr>
          <tr>
            <td style="padding-top:18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#4a4a4a;">${escapeHtml(input.intro)}</td>
          </tr>
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border:1px solid #ebebeb;">
                <tr>
                  <td style="padding:18px 18px 8px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Peça solicitada</td>
                </tr>
                <tr>
                  <td style="padding:0 18px 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;line-height:1.2;color:#1a1a1a;">${safePieceName}</td>
                </tr>
                <tr>
                  <td style="padding:0 18px 18px;font-family:Arial,sans-serif;font-size:13px;color:#8a8a8a;">${safeOrderRef}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;">
                <tr>
                  <td style="padding:16px 18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#ffffff;font-weight:700;">${escapeHtml(input.bannerLabel)}</td>
                </tr>
              </table>
            </td>
          </tr>
          ${
            safeReasonText
              ? `
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff;border:1px solid #ebebeb;">
                <tr>
                  <td style="padding:16px 18px 8px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">${safeReasonLabel || "Detalhes"}</td>
                </tr>
                <tr>
                  <td style="padding:0 18px 16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#4a4a4a;">${safeReasonText}</td>
                </tr>
              </table>
            </td>
          </tr>`
              : ""
          }
          ${input.extraBlockHtml || ""}
          <tr>
            <td style="padding-top:24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="background:#1a1a1a;">
                    <a href="${escapeHtml(followUrl)}" style="display:inline-block;padding:14px 26px;font-family:Arial,sans-serif;font-size:12px;letter-spacing:.12em;color:#ffffff;text-decoration:none;text-transform:uppercase;">Acompanhar solicitação</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td align="center" style="padding:20px 24px 30px;border-top:1px solid #ebebeb;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td align="center" style="font-family:Arial,sans-serif;font-size:22px;letter-spacing:.22em;color:#1a1a1a;">TSEBI</td>
          </tr>
          <tr>
            <td align="center" style="padding-top:12px;font-family:Arial,sans-serif;font-size:12px;line-height:1.8;color:#777;">
              Estrada Turística do Jaraguá, 1405 · São Paulo<br />
              tsebi.com.br · reparos@tsebi.com.br
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `);
}

function buildRepairStatusEmail(input: {
  title: string;
  intro: string;
  bannerLabel: string;
  clientName: string;
  clientEmail: string;
  pieceName: string;
  orderRef: string;
  reasonLabel?: string;
  reasonText?: string;
}) {
  const safeName = escapeHtml(input.clientName || "Cliente");
  const html = buildEmailLayout({
    eyebrow: "Atualização da solicitação",
    title: input.title,
    intro: `Olá, ${safeName}. ${escapeHtml(input.intro)}`,
    pieceName: input.pieceName,
    orderRef: input.orderRef,
    bannerLabel: input.bannerLabel,
    reasonLabel: input.reasonLabel,
    reasonText: input.reasonText,
  });
  const followUrl = `${getPublicBaseUrl()}/account#repairs`;
  return {
    html,
    text: `${input.title}\n\n${input.intro}\n\nPeça: ${dataOrEmpty(input.pieceName)}\nPedido: ${dataOrEmpty(input.orderRef)}${input.reasonText ? `\n${dataOrEmpty(input.reasonLabel || "Detalhes")}: ${dataOrEmpty(input.reasonText)}` : ""}\n\nAcompanhe em: ${followUrl}`,
  };
}

function buildConfirmationHtml(data: RepairEmailData): string {
  const safeName = escapeHtml(data.clientName || "Cliente");
  const safeDescription = escapeHtml(data.repairDescription);
  return buildEmailLayout({
    eyebrow: "Solicitação recebida",
    title: "Sua solicitação de reparo foi recebida.",
    intro: `Olá, ${safeName}. Agradecemos a confiança. Nossa equipe de ateliê analisará sua peça com o mesmo rigor aplicado durante sua criação e retornará com uma avaliação detalhada em até 7 dias úteis.`,
    pieceName: data.pieceName,
    orderRef: data.orderRef,
    bannerLabel: "PRAZO DE RESPOSTA: 7 DIAS ÚTEIS",
    reasonLabel: "Descrição informada",
    reasonText: data.repairDescription,
    extraBlockHtml: `
      <tr>
        <td style="padding-top:18px;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;color:#8a8a8a;font-style:italic;">
          ${safeDescription}
        </td>
      </tr>
    `,
  });
}

export async function sendRepairConfirmationEmail(data: RepairEmailData): Promise<void> {
  const subject = "TSEBI — Solicitação de reparo recebida";
  const html = buildConfirmationHtml(data);
  const text = `Sua solicitação de reparo foi recebida.\n\nPeça: ${dataOrEmpty(data.pieceName)}\nPedido: ${dataOrEmpty(data.orderRef)}\nDescrição: ${dataOrEmpty(data.repairDescription)}\n\nNossa equipe retornará com uma avaliação em até 7 dias úteis.\nAcompanhe em: ${getPublicBaseUrl()}/account#repairs`;
  await sendEmail({
    to: data.clientEmail,
    subject,
    html,
    text,
  });
}

export async function sendRepairAcceptedEmail(data: RepairEmailData): Promise<void> {
  const content = buildRepairStatusEmail({
    title: "Sua solicitação de reparo foi aceita.",
    intro: "Nossa equipe concluiu a análise e aprovou o seu pedido de reparo. Em breve enviaremos os próximos passos para o envio da peça.",
    bannerLabel: "STATUS DA SOLICITAÇÃO: ACEITA",
    ...data,
  });

  await sendEmail({
    to: data.clientEmail,
    subject: "TSEBI — Solicitação de reparo aceita",
    html: content.html,
    text: content.text,
  });
}

export async function sendRepairRejectedEmail(
  data: RepairEmailData & { rejectionReason: string }
): Promise<void> {
  const content = buildRepairStatusEmail({
    title: "Sua solicitação de reparo foi recusada.",
    intro: "Nossa equipe concluiu a análise do seu pedido de reparo. Desta vez, não foi possível aprovar a solicitação.",
    bannerLabel: "STATUS DA SOLICITAÇÃO: RECUSADA",
    reasonLabel: "Motivo informado",
    reasonText: data.rejectionReason,
    ...data,
  });

  await sendEmail({
    to: data.clientEmail,
    subject: "TSEBI — Solicitação de reparo recusada",
    html: content.html,
    text: content.text,
  });
}

function getRepairStageEmailConfig(status: RepairStageEmailStatus) {
  if (status === "awaiting_shipment") {
    return {
      subject: "TSEBI — Reparo aguardando envio da peça",
      title: "Seu reparo aguarda o envio da peça.",
      intro: "Nossa equipe concluiu a análise inicial e agora aguarda o envio da peça para continuar o processo de reparo.",
      bannerLabel: "STATUS DO REPARO: AGUARDANDO ENVIO",
    };
  }
  if (status === "item_received") {
    return {
      subject: "TSEBI — Sua peça foi recebida",
      title: "Sua peça foi recebida pela nossa equipe.",
      intro: "Confirmamos o recebimento da peça no ateliê. O reparo seguirá para a próxima etapa do processo.",
      bannerLabel: "STATUS DO REPARO: PEÇA RECEBIDA",
    };
  }
  if (status === "in_repair") {
    return {
      subject: "TSEBI — Seu reparo está em andamento",
      title: "Seu reparo está em andamento.",
      intro: "Nossa equipe já iniciou o reparo da sua peça. Avisaremos por e-mail quando houver nova movimentação.",
      bannerLabel: "STATUS DO REPARO: EM REPARO",
    };
  }
  if (status === "completed") {
    return {
      subject: "TSEBI — Seu reparo foi finalizado",
      title: "Seu reparo foi finalizado.",
      intro: "A etapa de reparo da sua peça foi concluída com sucesso. Agora seguimos com os preparativos para a devolução.",
      bannerLabel: "STATUS DO REPARO: FINALIZADO",
    };
  }
  return {
    subject: "TSEBI — Sua peça foi devolvida",
    title: "Sua peça foi devolvida.",
    intro: "O processo de reparo foi concluído e a peça já foi devolvida conforme o fluxo combinado com a nossa equipe.",
    bannerLabel: "STATUS DO REPARO: DEVOLVIDO",
  };
}

export async function sendRepairStageUpdateEmail(
  data: RepairEmailData & { status: RepairStageEmailStatus }
): Promise<void> {
  const config = getRepairStageEmailConfig(data.status);
  const content = buildRepairStatusEmail({
    title: config.title,
    intro: config.intro,
    bannerLabel: config.bannerLabel,
    ...data,
  });

  await sendEmail({
    to: data.clientEmail,
    subject: config.subject,
    html: content.html,
    text: content.text,
  });
}

module.exports = {
  sendRepairConfirmationEmail,
  sendRepairAcceptedEmail,
  sendRepairRejectedEmail,
  sendRepairStageUpdateEmail,
};
