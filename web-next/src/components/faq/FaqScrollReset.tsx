"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function FaqScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/faq") return;

    const scrollTop = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    };

    const raf = window.requestAnimationFrame(scrollTop);
    const timers = [40, 120, 260, 520, 900, 1400].map((delay) => window.setTimeout(scrollTop, delay));
    const onLoad = () => scrollTop();
    const onPageShow = () => scrollTop();

    window.addEventListener("load", onLoad);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.cancelAnimationFrame(raf);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("load", onLoad);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname]);

  return null;
}
