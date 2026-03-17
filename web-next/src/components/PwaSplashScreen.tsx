"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import s from "./PwaSplashScreen.module.css";

export function PwaSplashScreen() {
  const [visible, setVisible] = useState(false);
  const [showLogo, setShowLogo] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;
    if (sessionStorage.getItem("pwa-splash-shown")) return;
    sessionStorage.setItem("pwa-splash-shown", "1");

    setVisible(true);

    // Alterna logo ↔ texto a cada 2400ms, igual ao header da homepage
    const cycleInterval = setInterval(() => {
      setShowLogo((v) => !v);
    }, 2400);

    // Depois de 7.2s (3 ciclos completos), inicia fade out
    const fadeTimer = setTimeout(() => {
      clearInterval(cycleInterval);
      setFadeOut(true);
    }, 7200);

    // Remove do DOM após o fade out (500ms)
    const doneTimer = setTimeout(() => {
      setVisible(false);
    }, 7700);

    return () => {
      clearInterval(cycleInterval);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`${s.overlay} ${fadeOut ? s.fadeOut : ""}`} aria-hidden>
      <div className={s.inner}>
        <span className={`${s.text} ${showLogo ? s.hidden : s.shown}`}>TSEBI</span>
        <Image
          src="/images/logo-tsebi.png"
          alt="Tsebi Brasil"
          width={56}
          height={56}
          className={`${s.logo} ${showLogo ? s.shown : s.hidden}`}
          priority
        />
      </div>
    </div>
  );
}
