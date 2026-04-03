export {};
const { getMelhorEnvioTokens, saveMelhorEnvioTokens } = require("../../server/lib/melhorenvio-token-repository");

const TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;

function readEnv(name: any, fallback: any = "") {
  return String(process.env[name] || fallback).trim();
}

function getLegacyEnvName() {
  return readEnv("MELHOR_ENVIO_ENV", "sandbox").toLowerCase() || "sandbox";
}

function normalizeBaseUrl(value: any) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  return trimmed;
}

function getMelhorEnvioApiBaseUrl() {
  const configured = normalizeBaseUrl(readEnv("MELHORENVIO_BASE_URL", ""));
  if (configured) {
    if (configured.endsWith("/api/v2")) return configured;
    return `${configured}/api/v2`;
  }

  if (getLegacyEnvName() === "production") {
    return "https://melhorenvio.com.br/api/v2";
  }
  return "https://sandbox.melhorenvio.com.br/api/v2";
}

function getMelhorEnvioOrigin() {
  const apiBase = getMelhorEnvioApiBaseUrl();
  return apiBase.replace(/\/api\/v2$/, "");
}

function getMelhorEnvioTokenUrl() {
  return `${getMelhorEnvioOrigin()}/oauth/token`;
}

function getMelhorEnvioAuthorizeUrlBase() {
  return `${getMelhorEnvioOrigin()}/oauth/authorize`;
}

function getMelhorEnvioUserAgent() {
  const explicit = readEnv("MELHORENVIO_USER_AGENT", "");
  if (explicit) return explicit;
  return "Tsebi (contato@tsebi.com.br)";
}

function getStaticAccessToken() {
  const modern = readEnv("MELHORENVIO_ACCESS_TOKEN", "");
  if (modern) return modern;
  return readEnv("MELHOR_ENVIO_TOKEN", "");
}

function getMelhorEnvioRedirectUri() {
  const configured = readEnv("MELHORENVIO_REDIRECT_URI", "");
  if (configured) return configured;
  const appBase = readEnv("APP_BASE_URL", "https://tsebi.com.br").replace(/\/+$/, "");
  return `${appBase}/api/shipping/melhorenvio/callback`;
}

function getMelhorEnvioClientId() {
  const clientIdRaw = readEnv("MELHORENVIO_CLIENT_ID", "");
  if (!clientIdRaw) return "";
  return /^\d+$/.test(clientIdRaw) ? Number(clientIdRaw) : clientIdRaw;
}

function buildTokenRequestPayload({ grantType, refreshToken }: any) {
  const clientIdRaw = readEnv("MELHORENVIO_CLIENT_ID", "");
  const clientId = getMelhorEnvioClientId();
  const payload: any = {
    grant_type: grantType,
    client_id: clientId || clientIdRaw,
    client_secret: readEnv("MELHORENVIO_CLIENT_SECRET", "")
  };

  const redirectUri = getMelhorEnvioRedirectUri();
  if (redirectUri) payload.redirect_uri = redirectUri;

  const authCode = readEnv("MELHORENVIO_AUTH_CODE", "");
  if (authCode) payload.code = authCode;

  if (refreshToken) payload.refresh_token = refreshToken;
  return payload;
}

async function parseJsonResponse(response: any) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestRefreshedToken(currentRefreshToken: any) {
  const payload = buildTokenRequestPayload({
    grantType: "refresh_token",
    refreshToken: currentRefreshToken
  });

  if (!payload.client_id || !payload.client_secret || !payload.refresh_token) {
    const error = new Error("MELHORENVIO_OAUTH_NOT_CONFIGURED");
    error.code = "MELHORENVIO_OAUTH_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const response = await fetch(getMelhorEnvioTokenUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getMelhorEnvioUserAgent()
    },
    body: JSON.stringify(payload)
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const detail = data?.message || data?.error_description || data?.error || "MELHORENVIO_TOKEN_REFRESH_FAILED";
    const error = new Error(String(detail));
    error.code = "MELHORENVIO_TOKEN_REFRESH_FAILED";
    error.status = response.status;
    error.payload = data || null;
    throw error;
  }

  const accessToken = String(data?.access_token || "").trim();
  const refreshToken = String(data?.refresh_token || currentRefreshToken || "").trim();
  const expiresIn = Number(data?.expires_in || 0);
  const scope = String(data?.scope || "").trim();

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    const error = new Error("MELHORENVIO_TOKEN_RESPONSE_INVALID");
    error.code = "MELHORENVIO_TOKEN_RESPONSE_INVALID";
    error.status = 500;
    error.payload = data || null;
    throw error;
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return saveMelhorEnvioTokens({
    accessToken,
    refreshToken,
    expiresAt,
    scope
  });
}

