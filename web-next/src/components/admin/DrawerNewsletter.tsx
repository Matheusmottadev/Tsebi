"use client";

import { useMemo, useState } from "react";
import type { AdminNewsletterRow } from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerNewsletterProps = {
  isOpen: boolean;
  onClose: () => void;
  rows: AdminNewsletterRow[];
  onRowsChange: (rows: AdminNewsletterRow[]) => void;
  onSaved: () => void;
};

export function DrawerNewsletter({ isOpen, onClose, rows, onRowsChange, onSaved }: DrawerNewsletterProps) {
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected]
  );

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  function handleRemoveSelected() {
    if (!selectedIds.length) return;
    const selectedSet = new Set(selectedIds);
    onRowsChange(rows.filter((row) => !selectedSet.has(String(row.id))));
    setSelected({});
    onSaved();
  }

  function handleClose() {
    setSelected({});
    onClose();
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={handleClose}
      title="Newsletter"
      subtitle="Gerencie os inscritos"
      footer={
        selectedIds.length > 0 ? (
          <>
            <button type="button" className={form.inlineBtn} onClick={handleClose}>
              Cancelar
            </button>
            <button type="button" className={`${form.inlineBtn} ${form.inlineBtnDanger}`} onClick={handleRemoveSelected}>
              Remover selecionados
            </button>
          </>
        ) : (
          <button type="button" className={form.inlineBtn} onClick={handleClose}>
            Fechar
          </button>
        )
      }
    >
      <div className={form.stack}>
        <div className={form.newsletterList}>
          {rows.length ? (
            rows.map((row) => {
              const id = String(row.id);
              return (
                <label key={id} className={form.newsletterRow}>
                  <input type="checkbox" checked={Boolean(selected[id])} onChange={() => toggle(id)} />
                  <span>
                    <span className={form.newsletterEmail}>{row.email || "-"}</span>
                    <span className={form.newsletterMeta}>
                      {row.phone || "Sem telefone"} · {row.source || "Sem origem"}
                    </span>
                  </span>
                </label>
              );
            })
          ) : (
            <div className={form.newsletterRow}>Nenhum inscrito encontrado.</div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

