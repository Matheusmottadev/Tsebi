"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { getMelhorEnvioTokens, saveMelhorEnvioTokens } = require("../../server/lib/melhorenvio-token-repository");
const TOKEN_REFRESH_LEEWAY_MS = 5 * 60 * 1000;
function readEnv(name, fallback = "") {
    return String(process.env[name] || fallback).trim();
}
function getLegacyEnvName() {
    return readEnv("MELHOR_ENVIO_ENV", "sandbox").toLowerCase() || "sandbox";
}
function normalizeBaseUrl(value) {
    const trimmed = String(value || "").trim().replace(/\/+$/, "");
    return trimmed;
}
function getMelhorEnvioApiBaseUrl() {
    const configured = normalizeBaseUrl(readEnv("MELHORENVIO_BASE_URL", ""));
    if (configured) {
        if (configured.endsWith("/api/v2"))
            return configured;
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
function getMelhorEnvioUserAgent() {
    const explicit = readEnv("MELHORENVIO_USER_AGENT", "");
    if (explicit)
        return explicit;
    return "Tsebi (contato@tsebi.com.br)";
}
function getStaticAccessToken() {
    const modern = readEnv("MELHORENVIO_ACCESS_TOKEN", "");
    if (modern)
        return modern;
    return readEnv("MELHOR_ENVIO_TOKEN", "");
}
function buildTokenRequestPayload({ grantType, refreshToken }) {
    const clientIdRaw = readEnv("MELHORENVIO_CLIENT_ID", "");
    const clientId = /^\d+$/.test(clientIdRaw) ? Number(clientIdRaw) : clientIdRaw;
    const payload = {
        grant_type: grantType,
        client_id: clientId || clientIdRaw,
        client_secret: readEnv("MELHORENVIO_CLIENT_SECRET", "")
    };
    const redirectUri = readEnv("MELHORENVIO_REDIRECT_URI", "");
    if (redirectUri)
        payload.redirect_uri = redirectUri;
    const authCode = readEnv("MELHORENVIO_AUTH_CODE", "");
    if (authCode)
        payload.code = authCode;
    if (refreshToken)
        payload.refresh_token = refreshToken;
    return payload;
}
async function parseJsonResponse(response) {
    const text = await response.text().catch(() => "");
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
async function requestRefreshedToken(currentRefreshToken) {
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
function tokenIsExpired(expiresAt) {
    const timestamp = new Date(expiresAt || 0).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= 0)
        return true;
    return timestamp - Date.now() <= TOKEN_REFRESH_LEEWAY_MS;
}
async function bootstrapTokensFromEnvIfNeeded(existingTokens) {
    if (existingTokens)
        return existingTokens;
    const accessToken = readEnv("MELHORENVIO_ACCESS_TOKEN", "");
    const refreshToken = readEnv("MELHORENVIO_REFRESH_TOKEN", "");
    if (!accessToken || !refreshToken)
        return null;
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
async function melhorEnvioApiRequest(path, { method = "GET", body, headers = {} } = {}) {
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
    getMelhorEnvioApiBaseUrl,
    getMelhorEnvioUserAgent,
    getMelhorEnvioAccessToken,
    melhorEnvioApiRequest
};
//# sourceMappingURL=melhorenvio-auth.js.map