export {};
type EmailPayload = {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
};
type EmailSendResult = { ok: true; provider: string };
type OrderLike = {
  id?: string;
  amount?: number;
  shippingSelectedCarrierName?: string;
  shippingSelectedService?: string;
};
type ShipmentLike = { trackingCode?: string; tracking_code?: string } | null;

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAppName(): string {
  return String(process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
}

function getEmailProvider(): string {
  const explicit = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const hasResendKey = Boolean(String(process.env.RESEND_API_KEY || "").trim());
  if (explicit === "resend") return "resend";
  if (explicit === "console" && !hasResendKey) return "console";
  if (hasResendKey) return "resend";
  if (explicit) return explicit;
  return "console";
}

async function sendByResend(payload: Required<EmailPayload>): Promise<EmailSendResult> {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  const from = String(process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "").trim();
  if (!apiKey || !from) {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    })
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "EMAIL_DELIVERY_FAILED");
  }

  return { ok: true, provider: "resend" };
}

async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  const to = String(payload?.to || "").trim().toLowerCase();
  if (!to) throw new Error("INVALID_EMAIL_DESTINATION");

  const message = {
    to,
    subject: String(payload?.subject || "").trim() || `${getAppName()} - mensagem`,
    text: String(payload?.text || "").trim(),
    html: String(payload?.html || "").trim()
  };

  const provider = getEmailProvider();
  if (process.env.NODE_ENV === "production" && provider === "console") {
    throw new Error("EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  if (provider === "resend") {
    return sendByResend(message);
  }

  // Fallback local/dev.
  // eslint-disable-next-line no-console
  console.log("[EMAIL_MOCK]", JSON.stringify(message, null, 2));
  return { ok: true, provider: "console" };
}

// ─── Layout base ─────────────────────────────────────────────────────────────

function buildEmailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Tsebi</title>
</head>
<body style="margin:0;padding:0;background:#f0ede8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0ede8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;">

          <!-- HEADER -->
          <tr>
            <td style="background:#0d0d0d;padding:36px 48px;text-align:center;">
              <img
                src="https://tsebi.com.br/images/logo-tsebi.png"
                width="32"
                height="32"
                alt=""
                style="display:block;margin:0 auto 14px;opacity:0.9;"
              />
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:700;color:#ffffff;letter-spacing:12px;text-transform:uppercase;line-height:1;">TSEBI</div>
              <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:9px;color:#888888;letter-spacing:3px;text-transform:uppercase;">FORMA PRINCÍPIO E EXCELÊNCIA</div>
            </td>
          </tr>

          <!-- GOLD LINE -->
          <tr>
            <td style="background:#0d0d0d;padding:0 48px;">
              <div style="height:1px;background:#c9a96e;"></div>
            </td>
          </tr>
          <tr><td style="height:0;background:#0d0d0d;padding:0 48px 24px;"></td></tr>

          <!-- CONTENT -->
          <tr>
            <td style="background:#ffffff;padding:48px;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#0d0d0d;padding:0 48px;">
              <div style="height:1px;background:#1e1e1e;"></div>
            </td>
          </tr>
          <tr>
            <td style="background:#0d0d0d;padding:28px 48px;text-align:center;">
              <div style="font-family:Arial,sans-serif;font-size:9px;color:#555555;letter-spacing:2.5px;text-transform:uppercase;line-height:2;">
                EXCLUSIVIDADE&nbsp;&nbsp;·&nbsp;&nbsp;ELEGÂNCIA&nbsp;&nbsp;·&nbsp;&nbsp;AUTENTICIDADE&nbsp;&nbsp;·&nbsp;&nbsp;SOFISTICAÇÃO
              </div>
              <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:11px;color:#444444;">
                <a href="https://tsebi.com.br" style="color:#888888;text-decoration:none;letter-spacing:1px;">tsebi.com.br</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildHeading(text: string): string {
  return `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:400;color:#0d0d0d;margin:0 0 20px;letter-spacing:1px;line-height:1.3;">${text}</h1>`;
}

function buildBody(text: string): string {
  return `<p style="font-family:Arial,sans-serif;font-size:14px;color:#555555;line-height:1.8;margin:0 0 20px;">${text}</p>`;
}

