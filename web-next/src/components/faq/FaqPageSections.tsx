"use client";

import { useEffect, useState } from "react";
import { CareSection } from "./CareSection";
import { FaqSection } from "./FaqSection";
import { FaqSupportSections } from "./FaqSupportSections";
import { HelpCenterContactSection } from "./HelpCenterContactSection";
import { HelpCenterTabs, type HelpCenterTab } from "./HelpCenterTabs";
import { ShippingSection } from "./ShippingSection";

function resolveTabFromHash(hash: string): HelpCenterTab {
  const normalized = decodeURIComponent(String(hash || "").trim().toLowerCase());
  if (normalized.startsWith("#precisa-de-ajuda") || normalized.startsWith("#precisando-de-ajuda")) return "help";
  if (normalized.startsWith("#entrega-e-devolucoes")) return "delivery";
  if (normalized.startsWith("#servicos-de-cuidado")) return "care";
  return "faq";
}

function isHelpHash(hash: string): boolean {
  const normalized = decodeURIComponent(String(hash || "").trim().toLowerCase());
  return normalized.startsWith("#precisa-de-ajuda") || normalized.startsWith("#precisando-de-ajuda");
}

function normalizeHelpHashRoute() {
  if (typeof window === "undefined") return;
  if (!isHelpHash(window.location.hash)) return;
  window.history.replaceState(null, "", "/faq");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function resolveRouteFromTab(tab: HelpCenterTab): string {
  if (tab === "help") return "/faq";
  if (tab === "delivery") return "/faq#entrega-e-devolucoes";
  if (tab === "care") return "/faq#servicos-de-cuidado";
  return "/faq#perguntas-frequentes";
}

export function FaqPageSections() {
  const [activeTab, setActiveTab] = useState<HelpCenterTab>("help");

  useEffect(() => {
    const hash = window.location.hash;
    setActiveTab(resolveTabFromHash(hash));
    normalizeHelpHashRoute();
    if (!hash || isHelpHash(hash)) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash;
      setActiveTab(resolveTabFromHash(hash));
      normalizeHelpHashRoute();
      if (!hash || isHelpHash(hash)) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    };

    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

  const handleTabChange = (tab: HelpCenterTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", resolveRouteFromTab(tab));
      if (tab === "help") {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }
  };

  return (
    <>
      <HelpCenterTabs activeTab={activeTab} onTabChange={handleTabChange} />
      {activeTab === "help" ? (
        <>
          <HelpCenterContactSection />
          <FaqSupportSections />
        </>
      ) : null}
      {activeTab === "faq" ? <FaqSection /> : null}
      {activeTab === "delivery" ? <ShippingSection /> : null}
      {activeTab === "care" ? <CareSection /> : null}
    </>
  );
}
