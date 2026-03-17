"use client";

import { useEffect, useState } from "react";
import styles from "./PwaUpdateBanner.module.css";

export function PwaUpdateBanner() {
  const [show, setShow] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration;

    function onWaiting(r: ServiceWorkerRegistration) {
      setRegistration(r);
      setShow(true);
    }

    navigator.serviceWorker.ready.then((r) => {
      reg = r;

      // SW já estava esperando quando a página carregou
      if (r.waiting) {
        onWaiting(r);
        return;
      }

      // Escuta nova atualização encontrada depois do carregamento
      r.addEventListener("updatefound", () => {
        const installing = r.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            onWaiting(r);
          }
        });
      });
    });

    // Ao trocar o controller (SW ativado após SKIP_WAITING), recarrega
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  function update() {
    if (!registration?.waiting) return;
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  }

  if (!show) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <span className={styles.message}>Nova versão disponível</span>
      <div className={styles.actions}>
        <button className={styles.updateBtn} onClick={update}>
          Atualizar
        </button>
        <button className={styles.closeBtn} onClick={() => setShow(false)} aria-label="Fechar">
          ✕
        </button>
      </div>
    </div>
  );
}