function buildDivider(): string {
  return `<div style="height:1px;background:#e8e3dc;margin:28px 0;"></div>`;
}

function buildCodeBlock(code: string, label: string): string {
  return `
    <div style="background:#0d0d0d;padding:24px 32px;text-align:center;margin:24px 0;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:34px;letter-spacing:12px;font-weight:700;color:#ffffff;">${code}</div>
      <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:10px;color:#888888;letter-spacing:2px;text-transform:uppercase;">${label}</div>
    </div>
  `;
}

function buildInfoRow(label: string, value: string): string {
  return `
    <tr>
      <td style="font-family:Arial,sans-serif;font-size:12px;color:#888888;letter-spacing:1px;text-transform:uppercase;padding:8px 0;border-bottom:1px solid #f0ede8;width:42%;vertical-align:top;">${label}</td>
      <td style="font-family:Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:8px 0 8px 16px;border-bottom:1px solid #f0ede8;vertical-align:top;">${value}</td>
    </tr>
  `;
}

function buildCtaButton(text: string, href: string): string {
  return `
    <div style="text-align:center;margin:32px 0 8px;">
      <a href="${href}" style="display:inline-block;background:#0d0d0d;color:#ffffff;font-family:Arial,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;text-decoration:none;padding:14px 36px;">${text}</a>
    </div>
  `;
}

function buildNote(text: string): string {
  return `<p style="font-family:Arial,sans-serif;font-size:12px;color:#999999;line-height:1.7;margin:20px 0 0;text-align:center;">${text}</p>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

function buildCodeEmail({
  title,
  intro,
  code,
  minutes,
  linkText = "",
  linkHref = ""
}: {
  title: string;
  intro: string;
  code: string;
  minutes: number;
  linkText?: string;
  linkHref?: string;
}): { text: string; html: string } {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCode = escapeHtml(code);

  const text = `${title}\n\n${intro}\nCódigo: ${code}\nVálido por ${minutes} minutos.${linkHref ? `\n\n${linkText}: ${linkHref}` : ""}`;

  const content = `
    ${buildHeading(safeTitle)}
    ${buildBody(safeIntro)}
    ${buildCodeBlock(safeCode, "Código de verificação")}
    ${buildNote(`Válido por ${minutes} minutos. Não compartilhe este código com ninguém.`)}
    ${linkHref ? buildDivider() + buildCtaButton(escapeHtml(linkText), escapeHtml(linkHref)) : ""}
  `;

  return { text, html: buildEmailWrapper(content) };
}

function formatOrderCode(orderId: unknown): string {
  const id = String(orderId || "").trim();
  if (!id) return "";
  return `PED-${id.slice(-8).toUpperCase()}`;
}

function formatMoneyFromCents(value: unknown): string {
  const amount = Math.max(0, Number(value || 0)) / 100;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
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
  const corsOrigin = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
  if (corsOrigin) return normalizeBaseUrl(corsOrigin);

  const inferred =
    process.env.VERCEL_URL ||
    process.env.RAILWAY_STATIC_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RENDER_EXTERNAL_URL ||
    "";
  return normalizeBaseUrl(inferred);
}

function buildOrderDetails({
  order,
  shipment,
  statusLabel
}: {
  order: OrderLike | null | undefined;
  shipment: ShipmentLike;
  statusLabel: string;
}) {
  const orderCode = formatOrderCode(order?.id);
  const total = formatMoneyFromCents(order?.amount || 0);
  const trackingCode = String(shipment?.trackingCode || "").trim();
  const carrierName = String(order?.shippingSelectedCarrierName || "").trim();
  const serviceName = String(order?.shippingSelectedService || "").trim();
  const orderLinkBase = getPublicBaseUrl();
  const orderLink = orderLinkBase && order?.id ? `${orderLinkBase}/order.html?orderId=${encodeURIComponent(order.id)}` : "";

  const lines = [
    `Pedido: ${orderCode || order?.id || "-"}`,
    `Status: ${statusLabel}`,
    `Total: ${total}`
  ];
  if (carrierName) lines.push(`Transportadora: ${carrierName}`);
  if (serviceName) lines.push(`Serviço: ${serviceName}`);
  if (trackingCode) lines.push(`Código de rastreio: ${trackingCode}`);
  if (orderLink) lines.push(`Acompanhar pedido: ${orderLink}`);

  return { orderCode, total, trackingCode, orderLink, carrierName, serviceName, lines };
}

function buildOrderLifecycleEmail({
  title,
  intro,
  statusLabel,
  order,
  shipment = null
}: {
  title: string;
  intro: string;
  statusLabel: string;
  order: OrderLike | null | undefined;
  shipment?: ShipmentLike;
}): { text: string; html: string } {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeStatus = escapeHtml(statusLabel);
  const details = buildOrderDetails({ order, shipment, statusLabel });

  const text = `${title}\n\n${intro}\n\nPedido: ${details.orderCode || order?.id || "-"}\nStatus: ${statusLabel}\nTotal: ${details.total}${details.carrierName ? `\nTransportadora: ${details.carrierName}` : ""}${details.serviceName ? `\nServiço: ${details.serviceName}` : ""}${details.trackingCode ? `\nCódigo de rastreio: ${details.trackingCode}` : ""}${details.orderLink ? `\nAcompanhar pedido: ${details.orderLink}` : ""}\n\n${getAppName()}`;

  const rows = [
    buildInfoRow("Pedido", escapeHtml(details.orderCode || String(order?.id || "-"))),
    buildInfoRow("Status", safeStatus),
    buildInfoRow("Total", escapeHtml(details.total)),
    ...(details.carrierName ? [buildInfoRow("Transportadora", escapeHtml(details.carrierName))] : []),
    ...(details.serviceName ? [buildInfoRow("Serviço", escapeHtml(details.serviceName))] : []),
    ...(details.trackingCode ? [buildInfoRow("Rastreio", escapeHtml(details.trackingCode))] : [])
  ].join("");

  const ctaHtml = details.orderLink
    ? buildCtaButton("Acompanhar pedido", escapeHtml(details.orderLink))
    : "";

  const content = `
    ${buildHeading(safeTitle)}
    ${buildBody(safeIntro)}
    ${buildDivider()}
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows}
    </table>
    ${ctaHtml}
  `;

  return { text, html: buildEmailWrapper(content) };
}

// ─── Funções exportadas ───────────────────────────────────────────────────────

async function sendAccountVerificationEmail({
  to,
  code,
  minutes = 20
}: {
  to: string;
  code: string;
  minutes?: number;
}): Promise<EmailSendResult> {
  const content = buildCodeEmail({
    title: "Verifique seu e-mail",
    intro: "Para confirmar sua conta, use o código abaixo.",
    code,
    minutes
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Confirmação de e-mail`,
    ...content
  });
}

