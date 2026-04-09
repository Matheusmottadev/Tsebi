import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { HttpError } from "@/lib/http";
import { studioAuthMe } from "@/services/admin";

export async function requireAdminApiSession(request: NextRequest): Promise<NextResponse | null> {
  const cookie = request.headers.get("cookie") || undefined;

  try {
    const me = await studioAuthMe({ cookie, cache: "no-store" });
    const authenticated = Boolean(me.authenticated && me.admin);
    if (!authenticated) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    return null;
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    throw error;
  }
}
