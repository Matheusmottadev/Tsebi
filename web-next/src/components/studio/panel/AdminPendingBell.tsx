"use client";

import { AlertCircle, ListTodo } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listAdminPendingSummary,
  type AdminPendingSummaryItem,
  type AdminPendingSummaryResponse,
  type AdminPendingSummarySection,
} from "@/services/admin";
import type { AdminPageKey } from "./types";

function formatRelative(value: string | null): string {
  if (!value) return "agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  const diffMinutes = Math.round((date.getTime() - Date.now()) / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  const diffDays = Math.round(diffHours / 24);
  return rtf.format(diffDays, "day");
}

function fallbackSummary(): AdminPendingSummaryResponse {
  return {
    totalCount: 0,
    updatedAt: new Date().toISOString(),
    sections: [],
  };
}

function navigateToTarget(
  targetPage: AdminPageKey | null,
  targetHref: string | null,
  onNavigate: (page: AdminPageKey) => void
) {
  if (targetPage) {
    onNavigate(targetPage);
    return;
  }
  if (targetHref && typeof window !== "undefined") {
    window.location.assign(targetHref);
  }
}

export function AdminPendingBell({ onNavigate }: { onNavigate: (page: AdminPageKey) => void }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AdminPendingSummaryResponse>(fallbackSummary);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const result = await listAdminPendingSummary({ cache: "no-store" });
      setSummary(result);
    } catch {
      setSummary(fallbackSummary());
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const actionableSections = useMemo(
    () => (summary.sections || []).filter((section) => Number(section.count || 0) > 0),
    [summary.sections]
  );

  function handleOpenToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      void load();
    }
  }

  function handleSectionNavigate(section: AdminPendingSummarySection) {
    setOpen(false);
    navigateToTarget(section.targetPage, section.targetHref, onNavigate);
  }

  function handleItemNavigate(section: AdminPendingSummarySection, _item: AdminPendingSummaryItem) {
    setOpen(false);
    navigateToTarget(section.targetPage, section.targetHref, onNavigate);
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label="Pendências"
        onClick={handleOpenToggle}
        style={{ background: "transparent", border: 0, cursor: "pointer", position: "relative", padding: 0 }}
      >
        <ListTodo size={16} strokeWidth={1.7} aria-hidden="true" />
        {summary.totalCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -5,
              right: -6,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: "#111",
              color: "#fff",
              fontSize: 9,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {summary.totalCount > 9 ? "9+" : summary.totalCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 12px)",
            width: 388,
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 16,
            boxShadow: "0 24px 80px rgba(17,17,17,0.16)",
            padding: 14,
            zIndex: 120,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "#64748b" }}>Pendências</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                {summary.totalCount} item(ns) para acompanhar
              </div>
            </div>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>{formatRelative(summary.updatedAt)}</span>
          </div>

          <div style={{ maxHeight: 420, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {actionableSections.length === 0 ? (
              <div style={{ padding: "22px 10px", color: "#64748b", fontSize: 13, textAlign: "center" }}>
                Nenhuma pendência aberta no momento.
              </div>
            ) : (
              actionableSections.map((section) => (
                <section
                  key={section.key}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderRadius: 14,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => handleSectionNavigate(section)}
                    style={{
                      width: "100%",
                      border: 0,
                      background: "transparent",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#17130f" }}>{section.label}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{section.description}</div>
                      </div>
                      <span
                        style={{
                          minWidth: 26,
                          height: 26,
                          padding: "0 8px",
                          borderRadius: 999,
                          background: "#111",
                          color: "#fff",
                          fontSize: 11,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {section.count}
                      </span>
                    </div>
                  </button>

                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemNavigate(section, item)}
                        style={{
                          textAlign: "left",
                          border: "1px solid #edf2f7",
                          background: "#f8fafc",
                          borderRadius: 10,
                          padding: "10px 12px",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                          <strong style={{ fontSize: 12, fontWeight: 500, color: "#17130f" }}>{item.title}</strong>
                          <span style={{ fontSize: 10, color: "#64748b" }}>{formatRelative(item.createdAt)}</span>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{item.subtitle}</p>
                      </button>
                    ))}
                    {section.count > section.items.length ? (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          fontSize: 11,
                          color: "#64748b",
                        }}
                      >
                        <AlertCircle size={12} />
                        Mais {section.count - section.items.length} item(ns) nesta fila.
                      </div>
                    ) : null}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
