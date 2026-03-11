"use client";

import { Star } from "lucide-react";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerNovoCadastroVIPProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DrawerNovoCadastroVIP({ isOpen, onClose }: DrawerNovoCadastroVIPProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Cadastro VIP"
      subtitle="Em breve"
      footer={
        <button type="button" className={form.inlineBtn} onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className={form.centerMessage}>
        <Star size={28} strokeWidth={1.8} />
        <p>Esta funcionalidade está sendo desenvolvida.</p>
      </div>
    </Drawer>
  );
}

