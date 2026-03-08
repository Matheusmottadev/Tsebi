"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { getContinueShoppingHref } from "@/lib/navigation/continueShopping";

type ContinueShoppingLinkProps = {
  className?: string;
  fallbackHref?: string;
  children?: ReactNode;
};

export function ContinueShoppingLink({
  className,
  fallbackHref = "/products",
  children = "Continuar comprando",
}: ContinueShoppingLinkProps) {
  const [href, setHref] = useState(fallbackHref);

  useEffect(() => {
    setHref(getContinueShoppingHref(fallbackHref));
  }, [fallbackHref]);

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

