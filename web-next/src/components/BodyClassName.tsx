"use client";

import { useLayoutEffect, type ReactNode } from "react";

type BodyClassNameProps = {
  className: string;
  children?: ReactNode;
};

export function BodyClassName({ className, children }: BodyClassNameProps) {
  useLayoutEffect(() => {
    const value = String(className || "").trim();
    if (!value) return;

    document.body.classList.add(value);
    return () => {
      document.body.classList.remove(value);
    };
  }, [className]);

  return <>{children}</>;
}
