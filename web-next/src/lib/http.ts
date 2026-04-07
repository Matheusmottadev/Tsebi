import { readPublicEnv } from "@/lib/env";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const userCsrfCookieName = String(process.env.NEXT_PUBLIC_USER_CSRF_COOKIE_NAME || "tsebi.csrf").trim() || "tsebi.csrf";
const DEFAULT_SERVER_REVALIDATE_SECONDS = 60;
const ADMIN_STEP_UP_RETRY_HEADER = "x-admin-step-up-retry";
const ADMIN_STEP_UP_EVENT_NAME = "tsebi-admin-step-up";

type AdminStepUpType = "password" | "mfa";

type AdminStepUpEventDetail = {
  stepUpType: AdminStepUpType;
  actionLabel?: string;
  errorMessage?: string;
  resolve: (value: string | null) => void;
};

type NextFetchOptions = {
  revalidate?: number;
  tags?: string[];
};

export type HttpRequestOptions = Omit<RequestInit, "method" | "body"> & {
  cookie?: string;
  next?: NextFetchOptions;
};

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly payload: unknown;

  constructor(message: string, status: number, url: string, payload: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.payload = payload;
  }
}

function assertApiPath(path: string): void {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/'. Received: '${path}'.`);
  }
}

function buildAbsoluteUrl(path: string): string {
  assertApiPath(path);
  // On the browser, force same-origin API calls so session cookies stay on the active host
  // (avoids login loops when env points to a different subdomain).
  if (typeof window !== "undefined" && window.location?.origin) {
    return new URL(path, `${window.location.origin}/`).toString();
  }
  const serverProxyTarget = String(process.env.API_PROXY_TARGET || "").trim();
  if (serverProxyTarget) {
    return new URL(path, `${serverProxyTarget.replace(/\/+$/, "")}/`).toString();
  }
  const { apiBaseUrl } = readPublicEnv();
  return new URL(path, `${apiBaseUrl}/`).toString();
}

async function parseResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.toLowerCase().includes("application/json");

  if (isJson) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function resolveErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;

  const maybeError = (payload as { error?: unknown }).error;
  const maybeMessage = (payload as { message?: unknown }).message;
  const errorText = typeof maybeError === "string" ? maybeError.trim() : "";
  const messageText = typeof maybeMessage === "string" ? maybeMessage.trim() : "";

  if (messageText && errorText && messageText !== errorText) {
    return `${messageText} (${errorText})`;
  }
  if (messageText) return messageText;
  if (errorText) return errorText;

  return fallback;
}

function shouldAttachUserCsrf(method: HttpMethod, path: string): boolean {
  const isMutation = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (!isMutation) return false;
  return path.startsWith("/api/auth") || path.startsWith("/api/my");
}

function isAdminMutation(method: HttpMethod, path: string): boolean {
  const isMutation = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  return isMutation && path.startsWith("/api/admin");
}

function shouldBypassDefaultCache(path: string): boolean {
  const uncachedPrefixes = ["/api/auth", "/api/my", "/api/studio-auth", "/api/admin"];
  return uncachedPrefixes.some((prefix) => path.startsWith(prefix));
}

function resolveDefaultGetCachingOptions(
  method: HttpMethod,
  path: string,
  options?: HttpRequestOptions
): HttpRequestOptions {
  const baseOptions = options || {};
  if (method !== "GET") return baseOptions;
  if (typeof baseOptions.cache !== "undefined" || typeof baseOptions.next !== "undefined") return baseOptions;
  if (shouldBypassDefaultCache(path)) return baseOptions;

  if (typeof window === "undefined") {
    return {
      ...baseOptions,
      next: { revalidate: DEFAULT_SERVER_REVALIDATE_SECONDS },
    };
  }

  return {
    ...baseOptions,
    cache: "force-cache",
  };
}