async function sendLoginVerificationEmail({
  to,
  code,
  minutes = 20
}: {
  to: string;
  code: string;
  minutes?: number;
}): Promise<EmailSendResult> {
  const content = buildCodeEmail({
    title: "Confirme seu acesso",
    intro: "Use o código abaixo para concluir seu login com segurança.",
    code,
    minutes
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Código de acesso`,
    ...content
  });
}

async function sendPasswordResetEmail({
  to,
  code,
  minutes = 15,
  resetUrl = ""
}: {
  to: string;
  code: string;
  minutes?: number;
  resetUrl?: string;
}): Promise<EmailSendResult> {
  const safeResetUrl = String(resetUrl || "").trim();
  const content = buildCodeEmail({
    title: "Redefinição de senha",
    intro: "Recebemos uma solicitação para redefinir sua senha. Use o código abaixo ou clique no botão para continuar.",
    code,
    minutes,
    ...(safeResetUrl
      ? { linkText: "Redefinir senha", linkHref: safeResetUrl }
      : {})
  });

  const text = safeResetUrl
    ? `${content.text}\nLink de redefinição: ${safeResetUrl}`
    : content.text;

  return sendEmail({
    to,
    subject: `${getAppName()} — Redefinição de senha`,
    text,
    html: content.html
  });
}

async function sendOrderConfirmedEmail({
  to,
  order
}: {
  to: string;
  order: OrderLike | null | undefined;
}): Promise<EmailSendResult> {
  const content = buildOrderLifecycleEmail({
    title: "Pedido confirmado.",
    intro: "Recebemos o seu pedido com sucesso. Assim que o pagamento for aprovado, você será avisado por e-mail.",
    statusLabel: "Pedido confirmado",
    order
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Pedido confirmado`,
    ...content
  });
}

