"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

type FbqFn = (...args: unknown[]) => void;
const META_PIXEL_ID = String(process.env.NEXT_PUBLIC_META_PIXEL_ID || "").trim();

export function MetaPixelPageViewTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string>("");
  const hasMetaPixelId = Boolean(META_PIXEL_ID);

  useEffect(() => {
    if (!hasMetaPixelId) return;
    const currentPath = String(pathname || "").trim() || "/";
    const globalKey = "__tsebi_meta_last_pageview_path__";
    const windowWithMeta = window as unknown as { [key: string]: unknown; fbq?: FbqFn };
    const globalLastPath = String(windowWithMeta[globalKey] || "");
    if (globalLastPath === currentPath || lastTrackedPathRef.current === currentPath) return;

    const fbq = windowWithMeta.fbq;
    if (typeof fbq !== "function") return;

    fbq("track", "PageView");
    if (process.env.NODE_ENV !== "production") {
      console.debug("[meta-pixel] PageView tracked", { path: currentPath });
    }
    lastTrackedPathRef.current = currentPath;
    windowWithMeta[globalKey] = currentPath;
  }, [hasMetaPixelId, pathname]);

  if (!hasMetaPixelId) return null;

  return null;
}
