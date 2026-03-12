"use client";

import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CartBootstrap } from "@/components/CartBootstrap";
import { SiteHeader } from "@/components/SiteHeader";
import { isCartPath, rememberRouteBeforeCart } from "@/lib/navigation/continueShopping";

type LayoutChromeProps = {
  children: ReactNode;
};

const ROUTES_WITHOUT_GLOBAL_HEADER = new Set(["/", "/home-legacy"]);

export function LayoutChrome({ children }: LayoutChromeProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = String(pathname || "").trim();
  const confirmationStatus = String(searchParams?.get("status") || "").trim().toLowerCase();
  const previousUrlRef = useRef("");
  const currentUrl = useMemo(() => {
    const query = String(searchParams?.toString() || "").trim();
    return query ? `${currentPath}?${query}` : currentPath;
  }, [currentPath, searchParams]);
  const normalizedPath = currentPath.replace(/\/+$/, "") || "/";
  const shouldHideForAccount = currentPath === "/account" || currentPath.startsWith("/account/");
  const shouldHideForStudio = currentPath === "/studio" || currentPath.startsWith("/studio/");
  const shouldHideForAdmin = currentPath === "/admin" || currentPath.startsWith("/admin/");
  const shouldHideForLogin = normalizedPath === "/login";
  const shouldHideForAdminLogin = normalizedPath === "/admin/login";
  const shouldHideForLegacyAdminLogin =
    normalizedPath === "/login/admin" || normalizedPath === "/login/admin/login";
  const shouldHideFailedCheckoutConfirmation =
    normalizedPath === "/checkout/confirmation" && confirmationStatus === "failed";
  const shouldBypassChrome = shouldHideForAdmin || shouldHideForLogin || shouldHideForAdminLogin || shouldHideForLegacyAdminLogin;
  const shouldRenderHeader =
    !ROUTES_WITHOUT_GLOBAL_HEADER.has(currentPath) &&
    !shouldHideForAccount &&
    !shouldHideForStudio &&
    !shouldHideForLogin &&
    !shouldHideForAdmin &&
    !shouldHideForAdminLogin &&
    !shouldHideForLegacyAdminLogin &&
    !shouldHideFailedCheckoutConfirmation;

  useEffect(() => {
    const previousUrl = String(previousUrlRef.current || "").trim();
    const previousPath = previousUrl.split("?")[0] || "";
    if (isCartPath(currentPath) && previousUrl && !isCartPath(previousPath)) {
      rememberRouteBeforeCart(previousUrl);
    }
    previousUrlRef.current = currentUrl;
  }, [currentPath, currentUrl]);

  if (shouldBypassChrome) {
    return <>{children}</>;
  }

  return (
    <>
      <CartBootstrap />
      {shouldRenderHeader ? (
        <Suspense fallback={null}>
          <SiteHeader />
        </Suspense>
      ) : null}
      {children}
    </>
  );
}
