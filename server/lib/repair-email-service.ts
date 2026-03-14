export {};

const { sendEmail } = require("./email-service") as {
  sendEmail: (payload: { to: string; subject?: string; text?: string; html?: string }) => Promise<{ ok: true; provider: string }>;
};

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

export interface RepairEmailData {
  clientName: string;
  clientEmail: string;
  pieceName: string;
  orderRef: string;
  repairDescription: string;
}

function buildConfirmationHtml(data: RepairEmailData): string {
  const safeName = escapeHtml(data.clientName || "Cliente");
  const safePieceName = escapeHtml(data.pieceName);
  const safeOrderRef = escapeHtml(data.orderRef);
  const safeDescription = escapeHtml(data.repairDescription);
  const followUrl = `${getPublicBaseUrl()}/account#repairs`;

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
            <td style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Solicitação recebida</td>
          </tr>
          <tr>
            <td style="padding-top:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;line-height:1.2;color:#1a1a1a;">Sua solicitação de reparo foi recebida.</td>
          </tr>
          <tr>
            <td style="padding-top:18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#4a4a4a;">
              Olá, ${safeName}. Agradecemos a confiança. Nossa equipe de ateliê analisará sua peça com o mesmo rigor aplicado durante sua criação e retornará com uma avaliação detalhada em até 7 dias úteis.
            </td>
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
                  <td style="padding:18px 18px 8px;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#ffffff;font-weight:700;">PRAZO DE RESPOSTA: 7 DIAS ÚTEIS</td>
                </tr>
                <tr>
                  <td style="padding:0 18px 18px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#ffffff;">Nossa equipe entrará em contato pelo e-mail cadastrado com a avaliação completa e os próximos passos do reparo.</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="50%" valign="top" style="padding:0 12px 18px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr><td style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#e0e0e0;">01</td></tr>
                      <tr><td style="padding-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1a1a1a;">Solicitação</td></tr>
                      <tr><td style="padding-top:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#4a4a4a;">Formulário enviado com os detalhes da peça e do reparo necessário.</td></tr>
                    </table>
                  </td>
                  <td width="50%" valign="top" style="padding:0 0 18px 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr><td style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#e0e0e0;">02</td></tr>
                      <tr><td style="padding-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1a1a1a;">Análise</td></tr>
                      <tr><td style="padding-top:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#4a4a4a;">Nossa equipe avalia e define o melhor procedimento. Retorno em até 7 dias úteis.</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td width="50%" valign="top" style="padding:0 12px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr><td style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#e0e0e0;">03</td></tr>
                      <tr><td style="padding-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1a1a1a;">Envio</td></tr>
                      <tr><td style="padding-top:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#4a4a4a;">Instruções de envio da peça ao ateliê serão enviadas por e-mail após a análise.</td></tr>
                    </table>
                  </td>
                  <td width="50%" valign="top" style="padding:0 0 0 12px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr><td style="font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#e0e0e0;">04</td></tr>
                      <tr><td style="padding-top:6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;color:#1a1a1a;">Devolução</td></tr>
                      <tr><td style="padding-top:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.7;color:#4a4a4a;">Após o reparo, a peça é devolvida ao endereço indicado com frete incluso.</td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:22px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Casos atendidos</td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font-family:Arial,sans-serif;font-size:13px;line-height:2;color:#1a1a1a;">
                    <span style="color:#1a1a1a;">●</span> Defeitos de costura ou acabamento<br />
                    <span style="color:#1a1a1a;">●</span> Problemas com zíperes, botões ou fechos<br />
                    <span style="color:#1a1a1a;">●</span> Desgaste natural do tecido em uso normal<br />
                    <span style="color:#1a1a1a;">●</span> Danos no forro ou estrutura interna da peça<br />
                    <span style="color:#1a1a1a;">●</span> Desfiamentos ou aberturas nas emendas
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Casos não atendidos</td>
                </tr>
                <tr>
                  <td style="padding-top:12px;font-family:Arial,sans-serif;font-size:13px;line-height:2;color:#1a1a1a;">
                    <span style="color:#b03030;">●</span> Danos causados por mau uso ou negligência<br />
                    <span style="color:#b03030;">●</span> Rasgos, manchas ou queimaduras por descuido<br />
                    <span style="color:#b03030;">●</span> Danos causados por lavagem inadequada (contrário à etiqueta)<br />
                    <span style="color:#b03030;">●</span> Alterações feitas por terceiros fora da Tsebi<br />
                    <span style="color:#b03030;">●</span> Peças com sinais evidentes de uso excessivo fora do padrão normal
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:20px;font-family:Arial,sans-serif;font-size:13px;line-height:1.8;color:#8a8a8a;font-style:italic;">
              Todas as peças Tsebi passam por rigoroso controle de qualidade antes do envio. Em até 7 dias após o recebimento, realizamos a troca da peça sem custo. Após esse prazo, oferecemos 1 ano de serviço de reparos mediante avaliação prévia da nossa equipe. A aprovação do reparo está sujeita à análise individual de cada caso.
            </td>
          </tr>
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
          <tr>
            <td style="padding-top:20px;font-family:Arial,sans-serif;font-size:12px;line-height:1.8;color:#7a7a7a;">
              <strong>Descrição informada:</strong> ${safeDescription}
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
  decisionLabel: string;
  clientName: string;
  clientEmail: string;
  pieceName: string;
  orderRef: string;
  reason?: string;
}) {
  const safeName = escapeHtml(input.clientName || "Cliente");
  const safePieceName = escapeHtml(input.pieceName);
  const safeOrderRef = escapeHtml(input.orderRef);
  const safeReason = escapeHtml(input.reason || "");
  const followUrl = `${getPublicBaseUrl()}/account#repairs`;

  const html = wrapEmail(`
    <tr>
      <td align="center" style="padding:36px 24px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td align="center" style="font-family:Arial,sans-serif;font-size:30px;letter-spacing:.24em;color:#1a1a1a;">TSEBI</td></tr>
          <tr><td align="center" style="padding-top:8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.16em;color:#b0b0b0;text-transform:uppercase;">Serviço de Reparos</td></tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:0 24px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Atualização da solicitação</td></tr>
          <tr><td style="padding-top:8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#1a1a1a;">${escapeHtml(input.title)}</td></tr>
          <tr><td style="padding-top:18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#4a4a4a;">Olá, ${safeName}. ${escapeHtml(input.intro)}</td></tr>
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border:1px solid #ebebeb;">
                <tr><td style="padding:18px 18px 8px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Peça solicitada</td></tr>
                <tr><td style="padding:0 18px 6px;font-family:'Cormorant Garamond',Georgia,serif;font-size:24px;color:#1a1a1a;">${safePieceName}</td></tr>
                <tr><td style="padding:0 18px 18px;font-family:Arial,sans-serif;font-size:13px;color:#8a8a8a;">${safeOrderRef}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#1a1a1a;">
                <tr><td style="padding:16px 18px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#ffffff;font-weight:700;">STATUS DA SOLICITAÇÃO: ${escapeHtml(input.decisionLabel)}</td></tr>
              </table>
            </td>
          </tr>
          ${
            safeReason
              ? `
          <tr>
            <td style="padding-top:18px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fff;border:1px solid #ebebeb;">
                <tr><td style="padding:16px 18px 8px;font-family:Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#bbb;text-transform:uppercase;">Motivo informado</td></tr>
                <tr><td style="padding:0 18px 16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;color:#4a4a4a;">${safeReason}</td></tr>
              </table>
            </td>
          </tr>`
              : ""
          }
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
  `);

  return {
    html,
    text: `${input.title}\n\n${input.intro}\n\nPeça: ${dataOrEmpty(input.pieceName)}\nPedido: ${dataOrEmpty(input.orderRef)}${safeReason ? `\nMotivo: ${input.reason}` : ""}\n\nAcompanhe em: ${followUrl}`,
  };
}

function dataOrEmpty(value: unknown): string {
  return String(value || "").trim();
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
    decisionLabel: "ACEITA",
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
    decisionLabel: "RECUSADA",
    reason: data.rejectionReason,
    ...data,
  });

  await sendEmail({
    to: data.clientEmail,
    subject: "TSEBI — Solicitação de reparo recusada",
    html: content.html,
    text: content.text,
  });
}

module.exports = {
  sendRepairConfirmationEmail,
  sendRepairAcceptedEmail,
  sendRepairRejectedEmail,
};
