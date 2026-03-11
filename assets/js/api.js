let csrfToken = "";

export function setCsrfToken(token) {
  csrfToken = String(token || "").trim();
}

export function getCsrfToken() {
  return csrfToken;
}

function isMutatingMethod(method) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(String(method || "GET").toUpperCase());
}

function isStudioAuthError(code) {
  return [
    "ADMIN_UNAUTHORIZED",
    "ADMIN_SESSION_EXPIRED",
    "ADMIN_MFA_REQUIRED",
    "ADMIN_MFA_SETUP_REQUIRED"
  ].includes(String(code || ""));
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function redirectToStudioLogin(reason = "") {
  const params = new URLSearchParams();
  params.set("returnTo", currentPath());
  if (reason) params.set("reason", String(reason));
  window.location.href = `studio-login.html?${params.toString()}`;
}

export class ApiError extends Error {
  constructor(message, { code = "REQUEST_FAILED", status = 0, payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

export async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});

  if (options.json != null) {
    headers.set("Content-Type", "application/json");
  }

  if (isMutatingMethod(method) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }

  const requestOptions = {
    ...options,
    method,
    credentials: "include",
    headers,
    body: options.json != null ? JSON.stringify(options.json) : options.body
  };

  if (method === "GET" && typeof requestOptions.cache === "undefined" && typeof requestOptions.next === "undefined") {
    requestOptions.next = { revalidate: 60 };
  }

  const res = await fetch(path, requestOptions);

  const contentType = String(res.headers.get("content-type") || "");
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json().catch(() => ({})) : await res.text().catch(() => "");

  if (!res.ok) {
    const code = typeof payload === "object" && payload && payload.error ? String(payload.error) : "REQUEST_FAILED";
    const message =
      typeof payload === "object" && payload && payload.error
        ? String(payload.error)
        : `HTTP_${res.status || 0}`;
    const error = new ApiError(message, { code, status: res.status, payload });

    if (!options.suppressAuthRedirect && isStudioAuthError(error.code)) {
      redirectToStudioLogin(error.code);
    }

    throw error;
  }

  return payload;
}
