"use client";

import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldAlert, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getAdminSystemStatus, type AdminSystemStatusResponse } from "@/services/admin";
import { useAdminAccess } from "../access-control";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<AdminSystemStatusResponse>(emptyStatus);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getAdminSystemStatus({ cache: "no-store" })
      .then((result) => {
        if (cancelled) return;
        setStatus(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Falha ao carregar o status do sistema.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div
        style={{
          border: "1px solid #ececec",
          borderRadius: 18,
          background: "#fff",
          padding: "22px 24px",
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b7b7b" }}>Saúde do sistema</div>
          <h3 style={{ margin: "8px 0 6px", fontSize: 30, fontWeight: 500, color: "#111" }}>Central de status</h3>
          <p style={{ margin: 0, color: "#666", maxWidth: 620, lineHeight: 1.6 }}>
            Acompanhe integração fiscal, envio de e-mail, filas abertas, falhas recentes de NFS-e e alertas críticos do admin.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#666", fontSize: 12, whiteSpace: "nowrap" }}>
          <RefreshCcw size={14} />
          Atualizado {formatRelativeDate(status.updatedAt)}
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid #f2caca", background: "#fff7f7", color: "#8d2f2f", borderRadius: 16, padding: "16px 18px" }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
        {serviceCards.map((card) => (
          <section key={card.key} style={{ border: "1px solid #ececec", borderRadius: 16, background: "#fff", padding: "18px 18px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b7b7b" }}>{card.title}</div>
              {card.ok ? <CheckCircle2 size={18} color="#1f8a47" /> : <XCircle size={18} color="#c73c3c" />}
            </div>
            <div style={{ marginTop: 10, fontSize: 24, fontWeight: 500, color: "#111" }}>{card.value}</div>
            <p style={{ margin: "8px 0 0", color: "#666", lineHeight: 1.6 }}>{card.description}</p>
          </section>
        ))}
      </div>

      <section style={{ border: "1px solid #ececec", borderRadius: 16, background: "#fff", padding: "18px 18px 16px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b7b7b", marginBottom: 12 }}>Filas pendentes</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          {status.queues.map((queue) => (
            <article key={queue.key} style={{ border: "1px solid #f0f0f0", borderRadius: 14, padding: "14px 14px 12px", background: "#fcfcfc" }}>
              <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: "0.12em" }}>{queue.label}</div>
              <div style={{ marginTop: 8, fontSize: 28, fontWeight: 500, color: "#111" }}>{queue.count}</div>
              <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12, lineHeight: 1.5 }}>{queue.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: isPrivileged ? "1.2fr 1fr" : "1fr", gap: 16 }}>
        <section style={{ border: "1px solid #ececec", borderRadius: 16, background: "#fff", padding: "18px 18px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <AlertTriangle size={16} color="#b56a09" />
            <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b7b7b" }}>Falhas recentes de NFS-e</div>
          </div>
          {loading ? <p style={{ margin: 0, color: "#777" }}>Carregando falhas...</p> : null}
          {!loading && status.nfseFailures.length === 0 ? <p style={{ margin: 0, color: "#777" }}>Nenhuma falha recente de emissão.</p> : null}
          {!loading && status.nfseFailures.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {status.nfseFailures.map((failure) => (
                <article key={failure.id} style={{ border: "1px solid #f0e1e1", background: "#fffafa", borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <strong style={{ color: "#111", fontSize: 13 }}>{failure.customerName}</strong>
                    <span style={{ color: "#8b6b6b", fontSize: 11 }}>{formatRelativeDate(failure.happenedAt)}</span>
                  </div>
                  <p style={{ margin: "6px 0 0", color: "#8d2f2f", fontSize: 12, lineHeight: 1.5 }}>{failure.message}</p>
                  <div style={{ marginTop: 6, color: "#777", fontSize: 11 }}>
                    Pedido {failure.pedidoId.slice(0, 8)} · tentativa {failure.attempts}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        {isPrivileged ? (
          <section style={{ border: "1px solid #ececec", borderRadius: 16, background: "#fff", padding: "18px 18px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <ShieldAlert size={16} color="#7c2d12" />
              <div style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#7b7b7b" }}>Alertas críticos</div>
            </div>
            {loading ? <p style={{ margin: 0, color: "#777" }}>Carregando alertas...</p> : null}
            {!loading && status.criticalAlerts.length === 0 ? <p style={{ margin: 0, color: "#777" }}>Nenhum alerta crítico recente.</p> : null}
            {!loading && status.criticalAlerts.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {status.criticalAlerts.map((alert) => (
                  <article key={alert.id} style={{ border: "1px solid #f1ece6", background: "#fffdfa", borderRadius: 14, padding: "12px 14px" }}>
                    <strong style={{ color: "#111", fontSize: 13 }}>{alert.title}</strong>
                    <p style={{ margin: "6px 0 0", color: "#666", fontSize: 12, lineHeight: 1.5 }}>{alert.subtitle}</p>
                    <div style={{ marginTop: 6, color: "#8b6b6b", fontSize: 11 }}>{formatRelativeDate(alert.createdAt)}</div>
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
