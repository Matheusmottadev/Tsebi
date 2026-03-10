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
  if (normalized.startsWith("#entrega-e-devolucoes")) return "delivery";
  if (normalized.startsWith("#servicos-e-reparos") || normalized.startsWith("#servicos-de-cuidado")) return "care";
  if (normalized.startsWith("#perguntas-frequentes")) return "faq";
  return "help";
}

function resolveRouteFromTab(tab: HelpCenterTab): string {
  if (tab === "delivery") return "/faq#entrega-e-devolucoes";
  if (tab === "care") return "/faq#servicos-e-reparos";
  if (tab === "faq") return "/faq#perguntas-frequentes";
  return "/faq";
}

function normalizeFaqRoute() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  const normalized = decodeURIComponent(String(hash || "").trim().toLowerCase());

  if (!normalized) {
    window.scrollTo({ top: 0, behavior: "auto" });
    return;
  }

  const known =
    normalized.startsWith("#entrega-e-devolucoes") ||
    normalized.startsWith("#servicos-e-reparos") ||
    normalized.startsWith("#servicos-de-cuidado") ||
    normalized.startsWith("#perguntas-frequentes");

  if (!known) {
    window.history.replaceState(null, "", "/faq");
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function scrollFaqToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, behavior: "auto" });
}

export function FaqPageSections() {
  const [activeTab, setActiveTab] = useState<HelpCenterTab | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    normalizeFaqRoute();
    setActiveTab(resolveTabFromHash(window.location.hash));
    scrollFaqToTop();

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      normalizeFaqRoute();
      setActiveTab(resolveTabFromHash(window.location.hash));
      scrollFaqToTop();
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
      scrollFaqToTop();
    }
  };

  return (
    <>
      <HelpCenterTabs activeTab={activeTab ?? "help"} onTabChange={handleTabChange} />
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
