"use client";

import { Wrench } from "lucide-react";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerNovoAtendimentoProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function DrawerNovoAtendimento({ isOpen, onClose }: DrawerNovoAtendimentoProps) {
  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Atendimento"
      subtitle="Em breve"
      footer={
        <button type="button" className={form.inlineBtn} onClick={onClose}>
          Fechar
        </button>
      }
    >
      <div className={form.centerMessage}>
        <Wrench size={28} strokeWidth={1.8} />
        <p>Esta funcionalidade está sendo desenvolvida.</p>
      </div>
    </Drawer>
  );
}

