"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { key: "overview", label: "Visão Geral" },
  { key: "profile", label: "Meu Perfil" },
  { key: "orders", label: "Meus Pedidos" },
  { key: "private-care", label: "Atendimentos Privados" },
  { key: "recommendations", label: "Recomendações" },
  { key: "wishlist", label: "Lista de Desejos" },
  { key: "repairs", label: "Serviços de Reparos" },
] as const;

function normalizeSection(value: string) {
  const section = String(value || "overview").replace(/^#/, "").trim().toLowerCase();
  if (section === "private") return "private-care";
  if (SECTIONS.some((entry) => entry.key === section)) return section;
  return "overview";
}

export function AccountRouteToolbar() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const syncFromHash = () => {
      setActiveSection(normalizeSection(window.location.hash || "overview"));
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, []);

  return (
    <nav className="account-route-toolbar" aria-label="Navegação da conta">
      {SECTIONS.map((section) => (
        <a
          key={section.key}
          href={`#${section.key}`}
          data-section={section.key}
          className={activeSection === section.key ? "is-active" : ""}
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}
