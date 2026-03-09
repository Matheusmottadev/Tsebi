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

function isHelpHash(hash: string): boolean {
  const normalized = decodeURIComponent(String(hash || "").trim().toLowerCase());
  return normalized.startsWith("#precisa-de-ajuda") || normalized.startsWith("#precisando-de-ajuda");
}

function readCssPxVar(varName: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const parsed = Number.parseFloat(raw.replace("px", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function forceHelpAnchorPosition() {
  if (typeof window === "undefined") return;
  if (!isHelpHash(window.location.hash)) return;

  const section = document.querySelector('section[aria-label="Contato e atendimento"]');
  if (!(section instanceof HTMLElement)) return;

  const topBarHeight = readCssPxVar("--top-bar-height", 38);
  const headerHeight = readCssPxVar("--header-height", 84);
  const tabsHeight = 60;
  const topOffset = topBarHeight + headerHeight + tabsHeight + 8;
  const targetTop = Math.max(0, window.scrollY + section.getBoundingClientRect().top - topOffset);
  window.scrollTo({ top: targetTop, behavior: "auto" });
}

export function FaqPageSections() {
  const [activeTab, setActiveTab] = useState<HelpCenterTab>("help");

  useEffect(() => {
    setActiveTab(resolveTabFromHash(window.location.hash));
    window.requestAnimationFrame(forceHelpAnchorPosition);
    const timer = window.setTimeout(forceHelpAnchorPosition, 220);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const syncFromHash = () => {
      setActiveTab(resolveTabFromHash(window.location.hash));
      window.requestAnimationFrame(forceHelpAnchorPosition);
      window.setTimeout(forceHelpAnchorPosition, 120);
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
