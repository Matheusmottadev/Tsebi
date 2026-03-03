"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type FbqFn = (...args: unknown[]) => void;

export function MetaPixelPageViewTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string>("");

  useEffect(() => {
    const currentPath = String(pathname || "").trim() || "/";
    const globalKey = "__tsebi_meta_last_pageview_path__";
    const windowWithMeta = window as unknown as { [key: string]: unknown; fbq?: FbqFn };
    const globalLastPath = String(windowWithMeta[globalKey] || "");
    if (globalLastPath === currentPath || lastTrackedPathRef.current === currentPath) return;

    const fbq = windowWithMeta.fbq;
    if (typeof fbq !== "function") return;

    fbq("track", "PageView");
    lastTrackedPathRef.current = currentPath;
    windowWithMeta[globalKey] = currentPath;
  }, [pathname]);

  return null;
}
