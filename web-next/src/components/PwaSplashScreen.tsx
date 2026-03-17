"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import s from "./PwaSplashScreen.module.css";

export function PwaSplashScreen() {
  const [phase, setPhase] = useState<"hidden" | "in" | "hold" | "out" | "done">("hidden");

  useEffect(() => {
    // Só mostra quando aberto como PWA instalado (standalone/fullscreen)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as { standalone?: boolean }).standalone === true;

    if (!isStandalone) return;

    // Não repete na mesma sessão
    if (sessionStorage.getItem("pwa-splash-shown")) return;
    sessionStorage.setItem("pwa-splash-shown", "1");

    // Sequência: hidden → in (fade in 600ms) → hold (800ms) → out (fade out 500ms) → done
    setPhase("in");
    const t1 = setTimeout(() => setPhase("hold"), 600);
    const t2 = setTimeout(() => setPhase("out"), 1400);
    const t3 = setTimeout(() => setPhase("done"), 1900);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  if (phase === "hidden" || phase === "done") return null;

  return (
    <div className={s.overlay} data-phase={phase} aria-hidden>
      <div className={s.inner}>
        <Image
          src="/images/logo-tsebi.png"
          alt="Tsebi Brasil"
          width={160}
          height={60}
          className={s.logo}
          priority
        />
      </div>
    </div>
  );
}
