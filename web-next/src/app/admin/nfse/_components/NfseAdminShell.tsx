"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { AdminAccess, PublicUser } from "@/types";
import { AdminAccessProvider } from "@/components/studio/panel/access-control";
import { Sidebar } from "@/components/studio/panel/Sidebar";

type NfseAdminShellProps = {
  admin: PublicUser;
  access: AdminAccess | null;
  children: ReactNode;
};

export default function NfseAdminShell({ admin, access, children }: NfseAdminShellProps) {
  const router = useRouter();

  return (
    <AdminAccessProvider value={access}>
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          width: "100%",
          background: "#f7f7f7",
          color: "#333",
          overflowX: "hidden",
        }}
      >
        <Sidebar
          activePage="inicio"
          onChangePage={() => router.push("/admin")}
          pendingOrders={0}
          openCare={0}
          pendingRepairs={0}
        />

        <main
          style={{
            marginLeft: 220,
            flex: 1,
            minWidth: 0,
            width: "calc(100% - 220px)",
            minHeight: "100vh",
            background: "#f7f7f7",
          }}
        >
          <div
            style={{
              padding: "36px 40px",
              width: "100%",
              minWidth: 0,
            }}
          >
            {children}
          </div>
        </main>
      </div>
    </AdminAccessProvider>
  );
}
