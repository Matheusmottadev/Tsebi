"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type FbqFn = (...args: unknown[]) => void;

export function MetaPixelPageViewTracker() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Initial PageView is already sent by base snippet.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const fbq = (window as Window & { fbq?: FbqFn }).fbq;
    if (typeof fbq !== "function") return;

    fbq("track", "PageView");
  }, [pathname]);

  return null;
}
