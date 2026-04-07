const rateLimit = require("express-rate-limit");
const { normalizeEmail } = require("../user-repository");
const { insertAdminLoginEvent } = require("../lib/admin-login-events-repository");
const { recordAdminSecurityAlert } = require("../lib/admin-step-up");

async function handleAdminLoginRateLimit(req: any) {
  const email = normalizeEmail(req?.body?.email || "");
  await insertAdminLoginEvent({
    adminId: null,
    userId: null,
    success: false,
    ip: req.ip || "",
    userAgent: String(req.headers?.["user-agent"] || ""),
  }).catch(() => {});

  await recordAdminSecurityAlert({
    req,
    email,
    title: "Bloqueio por excesso de tentativas no login admin",
    message: `Novas tentativas de login admin foram bloqueadas para o IP ${String(req.ip || "-")}${email ? ` e e-mail ${email}` : ""}.`,
    action: "ADMIN_SUSPICIOUS_LOGIN",
    targetType: "admin_login",
    metadata: {
      reason: "admin_login_rate_limited",
      email: email || null,
    },
  }).catch(() => {});
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    message: "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente."
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    message: "Muitas tentativas. Aguarde 30 minutos antes de tentar novamente."
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    message: "Muitas tentativas. Aguarde antes de tentar novamente."
  }
});

const adminLoginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req: any, res: any) => {
    handleAdminLoginRateLimit(req).catch(() => {});
    return res.status(429).json({
      error: "TOO_MANY_ATTEMPTS",
      message: "Acesso admin bloqueado temporariamente. Aguarde 60 minutos antes de tentar novamente."
    });
  }
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
  adminLoginLimiter
};
