const rateLimit = require("express-rate-limit");

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
  windowMs: 30 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    message: "Acesso bloqueado. Aguarde 30 minutos."
  }
});

module.exports = {
  loginLimiter,
  forgotPasswordLimiter,
  registerLimiter,
  adminLoginLimiter
};
