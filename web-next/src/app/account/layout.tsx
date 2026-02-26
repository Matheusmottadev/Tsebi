import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BodyClassName } from "@/components/BodyClassName";
import { HttpError } from "@/lib/http";
import { getMe } from "@/services/auth";
import "../../styles/legacy/account.css";
import "../../styles/legacy/conta.css";
import "../../styles/legacy/order-tracking.css";

type AccountLayoutProps = {
  children: React.ReactNode;
};

async function requireAuthenticatedUser() {
  const headerStore = await headers();
  const cookie = headerStore.get("cookie") || undefined;

  try {
    const user = await getMe({ cookie, cache: "no-store" });
    if (!user) redirect("/login");
    return user;
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      redirect("/login");
    }
    throw error;
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
