import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HttpError } from "@/lib/http";
import { studioAuthMe } from "@/services/admin";

function buildAdminLoginRedirect(returnTo: string): string {
  const safeReturnTo = String(returnTo || "").trim();
  if (!safeReturnTo.startsWith("/") || safeReturnTo.startsWith("//")) {
    return "/admin/login";
  }
  return `/admin/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export async function requireAdminSession(returnTo = "/admin"): Promise<void> {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    const me = await studioAuthMe({ cookie, cache: "no-store" });
    const authenticated = Boolean(me.authenticated && me.admin);
    if (!authenticated) {
      redirect(buildAdminLoginRedirect(returnTo));
    }
  } catch (error) {
    if (error instanceof HttpError) {
      redirect(buildAdminLoginRedirect(returnTo));
    }
    throw error;
  }
}
