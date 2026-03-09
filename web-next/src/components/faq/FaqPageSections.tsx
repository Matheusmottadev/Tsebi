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

function resolveHashFromTab(tab: HelpCenterTab): string {
  if (tab === "help") return "#precisa-de-ajuda";
  if (tab === "delivery") return "#entrega-e-devolucoes";
  if (tab === "care") return "#servicos-de-cuidado";
  return "#perguntas-frequentes";
}

export function FaqPageSections() {
  const [activeTab, setActiveTab] = useState<HelpCenterTab>("help");

  useEffect(() => {
    setActiveTab(resolveTabFromHash(window.location.hash));
  }, []);

  useEffect(() => {
    const syncFromHash = () => setActiveTab(resolveTabFromHash(window.location.hash));
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
      window.history.replaceState(null, "", `/faq${resolveHashFromTab(tab)}`);
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
