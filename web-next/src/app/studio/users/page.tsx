import type { Metadata } from "next";
import { StudioShell } from "@/components/studio/StudioShell";
import { UsersManager } from "@/components/studio/UsersManager";
import { readStudioSession } from "@/lib/studio/server";
import { listUsersAdmin } from "@/services/admin";

export const metadata: Metadata = {
  title: "Studio Usuarios",
  description: "Gestao de usuarios no Studio.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioUsersPage() {
  const session = await readStudioSession("/studio/users");
  const users = await listUsersAdmin(
    { page: 1, pageSize: 100 },
    { cookie: session.cookie, cache: "no-store" }
  );

  return (
    <StudioShell admin={session.admin} title="Usuarios" subtitle="Gerencie contas, acessos e dados dos clientes.">
      <UsersManager users={users.users || []} csrfToken={session.csrfToken} />
    </StudioShell>
  );
}
