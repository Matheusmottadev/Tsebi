"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  listAdminBellNotifications,
  markAdminBellNotificationRead,
  markAllAdminBellNotificationsRead,
  type AdminBellNotification,
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

function notificationTargetPage(notification: AdminBellNotification): AdminPageKey {
  if (notification.type === "balance_pending") return "diretoria";
  if (notification.type === "balance_approved" || notification.type === "balance_rejected") return "saldo_clientes";
  return "notificacoes";
}

export function AdminNotificationBell({
  csrfToken,
  onNavigate,
}: {
  csrfToken?: string;
  onNavigate: (page: AdminPageKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AdminBellNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const result = await listAdminBellNotifications({ cache: "no-store" });
      setRows(Array.isArray(result.rows) ? result.rows : []);
      setUnreadCount(Number(result.unreadCount || 0));
    } catch {
      setRows([]);
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    load();
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

  const unreadFirst = useMemo(() => [...rows].sort((a, b) => Number(a.read) - Number(b.read)), [rows]);

  async function handleOpenToggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load();
    }
  }

  async function handleOpenNotification(notification: AdminBellNotification) {
    if (!notification.read) {
      try {
        await markAdminBellNotificationRead(notification.id, csrfToken, { cache: "no-store" });
      } catch {}
    }
    setOpen(false);
    onNavigate(notificationTargetPage(notification));
    await load();
  }

  async function handleReadAll() {
    try {
      await markAllAdminBellNotificationsRead(csrfToken, { cache: "no-store" });
      await load();
    } catch {}
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button type="button" aria-label="Notificações" onClick={handleOpenToggle} style={{ background: "transparent", border: 0, cursor: "pointer", position: "relative", padding: 0 }}>
        <Bell size={16} strokeWidth={1.7} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -5,
              right: -6,
              minWidth: 16,
              height: 16,
              borderRadius: 999,
              background: "#a92727",
              color: "#fff",
              fontSize: 9,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 12px)",
            width: 340,
            background: "#fff",
            border: "1px solid #ece7df",
            borderRadius: 16,
            boxShadow: "0 24px 80px rgba(17,17,17,0.16)",
            padding: 14,
            zIndex: 120,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", color: "#8d7f70" }}>Notificações</div>
              <div style={{ fontSize: 12, color: "#6a5d50", marginTop: 4 }}>{unreadCount} não lida(s)</div>
            </div>
            <button
              type="button"
              onClick={handleReadAll}
              style={{ border: 0, background: "transparent", cursor: "pointer", color: "#111", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}
            >
              <CheckCheck size={14} />
              Marcar tudo
            </button>
          </div>

          <div style={{ maxHeight: 360, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {unreadFirst.length === 0 ? (
              <div style={{ padding: "22px 10px", color: "#8d7f70", fontSize: 13, textAlign: "center" }}>
                Nenhuma notificação interna por enquanto.
              </div>
            ) : unreadFirst.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleOpenNotification(notification)}
                style={{
                  textAlign: "left",
                  border: "1px solid #f0ebe4",
                  background: notification.read ? "#fff" : "#fbf6ef",
                  borderRadius: 12,
                  padding: "12px 14px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <strong style={{ fontSize: 13, fontWeight: 500, color: "#17130f" }}>{notification.title}</strong>
                  <span style={{ fontSize: 10, color: "#8d7f70" }}>{formatRelative(notification.createdAt)}</span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6a5d50", lineHeight: 1.5 }}>{notification.message}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
