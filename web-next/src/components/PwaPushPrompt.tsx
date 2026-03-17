"use client";

import { useEffect, useState } from "react";
import styles from "./PwaPushPrompt.module.css";

const DISMISS_KEY = "pwa-push-dismissed";
const DISMISS_DAYS = 14;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

export function PwaPushPrompt() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      Notification.permission !== "default" ||
      isDismissed()
    ) {
      return;
    }

    // Só mostra se o usuário estiver logado
    fetch("/api/my/profile", { credentials: "include" })
      .then((r) => { if (r.ok) setShow(true); })
      .catch(() => {});
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  }

  async function enable() {
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }

      // Busca VAPID public key
      const keyRes = await fetch("/api/push/vapid-key");
      if (!keyRes.ok) throw new Error("VAPID_KEY_UNAVAILABLE");
      const { publicKey } = await keyRes.json() as { publicKey: string };

      // Cria subscription no browser
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Envia para o backend
      const csrf = document.cookie
        .split("; ")
        .find((c) => c.startsWith("tsebi.csrf="))
        ?.split("=")[1] ?? "";

      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });

      setShow(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[PwaPushPrompt] failed:", err);
      dismiss();
    } finally {
      setLoading(false);
    }
  }

  if (!show) return null;

  return (
    <div className={styles.banner} role="complementary" aria-label="Ativar notificações">
      <div className={styles.content}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className={styles.text}>
          <span className={styles.title}>Ativar notificações</span>
          <span className={styles.subtitle}>Pedidos, envios e novidades em tempo real</span>
        </div>
      </div>
      <div className={styles.actions}>
        <button className={styles.enableBtn} onClick={enable} disabled={loading}>
          {loading ? "…" : "Ativar"}
        </button>
        <button className={styles.closeBtn} onClick={dismiss} aria-label="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
