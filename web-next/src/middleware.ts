import { NextRequest, NextResponse } from "next/server";

const BLOCKED_AGENTS = [
  "meta-externalagent",
  "facebookexternalhit",
];

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const isBlocked = BLOCKED_AGENTS.some((agent) =>
    ua.toLowerCase().includes(agent.toLowerCase())
  );

  if (isBlocked) {
    return new NextResponse(null, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/products(.*)",
};
