"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./PwaInstallPrompt.module.css";

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);
  const [isIosDevice, setIsIosDevice] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || isDismissed()) return;

    if (isIos()) {
      setIsIosDevice(true);
      setShow(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setShow(false);
  }

  async function install() {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "dismissed") dismiss();
    else setShow(false);
    deferredPrompt.current = null;
  }

  if (!show) return null;

  return (
    <div className={styles.banner} role="complementary" aria-label="Instalar aplicativo">
      <div className={styles.content}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M12 16V4M8 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 20h16" strokeLinecap="round" />
        </svg>
        <div className={styles.text}>
          <span className={styles.title}>Instalar Tsebi</span>
          {isIosDevice ? (
            <span className={styles.subtitle}>Toque em compartilhar → "Adicionar à tela inicial"</span>
          ) : (
            <span className={styles.subtitle}>Acesso rápido, funciona offline</span>
          )}
        </div>
      </div>
      <div className={styles.actions}>
        {!isIosDevice && (
          <button className={styles.installBtn} onClick={install}>
            Instalar
          </button>
        )}
        <button className={styles.closeBtn} onClick={dismiss} aria-label="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
