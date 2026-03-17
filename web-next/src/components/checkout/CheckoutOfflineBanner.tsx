"use client";

import { useEffect, useState } from "react";
import s from "./CheckoutOfflineBanner.module.css";

type Props = {
  isOnline: boolean;
  wasOffline: boolean;
  /** Modo bloqueante: cobre a tela inteira (usado no step de pagamento) */
  blocking?: boolean;
  onRetry?: () => void;
};

export function CheckoutOfflineBanner({ isOnline, wasOffline, blocking = false, onRetry }: Props) {
  const [autoRetrying, setAutoRetrying] = useState(false);

  // Verificação automática a cada 5s quando bloqueado
  useEffect(() => {
    if (!blocking || isOnline) return;
    const interval = setInterval(() => {
      if (navigator.onLine) {
        setAutoRetrying(true);
        setTimeout(() => setAutoRetrying(false), 1500);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [blocking, isOnline]);

  // Modo bloqueante (pagamento offline)
  if (blocking && !isOnline) {
    return (
      <div className={s.blocking}>
        <div className={s.blockingInner}>
          <svg className={s.blockingIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M8.111 8.111A9 9 0 0 0 3.52 12c1.84 2.893 5.123 5 8.48 5a9.003 9.003 0 0 0 4.889-1.445M12 3c4.97 0 9 4.03 9 9 0 .557-.05 1.1-.145 1.627" />
          </svg>
          <h2 className={s.blockingTitle}>Sem conexão</h2>
          <p className={s.blockingText}>
            O pagamento requer internet.
            <br />
            Seus dados de endereço estão salvos.
          </p>
          <button
            className={s.blockingBtn}
            onClick={onRetry}
            disabled={autoRetrying}
          >
            {autoRetrying ? "Verificando…" : "Tentar novamente"}
          </button>
          <p className={s.blockingHint}>Verificando conexão automaticamente…</p>
        </div>
      </div>
    );
  }

  // Modo sticky (banner no topo — offline ou "voltou online")
  if (!isOnline) {
    return (
      <div className={s.sticky} data-state="offline">
        <span className={s.stickyIcon}>📶</span>
        <span>Você está offline. Seus dados estão salvos.</span>
      </div>
    );
  }

  if (wasOffline && isOnline) {
    return (
      <div className={s.sticky} data-state="restored">
        <span className={s.stickyIcon}>✓</span>
        <span>Conexão restaurada.</span>
      </div>
    );
  }

  return null;
}
