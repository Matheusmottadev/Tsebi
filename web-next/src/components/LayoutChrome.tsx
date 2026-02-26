"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CartBootstrap } from "@/components/CartBootstrap";
import { SiteHeader } from "@/components/SiteHeader";

type LayoutChromeProps = {
  children: ReactNode;
};

const ROUTES_WITHOUT_GLOBAL_HEADER = new Set(["/", "/home-legacy"]);

export function LayoutChrome({ children }: LayoutChromeProps) {
  const pathname = usePathname();
  const currentPath = String(pathname || "").trim();
  const shouldHideForAccount = currentPath === "/account" || currentPath.startsWith("/account/");
  const shouldHideForStudio = currentPath === "/studio" || currentPath.startsWith("/studio/");
  const shouldRenderHeader =
    !ROUTES_WITHOUT_GLOBAL_HEADER.has(currentPath) &&
    !shouldHideForAccount &&
    !shouldHideForStudio;

  return (
    <>
      <CartBootstrap />
      {shouldRenderHeader ? <SiteHeader /> : null}
      {children}
    </>
  );
}
