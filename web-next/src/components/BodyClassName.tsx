"use client";

import { useLayoutEffect } from "react";

type BodyClassNameProps = {
  className: string;
};

export function BodyClassName({ className }: BodyClassNameProps) {
  useLayoutEffect(() => {
    const value = String(className || "").trim();
    if (!value) return;

    document.body.classList.add(value);
    return () => {
      document.body.classList.remove(value);
    };
  }, [className]);

  return null;
}
