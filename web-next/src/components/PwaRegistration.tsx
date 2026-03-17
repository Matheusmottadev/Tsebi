"use client";

import { SerwistProvider } from "@serwist/next/react";

export function PwaRegistration() {
  return <SerwistProvider swUrl="/sw.js" reloadOnOnline />;
}
