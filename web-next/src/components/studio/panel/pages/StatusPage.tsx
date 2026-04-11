"use client";

import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAdminSystemStatus, type AdminSystemStatusResponse } from "@/services/admin";
import { useAdminAccess } from "../access-control";
import styles from "./StatusPage.module.css";

type StatusPageProps = {
  refreshKey: number;
};

function emptyStatus(): AdminSystemStatusResponse {
  return {
    updatedAt: new Date().toISOString(),
    services: {
      bling: { configured: false, label: "Bling incompleto", description: "Sem dados carregados." },
      resend: { configured: false, label: "Resend incompleto", description: "Sem dados carregados." },
    },
    queues: [],
    nfseFailures: [],
    criticalAlerts: [],
  };
}

function formatRelativeDate(value: string | null): string {
  if (!value) return "agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "agora";
  const diffMinutes = Math.round((date.getTime() - Date.now()) / (1000 * 60));
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diffMinutes) < 60) return rtf.format(diffMinutes, "minute");
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return rtf.format(diffHours, "hour");
  return rtf.format(Math.round(diffHours / 24), "day");
}

export function StatusPage({ refreshKey }: StatusPageProps) {
  const access = useAdminAccess();
  const isPrivileged = access?.role === "director" || access?.role === "superadmin";
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AdminSystemStatusResponse>(emptyStatus);
  const [resolvedRefreshKey, setResolvedRefreshKey] = useState<number | null>(null);
  const loading = resolvedRefreshKey !== refreshKey;

  useEffect(() => {
    let cancelled = false;

    getAdminSystemStatus({ cache: "no-store" })
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
        setError("");
        setResolvedRefreshKey(refreshKey);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar o status do sistema.");
        setResolvedRefreshKey(refreshKey);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const serviceCards = useMemo(
    () => [
      {
        key: "bling",
        title: "Bling",
        value: status.services.bling.label,
        description: status.services.bling.description,
        ok: status.services.bling.configured,
      },
      {
        key: "resend",
        title: "Resend",
        value: status.services.resend.label,
        description: status.services.resend.description,
        ok: status.services.resend.configured,
      },
    ],
    [status.services]
  );

  return (
    <div className={styles.page}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Saúde do sistema</p>
          <h3 className={styles.heroTitle}>Central de status</h3>
          <p className={styles.heroDescription}>
            Acompanhe integração fiscal, envio de e-mail, filas abertas, falhas recentes de NFS-e e alertas críticos do admin.
          </p>
        </div>
        <div className={styles.heroMeta}>
          <RefreshCcw size={14} />
          Atualizado {formatRelativeDate(status.updatedAt)}
        </div>
      </section>

      {error ? <p className={styles.errorBanner}>{error}</p> : null}

      <div className={styles.serviceGrid}>
        {serviceCards.map((card) => (
          <section key={card.key} className={`${styles.surface} ${styles.serviceCard}`}>
            <div className={styles.serviceHeader}>
              <span className={styles.eyebrow}>{card.title}</span>
              <span className={`${styles.serviceState} ${card.ok ? styles.serviceStateOk : styles.serviceStateError}`}>
                {card.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                {card.ok ? "Configurado" : "Pendente"}
              </span>
            </div>
            <p className={styles.serviceValue}>{card.value}</p>
            <p className={styles.serviceDescription}>{card.description}</p>
          </section>
        ))}
      </div>

      <section className={`${styles.surface} ${styles.queueSection}`}>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>Filas pendentes</span>
        </div>
        {status.queues.length > 0 ? (
          <div className={styles.queueGrid}>
            {status.queues.map((queue) => (
              <article key={queue.key} className={styles.queueCard}>
                <p className={styles.eyebrow}>{queue.label}</p>
                <p className={styles.queueCount}>{queue.count}</p>
                <p className={styles.queueDescription}>{queue.description}</p>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>Nenhuma fila pendente no momento.</p>
        )}
      </section>

      <div className={`${styles.stackGrid} ${!isPrivileged ? styles.stackGridSingle : ""}`}>
        <section className={`${styles.surface} ${styles.feedSection}`}>
          <div className={styles.sectionHeader}>
            <AlertTriangle size={16} color="#b56a09" />
            <span className={styles.sectionTitle}>Falhas recentes de NFS-e</span>
          </div>
          {loading ? <p className={styles.loadingState}>Carregando falhas...</p> : null}
          {!loading && status.nfseFailures.length === 0 ? <p className={styles.emptyState}>Nenhuma falha recente de emissão.</p> : null}
          {!loading && status.nfseFailures.length > 0 ? (
            <div className={styles.feedList}>
              {status.nfseFailures.map((failure) => (
                <article key={failure.id} className={`${styles.feedItem} ${styles.feedItemFailure}`}>
                  <div className={styles.feedTop}>
                    <p className={styles.feedTitle}>{failure.customerName}</p>
                    <span className={styles.feedTime}>{formatRelativeDate(failure.happenedAt)}</span>
                  </div>
                  <p className={styles.feedMessage}>{failure.message}</p>
                  <div className={styles.feedMeta}>
                    Pedido {failure.pedidoId.slice(0, 8)} · tentativa {failure.attempts}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        {isPrivileged ? (
          <section className={`${styles.surface} ${styles.feedSection}`}>
            <div className={styles.sectionHeader}>
              <ShieldAlert size={16} color="#7c2d12" />
              <span className={styles.sectionTitle}>Alertas críticos</span>
            </div>
            {loading ? <p className={styles.loadingState}>Carregando alertas...</p> : null}
            {!loading && status.criticalAlerts.length === 0 ? <p className={styles.emptyState}>Nenhum alerta crítico recente.</p> : null}
            {!loading && status.criticalAlerts.length > 0 ? (
              <div className={styles.feedList}>
                {status.criticalAlerts.map((alert) => (
                  <article key={alert.id} className={`${styles.feedItem} ${styles.feedItemAlert}`}>
                    <div className={styles.feedTop}>
                      <p className={styles.feedTitle}>{alert.title}</p>
                      <span className={styles.feedTime}>{formatRelativeDate(alert.createdAt)}</span>
                    </div>
                    <p className={styles.feedMessage}>{alert.subtitle}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
