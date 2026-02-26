type RuntimeEnv = {
  NEXT_PUBLIC_API_BASE_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  NEXT_PUBLIC_CHECKOUT_ENABLED?: string;
  NODE_ENV?: string;
};

export type PublicEnv = {
  apiBaseUrl: string;
  siteUrl?: string;
};

function getRuntimeEnv(): RuntimeEnv {
  return {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_CHECKOUT_ENABLED: process.env.NEXT_PUBLIC_CHECKOUT_ENABLED,
    NODE_ENV: process.env.NODE_ENV,
  };
}

function normalizeAbsoluteHttpUrl(value: string, envName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid absolute URL. Received: '${value}'.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${envName} must start with http:// or https://. Received: '${value}'.`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

export function readPublicEnv(): PublicEnv {
  const runtimeEnv = getRuntimeEnv();
  const rawApiBaseUrl = String(runtimeEnv.NEXT_PUBLIC_API_BASE_URL || "").trim();
  const rawSiteUrl = String(runtimeEnv.NEXT_PUBLIC_SITE_URL || "").trim();

  if (!rawApiBaseUrl) {
    const mode = runtimeEnv.NODE_ENV === "production" ? "production" : "development";
    throw new Error(
      `NEXT_PUBLIC_API_BASE_URL is required in ${mode}. ` +
        "Set it explicitly in web-next/.env.local to avoid accidental calls to live endpoints."
    );
  }

  const apiBaseUrl = normalizeAbsoluteHttpUrl(rawApiBaseUrl, "NEXT_PUBLIC_API_BASE_URL");
  const siteUrl = rawSiteUrl
    ? normalizeAbsoluteHttpUrl(rawSiteUrl, "NEXT_PUBLIC_SITE_URL")
    : undefined;

  return { apiBaseUrl, siteUrl };
}

export function isApiConfigured(): boolean {
  return Boolean(String(process.env.NEXT_PUBLIC_API_BASE_URL || "").trim());
}

function parseBooleanFlag(value: string | undefined): boolean {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isCheckoutEnabled(): boolean {
  return parseBooleanFlag(process.env.NEXT_PUBLIC_CHECKOUT_ENABLED);
}