async function exchangeMelhorEnvioAuthCode(authCode: any) {
  const normalizedCode = String(authCode || "").trim();
  if (!normalizedCode) {
    const error = new Error("MELHORENVIO_AUTH_CODE_MISSING");
    error.code = "MELHORENVIO_AUTH_CODE_MISSING";
    error.status = 400;
    throw error;
  }

  const payload = buildTokenRequestPayload({
    grantType: "authorization_code",
    refreshToken: ""
  });
  payload.code = normalizedCode;

  if (!payload.client_id || !payload.client_secret || !payload.code || !payload.redirect_uri) {
    const error = new Error("MELHORENVIO_OAUTH_NOT_CONFIGURED");
    error.code = "MELHORENVIO_OAUTH_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const response = await fetch(getMelhorEnvioTokenUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": getMelhorEnvioUserAgent()
    },
    body: JSON.stringify(payload)
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    const detail = data?.message || data?.error_description || data?.error || "MELHORENVIO_TOKEN_EXCHANGE_FAILED";
    const error = new Error(String(detail));
    error.code = "MELHORENVIO_TOKEN_EXCHANGE_FAILED";
    error.status = response.status;
    error.payload = data || null;
    throw error;
  }

  const accessToken = String(data?.access_token || "").trim();
  const refreshToken = String(data?.refresh_token || "").trim();
  const expiresIn = Number(data?.expires_in || 0);
  const scope = String(data?.scope || "").trim();

  if (!accessToken || !refreshToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    const error = new Error("MELHORENVIO_TOKEN_RESPONSE_INVALID");
    error.code = "MELHORENVIO_TOKEN_RESPONSE_INVALID";
    error.status = 500;
    error.payload = data || null;
    throw error;
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return saveMelhorEnvioTokens({
    accessToken,
    refreshToken,
    expiresAt,
    scope
  });
}

function buildMelhorEnvioAuthorizeUrl({ state = "" }: any = {}) {
  const clientId = getMelhorEnvioClientId();
  const clientSecret = readEnv("MELHORENVIO_CLIENT_SECRET", "");
  if (!clientId || !clientSecret) {
    const error = new Error("MELHORENVIO_OAUTH_NOT_CONFIGURED");
    error.code = "MELHORENVIO_OAUTH_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  const url = new URL(getMelhorEnvioAuthorizeUrlBase());
  url.searchParams.set("client_id", String(clientId));
  url.searchParams.set("redirect_uri", getMelhorEnvioRedirectUri());
  url.searchParams.set("response_type", "code");

  const scope = readEnv("MELHORENVIO_SCOPE", "");
  if (scope) url.searchParams.set("scope", scope);
  if (state) url.searchParams.set("state", String(state));

  return url.toString();
}

async function getMelhorEnvioConnectionStatus() {
  const tokens = await getMelhorEnvioTokens();
  return {
    configured: Boolean(readEnv("MELHORENVIO_CLIENT_ID", "") && readEnv("MELHORENVIO_CLIENT_SECRET", "")),
    redirectUri: getMelhorEnvioRedirectUri(),
    hasTokens: Boolean(tokens?.accessToken && tokens?.refreshToken),
    expiresAt: tokens?.expiresAt || null,
    updatedAt: tokens?.updatedAt || null,
    scope: tokens?.scope || readEnv("MELHORENVIO_SCOPE", "")
  };
}

function tokenIsExpired(expiresAt: any) {
  const timestamp = new Date(expiresAt || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
  return timestamp - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
}

async function bootstrapTokensFromEnvIfNeeded(existingTokens: any) {
  if (existingTokens) return existingTokens;

  const accessToken = readEnv("MELHORENVIO_ACCESS_TOKEN", "");
  const refreshToken = readEnv("MELHORENVIO_REFRESH_TOKEN", "");
  if (!accessToken || !refreshToken) return null;

  const expiresAtEnv = readEnv("MELHORENVIO_ACCESS_EXPIRES_AT", "");
  const fallbackExpiry = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
  const expiresAt = expiresAtEnv || fallbackExpiry;

  return saveMelhorEnvioTokens({
    accessToken,
    refreshToken,
    expiresAt,
    scope: readEnv("MELHORENVIO_SCOPE", "")
  });
}

async function getMelhorEnvioAccessToken() {
  const staticToken = getStaticAccessToken();
  if (staticToken) {
    return {
      token: staticToken,
      mode: "static"
    };
  }

  let tokens = await getMelhorEnvioTokens();
  tokens = await bootstrapTokensFromEnvIfNeeded(tokens);
  if (!tokens) {
    const error = new Error("MELHORENVIO_TOKENS_NOT_CONFIGURED");
    error.code = "MELHORENVIO_TOKENS_NOT_CONFIGURED";
    error.status = 500;
    throw error;
  }

  if (!tokenIsExpired(tokens.expiresAt)) {
    return {
      token: String(tokens.accessToken || ""),
      mode: "oauth",
      expiresAt: tokens.expiresAt
    };
  }

  const refreshed = await requestRefreshedToken(tokens.refreshToken);
  return {
    token: String(refreshed?.accessToken || ""),
    mode: "oauth",
    expiresAt: refreshed?.expiresAt || null
  };
}

async function melhorEnvioApiRequest(path: any, { method = "GET", body, headers = {} }: any = {}) {
  const access = await getMelhorEnvioAccessToken();
  const response = await fetch(`${getMelhorEnvioApiBaseUrl()}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${access.token}`,
      "Content-Type": "application/json",
      "User-Agent": getMelhorEnvioUserAgent(),
      ...headers
    },
    body: body == null ? undefined : JSON.stringify(body)
  });

  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const detail = data?.message || data?.error || "MELHORENVIO_REQUEST_FAILED";
    const error = new Error(String(detail));
    error.code = "MELHORENVIO_REQUEST_FAILED";
    error.status = response.status;
    error.payload = data || null;
    throw error;
  }

  return data;
}

module.exports = {
  buildMelhorEnvioAuthorizeUrl,
  exchangeMelhorEnvioAuthCode,
  getMelhorEnvioConnectionStatus,
  getMelhorEnvioApiBaseUrl,
  getMelhorEnvioRedirectUri,
  getMelhorEnvioUserAgent,
  getMelhorEnvioAccessToken,
  melhorEnvioApiRequest
};
