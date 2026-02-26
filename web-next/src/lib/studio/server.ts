import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { HttpError } from "@/lib/http";
import type { PublicUser } from "@/types";
import { studioAuthMe } from "@/services/admin";

export interface StudioSessionContext {
  admin: PublicUser;
  csrfToken: string;
  cookie: string | undefined;
  idleTimeoutMs?: number;
}

function buildStudioLoginRedirect(returnTo: string): string {
  const safeReturnTo = String(returnTo || "").trim();
  if (!safeReturnTo.startsWith("/") || safeReturnTo.startsWith("//")) {
    return "/studio/login";
  }
  return `/studio/login?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export async function readStudioSession(returnTo: string): Promise<StudioSessionContext> {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    const me = await studioAuthMe({ cookie, cache: "no-store" });
    if (!me.authenticated || !me.admin) {
      redirect(buildStudioLoginRedirect(returnTo));
    }

    const csrfToken = String(me.csrfToken || "").trim();
    if (!csrfToken) {
      redirect(buildStudioLoginRedirect(returnTo));
    }

    return {
      admin: me.admin,
      csrfToken,
      cookie,
      idleTimeoutMs: me.idleTimeoutMs,
    };
  } catch (error) {
    if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
      redirect(buildStudioLoginRedirect(returnTo));
    }
    throw error;
  }
}
