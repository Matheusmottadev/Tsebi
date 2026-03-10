"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";
import { isWithinChatBusinessHours } from "@/lib/chatBusinessHours";
import styles from "./TawkChatWidget.module.css";

const TAWK_EMBED_SRC = String(process.env.NEXT_PUBLIC_TAWK_EMBED_SRC || "").trim();

type TawkApi = {
  hideWidget?: () => void;
  showWidget?: () => void;
  maximize?: () => void;
  minimize?: () => void;
};

function hideDefaultTawkLauncher() {
  const api = (window as Window & { Tawk_API?: TawkApi }).Tawk_API;
  if (!api || typeof api.hideWidget !== "function") return;
  api.hideWidget();
}

function setTawkVisibility(visible: boolean) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("tawk-chat-visible", visible);
}

function isLikelyChatNotificationTitle(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return false;
  if (/\b\d+\s*(nova|novo|new|nueva)\s*(mensagem|mensagens|message|messages|mensaje|mensajes)\b/.test(normalized)) {
    return true;
  }
  if (/^\(\d+\)\s+.*tsebi brasil/.test(normalized)) {
    return true;
  }
  return false;
}

export function TawkChatWidget() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => {
    setTawkVisibility(false);

    const handleChatOpen = () => {
      setIsChatOpen(true);
      setTawkVisibility(true);
    };
    const handleChatClosed = () => {
      setIsChatOpen(false);
      setTawkVisibility(false);
    };

    window.addEventListener("tawk:chat-open", handleChatOpen);
    window.addEventListener("tawk:chat-closed", handleChatClosed);
    return () => {
      window.removeEventListener("tawk:chat-open", handleChatOpen);
      window.removeEventListener("tawk:chat-closed", handleChatClosed);
      setTawkVisibility(false);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let stableTitle = document.title;
    const titleElement = document.querySelector("title");

    const syncTitle = () => {
      const currentTitle = String(document.title || "").trim();
      if (!currentTitle) return;
      if (isLikelyChatNotificationTitle(currentTitle)) {
        if (stableTitle && currentTitle !== stableTitle) {
          document.title = stableTitle;
        }
        return;
      }
      stableTitle = currentTitle;
    };

    const observer = titleElement ? new MutationObserver(syncTitle) : null;
    if (observer && titleElement) {
      observer.observe(titleElement, { childList: true, subtree: true, characterData: true });
    }

    const timerId = window.setInterval(syncTitle, 250);
    document.addEventListener("visibilitychange", syncTitle);

    return () => {
      observer?.disconnect();
      window.clearInterval(timerId);
      document.removeEventListener("visibilitychange", syncTitle);
    };
  }, []);

  const openChat = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!isWithinChatBusinessHours()) {
      window.location.assign("/faq");
      return;
    }

    const api = (window as Window & { Tawk_API?: TawkApi }).Tawk_API;
    if (api && typeof api.maximize === "function") {
      setIsChatOpen(true);
      setTawkVisibility(true);
      if (typeof api.showWidget === "function") api.showWidget();
      api.maximize();
      return;
    }

    window.open("https://wa.me/5511918596632", "_blank", "noopener,noreferrer");
  }, []);

  if (!TAWK_EMBED_SRC) return null;

  return (
    <>
      <Script id="tawk-bootstrap" strategy="afterInteractive">
        {`
          window.Tawk_API = window.Tawk_API || {};
          window.Tawk_LoadStart = new Date();
          window.Tawk_API.onLoad = function() {
            document.body.classList.remove("tawk-chat-visible");
            if (typeof window.Tawk_API.minimize === "function") window.Tawk_API.minimize();
            if (typeof window.Tawk_API.hideWidget === "function") window.Tawk_API.hideWidget();
          };
          window.Tawk_API.onChatMaximized = function() {
            document.body.classList.add("tawk-chat-visible");
            window.dispatchEvent(new Event("tawk:chat-open"));
          };
          window.Tawk_API.onChatMinimized = function() {
            document.body.classList.remove("tawk-chat-visible");
            window.dispatchEvent(new Event("tawk:chat-closed"));
            if (typeof window.Tawk_API.hideWidget === "function") window.Tawk_API.hideWidget();
          };
          window.Tawk_API.onChatHidden = function() {
            document.body.classList.remove("tawk-chat-visible");
            window.dispatchEvent(new Event("tawk:chat-closed"));
            if (typeof window.Tawk_API.hideWidget === "function") window.Tawk_API.hideWidget();
          };
          window.Tawk_API.onChatEnded = function() {
            document.body.classList.remove("tawk-chat-visible");
            window.dispatchEvent(new Event("tawk:chat-closed"));
          };
        `}
      </Script>
      <Script id="tawk-loader" src={TAWK_EMBED_SRC} strategy="afterInteractive" onLoad={hideDefaultTawkLauncher} />

      <button
        type="button"
        className={styles.launcher}
        onClick={openChat}
        aria-label="Abrir chat de atendimento"
        style={{ display: isChatOpen ? "none" : undefined }}
      >
        <img className={styles.launcherIcon} src="/images/logo-tsebi.png" alt="" aria-hidden="true" />
        <span>Fale Conosco</span>
      </button>
    </>
  );
}
