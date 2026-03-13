import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BodyClassName } from "@/components/BodyClassName";
import "../../styles/legacy/account.css";
import "../../styles/legacy/conta.css";
import "../../styles/legacy/order-tracking.css";

type AccountLayoutProps = {
  children: React.ReactNode;
};

async function requireAuthenticatedUser() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;
  const forwardedProto = String(headerStore.get("x-forwarded-proto") || "").trim();
  const forwardedHost = String(headerStore.get("x-forwarded-host") || "").trim();
  const host = forwardedHost || String(headerStore.get("host") || "").trim();
  const isLocalHost = /^localhost(?::\d+)?$/i.test(host) || /^127(?:\.\d{1,3}){3}(?::\d+)?$/.test(host);
  const protocol = forwardedProto || (isLocalHost ? "http" : "https");

  if (!host) {
    redirect("/login");
  }

  try {
    const response = await fetch(`${protocol}://${host}/api/auth/me`, {
      method: "GET",
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    });

    if (!response.ok) {
      redirect("/login");
    }

    const payload = (await response.json().catch(() => ({}))) as { authenticated?: boolean };
    if (!payload?.authenticated) {
      redirect("/login");
    }
    return payload;
  } catch {
    redirect("/login");
  }
}

export default async function AccountLayout({ children }: AccountLayoutProps) {
  await requireAuthenticatedUser();

  return (
    <>
      <BodyClassName className="conta-page" />
      {children}
    </>
  );
}
