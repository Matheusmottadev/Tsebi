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

module.exports = {
  sendEmail,
  sendAccountVerificationEmail,
  sendLoginVerificationEmail,
  sendPasswordResetEmail
};
