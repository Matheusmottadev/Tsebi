const LAST_BEFORE_CART_KEY = "tsebi:last-before-cart";

function normalizePath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function isCartPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return normalized === "/cart" || normalized.startsWith("/cart/");
}

function toSafeRelativeUrl(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  try {
    const baseOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(trimmed, baseOrigin);
    if (typeof window !== "undefined" && parsed.origin !== window.location.origin) return null;
    if (!parsed.pathname.startsWith("/")) return null;
    if (isCartPath(parsed.pathname)) return null;
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

export function rememberRouteBeforeCart(rawUrl: string): void {
  if (typeof window === "undefined") return;
  const safeUrl = toSafeRelativeUrl(rawUrl);
  if (!safeUrl) return;
  try {
    window.sessionStorage.setItem(LAST_BEFORE_CART_KEY, safeUrl);
  } catch {}
}

export function getContinueShoppingHref(fallback = "/products"): string {
  if (typeof window === "undefined") return fallback;

  try {
    const stored = toSafeRelativeUrl(window.sessionStorage.getItem(LAST_BEFORE_CART_KEY) || "");
    if (stored) return stored;
  } catch {}

  try {
    const referrer = String(document.referrer || "").trim();
    if (referrer) {
      const parsed = new URL(referrer);
      if (parsed.origin === window.location.origin && !isCartPath(parsed.pathname)) {
        return `${parsed.pathname}${parsed.search}`;
      }
    }
  } catch {}

  return fallback;
}

