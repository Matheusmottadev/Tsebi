function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAppName() {
  return String(process.env.APP_NAME || "Tsebi").trim() || "Tsebi";
}

function getEmailProvider() {
  const explicit = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  if (explicit) return explicit;
  if (String(process.env.RESEND_API_KEY || "").trim()) return "resend";
  return "console";
}

async function sendByResend(payload) {
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

async function sendEmail(payload) {
  const to = String(payload?.to || "").trim().toLowerCase();
  if (!to) throw new Error("INVALID_EMAIL_DESTINATION");

  const message = {
    to,
    subject: String(payload?.subject || "").trim() || `${getAppName()} - mensagem`,
    text: String(payload?.text || "").trim(),
    html: String(payload?.html || "").trim()
  };

  const provider = getEmailProvider();
  if (provider === "resend") {
    return sendByResend(message);
  }

  // Fallback local/dev.
  // eslint-disable-next-line no-console
  console.log("[EMAIL_MOCK]", JSON.stringify(message, null, 2));
  return { ok: true, provider: "console" };
}

function buildCodeEmail({ title, intro, code, minutes }) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCode = escapeHtml(code);
  const safeMinutes = escapeHtml(minutes);
  const appName = escapeHtml(getAppName());

  const text = `${title}\n\n${intro}\nCodigo: ${code}\nValido por ${minutes} minutos.`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
      <h2 style="margin:0 0 10px;">${safeTitle}</h2>
      <p style="margin:0 0 14px;">${safeIntro}</p>
      <p style="margin:0 0 8px;">Seu codigo:</p>
      <div style="font-size:28px;letter-spacing:6px;font-weight:700;background:#f4f4f4;padding:10px 14px;display:inline-block;">${safeCode}</div>
      <p style="margin:14px 0 0;color:#555;">Valido por ${safeMinutes} minutos.</p>
      <p style="margin:8px 0 0;color:#777;">${appName}</p>
    </div>
  `;

  return { text, html };
}

function formatOrderCode(orderId) {
  const id = String(orderId || "").trim();
  if (!id) return "";
  return `PED-${id.slice(-8).toUpperCase()}`;
}

function formatMoneyFromCents(value) {
  const amount = Math.max(0, Number(value || 0)) / 100;
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount);
  } catch {
    return `R$ ${amount.toFixed(2)}`;
  }
}

function getPublicBaseUrl() {
  const explicit = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.SITE_URL || "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const corsOrigin = String(process.env.CORS_ORIGIN || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
  return corsOrigin ? corsOrigin.replace(/\/+$/, "") : "";
}

function buildOrderDetails({ order, shipment, statusLabel }) {
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
  if (serviceName) lines.push(`Servico: ${serviceName}`);
  if (trackingCode) lines.push(`Codigo de rastreio: ${trackingCode}`);
  if (orderLink) lines.push(`Acompanhar pedido: ${orderLink}`);

  return {
    orderCode,
    total,
    trackingCode,
    orderLink,
    lines
  };
}

function buildOrderLifecycleEmail({ title, intro, statusLabel, order, shipment = null }) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeStatus = escapeHtml(statusLabel);
  const appName = escapeHtml(getAppName());
  const details = buildOrderDetails({ order, shipment, statusLabel });

  const text = `${title}\n\n${intro}\n\n${details.lines.join("\n")}\n\n${getAppName()}`;
  const htmlLines = details.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  const orderLinkHtml = details.orderLink
    ? `<p style="margin:14px 0 0;"><a href="${escapeHtml(details.orderLink)}" style="color:#111;text-decoration:underline;">Ver detalhes do pedido</a></p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;color:#111;line-height:1.5;">
      <h2 style="margin:0 0 10px;">${safeTitle}</h2>
      <p style="margin:0 0 14px;">${safeIntro}</p>
      <p style="margin:0 0 8px;"><strong>Status atual:</strong> ${safeStatus}</p>
      <ul style="margin:0 0 10px 18px;padding:0;">
        ${htmlLines}
      </ul>
      ${orderLinkHtml}
      <p style="margin:12px 0 0;color:#777;">${appName}</p>
    </div>
  `;

  return { text, html };
}

async function sendAccountVerificationEmail({ to, code, minutes = 20 }) {
  const content = buildCodeEmail({
    title: "Verifique seu email",
    intro: "Use o codigo abaixo para confirmar sua conta.",
    code,
    minutes
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Confirmacao de email`,
    ...content
  });
}

async function sendLoginVerificationEmail({ to, code, minutes = 10 }) {
  const content = buildCodeEmail({
    title: "Confirme seu login",
    intro: "Use o codigo abaixo para concluir seu login com seguranca.",
    code,
    minutes
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Codigo de login`,
    ...content
  });
}

async function sendPasswordResetEmail({ to, code, minutes = 15 }) {
  const content = buildCodeEmail({
    title: "Redefina sua senha",
    intro: "Use o codigo abaixo para criar uma nova senha.",
    code,
    minutes
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Redefinicao de senha`,
    ...content
  });
}

async function sendOrderConfirmedEmail({ to, order }) {
  const content = buildOrderLifecycleEmail({
    title: "Pedido confirmado",
    intro: "Recebemos o seu pedido com sucesso. Assim que o pagamento for aprovado, avisaremos por email.",
    statusLabel: "Pedido confirmado",
    order
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Pedido confirmado`,
    ...content
  });
}

async function sendPaymentApprovedEmail({ to, order }) {
  const content = buildOrderLifecycleEmail({
    title: "Pagamento aprovado",
    intro: "Pagamento aprovado com sucesso. Seu pedido entrou em preparacao.",
    statusLabel: "Pagamento aprovado",
    order
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Pagamento aprovado`,
    ...content
  });
}

async function sendOrderShippedEmail({ to, order, shipment }) {
  const content = buildOrderLifecycleEmail({
    title: "Pedido enviado",
    intro: "Seu pedido foi enviado e a etiqueta de transporte foi gerada.",
    statusLabel: "Pedido enviado",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Pedido enviado`,
    ...content
  });
}

async function sendOrderOutForDeliveryEmail({ to, order, shipment }) {
  const content = buildOrderLifecycleEmail({
    title: "Saiu para entrega",
    intro: "Seu pedido esta a caminho. Fique atento para o recebimento.",
    statusLabel: "Saiu para entrega",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Saiu para entrega`,
    ...content
  });
}

async function sendOrderDeliveredEmail({ to, order, shipment }) {
  const content = buildOrderLifecycleEmail({
    title: "Pedido entregue",
    intro: "Confirmamos que seu pedido foi entregue.",
    statusLabel: "Entregue",
    order,
    shipment
  });

  return sendEmail({
    to,
    subject: `${getAppName()} - Pedido entregue`,
    ...content
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
  sendOrderDeliveredEmail
};
