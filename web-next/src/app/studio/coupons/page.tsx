import type { Metadata } from "next";
import { CouponsManager } from "@/components/studio/CouponsManager";
import { StudioShell } from "@/components/studio/StudioShell";
import { readStudioSession } from "@/lib/studio/server";
import { listCouponsAdmin } from "@/services/admin";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Studio Coupons",
  description: "Admin coupons management in Studio portal.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function StudioCouponsPage() {
  const session = await readStudioSession("/studio/coupons");
  const coupons = await listCouponsAdmin({ page: 1, pageSize: 200 }, { cookie: session.cookie, cache: "no-store" });

  return (
    <StudioShell
      admin={session.admin}
      title="Coupons"
      subtitle='Gerencie "Código de acesso" com regras de percentual e valor fixo.'
    >
      <div className={styles.card}>
        <CouponsManager initialCoupons={coupons.rows} csrfToken={session.csrfToken} />
      </div>
    </StudioShell>
  );
}

