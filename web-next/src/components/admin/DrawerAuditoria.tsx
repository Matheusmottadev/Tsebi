"use client";

import type { AdminAuditLog } from "@/services/admin";
import { Download } from "lucide-react";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerAuditoriaProps = {
  isOpen: boolean;
  onClose: () => void;
  rows: AdminAuditLog[];
  onSaved: () => void;
};

function csvEscape(value: unknown) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function downloadAuditCsv(rows: AdminAuditLog[]) {
  const header = ["id", "action", "entityType", "entityId", "summary", "actorEmail", "requestIp", "route", "createdAt"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.id,
        row.action,
        row.entityType,
        row.entityId || "",
        row.summary || "",
        row.actorEmail || "",
        row.requestIp || "",
        typeof row.meta?.routeType === "string" ? row.meta.routeType : typeof row.meta?.route === "string" ? row.meta.route : "",
        row.createdAt || "",
      ]
        .map((value) => csvEscape(value))
        .join(",")
    );
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function DrawerAuditoria({ isOpen, onClose, rows, onSaved }: DrawerAuditoriaProps) {
  function handleExport() {
    downloadAuditCsv(rows);
    onClose();
    onSaved();
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Auditoria"
      subtitle="Exportar logs"
      footer={
        <>
          <button type="button" className={form.inlineBtn} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={`${form.inlineBtn} ${form.inlineBtnDark}`} onClick={handleExport}>
            <Download size={12} style={{ marginRight: 6 }} />
            Exportar
          </button>
        </>
      }
    >
      <div className={form.centerMessage}>
        <p>{rows.length} logs prontos para exportação.</p>
      </div>
    </Drawer>
  );
}
