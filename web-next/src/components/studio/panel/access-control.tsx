"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { AdminAccess, AdminModulePermission, AdminRole } from "@/types";

const AdminAccessContext = createContext<AdminAccess | null>(null);

export function AdminAccessProvider({ value, children }: { value: AdminAccess | null; children: ReactNode }) {
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccess | null {
  return useContext(AdminAccessContext);
}

export function useAdminPermission(moduleName: AdminModulePermission): boolean {
  const access = useAdminAccess();
  if (!access) return false;
  if (access.role === "director" || access.role === "superadmin") return true;
  return Array.isArray(access.permissions) && access.permissions.includes(moduleName);
}

export function useAdminRole(roles: AdminRole[]): boolean {
  const access = useAdminAccess();
  if (!access) return false;
  return roles.includes(access.role);
}

export function AccessDeniedState({
  title = "Acesso negado",
  message = "Você não tem permissão para acessar esta área.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div
      style={{
        border: "1px solid #ece7df",
        background: "#fbf8f3",
        borderRadius: 16,
        padding: "32px 28px",
        color: "#2a241d",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#8d7f70" }}>403</div>
      <h3 style={{ margin: "8px 0 10px", fontSize: 24, fontWeight: 500 }}>{title}</h3>
      <p style={{ margin: 0, maxWidth: 560, color: "#675a4d", lineHeight: 1.6 }}>{message}</p>
    </div>
  );
}

export function RequirePermission({
  module,
  children,
  fallback,
}: {
  module: AdminModulePermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = useAdminPermission(module);
  if (!allowed) {
    return fallback || <AccessDeniedState message="Seu perfil não possui permissão para este módulo." />;
  }
  return <>{children}</>;
}

export function RequireRole({
  roles,
  children,
  fallback,
}: {
  roles: AdminRole[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = useAdminRole(roles);
  if (!allowed) {
    return fallback || <AccessDeniedState message="Esta área é restrita à Diretoria." />;
  }
  return <>{children}</>;
}
