import type { Metadata } from "next";
import { HttpError } from "@/lib/http";
import { readStudioSession } from "@/lib/studio/server";
import { listAppointmentSlotsAdmin } from "@/services/admin";
import { StudioShell } from "@/components/studio/StudioShell";
import { PrivateCareManager } from "@/components/studio/PrivateCareManager";
import styles from "./page.module.css";

export const revalidate = 30;

type StudioPrivateCarePageProps = {
  searchParams?: Promise<{
    date?: string;
    status?: string;
    includePast?: string;
  }>;
};

export const metadata: Metadata = {
  title: "Studio Atendimentos",
  description: "Gestao de horarios disponiveis e agendamentos privados.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioPrivateCarePage({ searchParams }: StudioPrivateCarePageProps) {
  const session = await readStudioSession("/studio/atendimentos");
  const resolvedSearchParams = await searchParams;
  const date = String(resolvedSearchParams?.date || "").trim();
  const status = String(resolvedSearchParams?.status || "").trim();
  const includePast = String(resolvedSearchParams?.includePast || "").trim() === "1";

  let errorMessage = "";
  let rows: Awaited<ReturnType<typeof listAppointmentSlotsAdmin>>["rows"] = [];

  try {
    const result = await listAppointmentSlotsAdmin(
      {
        date: date || undefined,
        status: status || undefined,
        includePast,
      },
      { cookie: session.cookie, cache: "no-store" }
    );
    rows = Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    if (error instanceof HttpError) {
      errorMessage = error.message || "Falha ao carregar horarios.";
    } else {
      errorMessage = "Falha ao carregar horarios.";
    }
  }

  return (
    <StudioShell admin={session.admin} title="Atendimentos" subtitle="Crie, bloqueie e ajuste horarios. Os agendamentos dos clientes aparecem aqui.">
      <form className={styles.filters} method="get">
        <input type="date" name="date" defaultValue={date} />
        <select name="status" defaultValue={status}>
          <option value="">Todos os slots</option>
          <option value="available">available</option>
          <option value="booked">booked</option>
          <option value="filled">filled</option>
          <option value="blocked">blocked</option>
          <option value="unavailable">unavailable</option>
        </select>
        <label className={styles.checkbox}>
          <input type="checkbox" name="includePast" value="1" defaultChecked={includePast} />
          <span>Incluir passados</span>
        </label>
        <button type="submit">Filtrar</button>
      </form>

      {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

      <PrivateCareManager rows={rows} csrfToken={session.csrfToken} />
    </StudioShell>
  );
}