async function sendPaymentApprovedEmail({
  to,
  order
}: {
  to: string;
  order: OrderLike | null | undefined;
}): Promise<EmailSendResult> {
  const content = buildOrderLifecycleEmail({
    title: "Pagamento aprovado.",
    intro: "Seu pagamento foi aprovado com sucesso. Seu pedido já está em preparação.",
    statusLabel: "Pagamento aprovado",
    order
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Pagamento aprovado`,
    ...content
  });
}

async function sendOrderShippedEmail({
  to,
  order,
  shipment
}: {
  to: string;
  order: OrderLike | null | undefined;
  shipment: ShipmentLike;
}): Promise<EmailSendResult> {
  const content = buildOrderLifecycleEmail({
    title: "Seu pedido foi enviado.",
    intro: "Seu pedido está a caminho. Use o código de rastreio abaixo para acompanhar a entrega.",
    statusLabel: "Enviado",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Pedido enviado`,
    ...content
  });
}

async function sendOrderOutForDeliveryEmail({
  to,
  order,
  shipment
}: {
  to: string;
  order: OrderLike | null | undefined;
  shipment: ShipmentLike;
}): Promise<EmailSendResult> {
  const content = buildOrderLifecycleEmail({
    title: "Saiu para entrega.",
    intro: "Seu pedido está com o entregador e chegará em breve. Fique atento ao recebimento.",
    statusLabel: "Saiu para entrega",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Saiu para entrega`,
    ...content
  });
}

async function sendOrderDeliveredEmail({
  to,
  order,
  shipment
}: {
  to: string;
  order: OrderLike | null | undefined;
  shipment: ShipmentLike;
}): Promise<EmailSendResult> {
  const content = buildOrderLifecycleEmail({
    title: "Pedido entregue.",
    intro: "Confirmamos que seu pedido foi entregue. Esperamos que você aprecie cada detalhe.",
    statusLabel: "Entregue",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} — Pedido entregue`,
    ...content
  });
}

async function sendGuestCheckoutAccountCreatedEmail({
  to,
  fullName = "",
  tempPassword
}: {
  to: string;
  fullName?: string;
  tempPassword: string;
}): Promise<EmailSendResult> {
  const appName = getAppName();
  const safeName = String(fullName || "").trim();
  const greeting = safeName ? `Olá, ${safeName}.` : "Olá.";
  const safeGreeting = escapeHtml(greeting);
  const safeTempPassword = escapeHtml(tempPassword);
  const baseUrl = getPublicBaseUrl();
  const loginUrl = baseUrl ? `${baseUrl}/login` : "https://tsebi.com.br/login";

  const text = `${greeting}\n\nCriamos um cadastro para você acompanhar seu pedido na ${appName}.\n\nSenha temporária: ${tempPassword}\n\nVocê pode acessar sua conta e trocar essa senha quando quiser.\n${appName}`;

  const content = `
    ${buildHeading("Bem-vinda à Tsebi.")}
    ${buildBody(`${safeGreeting} Criamos seu cadastro automaticamente durante o checkout para facilitar o acompanhamento do pedido.`)}
    ${buildDivider()}
    ${buildBody("Sua senha temporária:")}
    ${buildCodeBlock(safeTempPassword, "Senha temporária")}
    ${buildNote("Acesse sua conta e troque essa senha quando quiser.")}
    ${buildCtaButton("Acessar minha conta", escapeHtml(loginUrl))}
    ${buildDivider()}
    ${buildNote("Se não quiser completar o cadastro agora, sem problema — as atualizações do pedido continuarão chegando por e-mail.")}
  `;

  return sendEmail({
    to,
    subject: `${appName} — Sua conta foi criada`,
    text,
    html: buildEmailWrapper(content)
  });
}

module.exports = {
  sendEmail,
  sendAccountVerificationEmail,
  sendLoginVerificationEmail,
  sendPasswordResetEmail,
  sendOrderConfirmedEmail,
  sendPaymentApprovedEmail,
  sendOrderShippedEmail,
  sendOrderOutForDeliveryEmail,
  sendOrderDeliveredEmail,
  sendGuestCheckoutAccountCreatedEmail
};