function readCookieByName(name: string): string {
  if (typeof document === "undefined") return "";
  const source = String(document.cookie || "");
  if (!source) return "";
  const prefix = `${name}=`;
  const parts = source.split(";");
  for (const part of parts) {
    const item = String(part || "").trim();
    if (!item.startsWith(prefix)) continue;
    return decodeURIComponent(item.slice(prefix.length));
  }
  return "";
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  options?: HttpRequestOptions
): Promise<T> {
  const url = buildAbsoluteUrl(path);
  const resolvedOptions: HttpRequestOptions = resolveDefaultGetCachingOptions(method, path, options);
  const headers = new Headers(resolvedOptions.headers || undefined);

  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (resolvedOptions.cookie && !headers.has("Cookie")) {
    headers.set("Cookie", resolvedOptions.cookie);
  }
  if (shouldAttachUserCsrf(method, path) && !headers.has("x-csrf-token")) {
    const token = readCookieByName(userCsrfCookieName);
    if (token) headers.set("x-csrf-token", token);
  }

  const response = await fetch(url, {
    ...resolvedOptions,
    method,
    credentials: "include",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    if (
      typeof window !== "undefined" &&
      isAdminMutation(method, path) &&
      !headers.has(ADMIN_STEP_UP_RETRY_HEADER) &&
      payload &&
      typeof payload === "object" &&
      (payload as { error?: unknown }).error === "ADMIN_STEP_UP_REQUIRED"
    ) {
      const nextHeaders = new Headers(headers);
      nextHeaders.set(ADMIN_STEP_UP_RETRY_HEADER, "1");
      const stepUpCompleted = await completeAdminStepUp(
        payload as { stepUpType?: unknown; action?: unknown; message?: unknown },
        nextHeaders
      );
      if (stepUpCompleted) {
        return request<T>(method, path, body, {
          ...resolvedOptions,
          headers: nextHeaders,
        });
      }
    }

    const fallback = `Request failed with status ${response.status}`;
    const message = resolveErrorMessage(payload, fallback);
    throw new HttpError(message, response.status, url, payload);
  }

  return payload as T;
}

async function fetchAdminCsrfToken(headers: Headers): Promise<string> {
  const explicit = String(headers.get("x-csrf-token") || "").trim();
  if (explicit) return explicit;

  const response = await fetch(buildAbsoluteUrl("/api/studio-auth/me"), {
    method: "GET",
    credentials: "include",
    headers,
  });
  const payload = await parseResponsePayload(response);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("ADMIN_CSRF_BOOTSTRAP_FAILED");
  }
  return String((payload as { csrfToken?: unknown }).csrfToken || "").trim();
}

async function completeAdminStepUp(
  payload: { stepUpType?: unknown; action?: unknown; message?: unknown },
  headers: Headers
): Promise<boolean> {
  const stepUpType = String(payload.stepUpType || "").trim().toLowerCase();
  if (stepUpType !== "password" && stepUpType !== "mfa") return false;

  const actionLabel = String(payload.message || payload.action || "").trim() || "Esta ação";
  let errorMessage = "";

  while (true) {
    const secret = await requestAdminStepUpValue({
      stepUpType,
      actionLabel,
      errorMessage,
    });
    if (!secret || !String(secret).trim()) return false;

    const csrfToken = await fetchAdminCsrfToken(headers);
    const verifyResponse = await fetch(buildAbsoluteUrl(stepUpType === "mfa" ? "/api/studio-auth/step-up/mfa" : "/api/studio-auth/step-up/password"), {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      body: JSON.stringify(stepUpType === "mfa" ? { token: String(secret).trim() } : { password: String(secret) }),
    });

    const verifyPayload = await parseResponsePayload(verifyResponse);
    if (verifyResponse.ok) {
      headers.set("x-csrf-token", csrfToken);
      return true;
    }

    const responseError = String((verifyPayload as { error?: unknown } | null)?.error || "").trim();
    if (responseError === "INVALID_CREDENTIALS" || responseError === "INVALID_MFA_CODE") {
      errorMessage = resolveErrorMessage(verifyPayload, "Não foi possível confirmar esta ação.");
      continue;
    }

    const message = resolveErrorMessage(verifyPayload, "Não foi possível confirmar esta ação.");
    throw new HttpError(message, verifyResponse.status, verifyResponse.url, verifyPayload);
  }
}

async function requestAdminStepUpValue(detail: {
  stepUpType: AdminStepUpType;
  actionLabel: string;
  errorMessage?: string;
}): Promise<string | null> {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    const event = new CustomEvent<AdminStepUpEventDetail>(ADMIN_STEP_UP_EVENT_NAME, {
      detail: {
        stepUpType: detail.stepUpType,
        actionLabel: detail.actionLabel,
        errorMessage: detail.errorMessage,
        resolve,
      },
    });
    window.dispatchEvent(event);
  });
}

export function get<T>(path: string, options?: HttpRequestOptions): Promise<T> {
  return request<T>("GET", path, undefined, options);
}

export function post<T>(path: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
  return request<T>("POST", path, body, options);
}

export function put<T>(path: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
  return request<T>("PUT", path, body, options);
}

export function patch<T>(path: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
  return request<T>("PATCH", path, body, options);
}

export function del<T>(path: string, options?: HttpRequestOptions): Promise<T> {
  return request<T>("DELETE", path, undefined, options);
}
