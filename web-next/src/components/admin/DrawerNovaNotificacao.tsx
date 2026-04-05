"use client";

import { useState } from "react";
import { sendNotificationAdmin } from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type DrawerNovaNotificacaoProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const TARGET_OPTIONS = [
  { value: "all", label: "Todos os dispositivos" },
  { value: "orders", label: "Usuários com pedidos" },
  { value: "wishlist", label: "Usuários com wishlist" },
];

export function DrawerNovaNotificacao({ isOpen, onClose, onSaved }: DrawerNovaNotificacaoProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isValid = title.trim().length > 0 && body.trim().length > 0;

  async function handleSave() {
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      await sendNotificationAdmin({ title: title.trim(), body: body.trim(), target });
      setTitle("");
      setBody("");
      setTarget("all");
      onSaved();
      onClose();
    } catch {
      setErrorMessage("Não foi possível enviar a notificação. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Notificação"
      subtitle="Enviar push notification para dispositivos iOS"
      onSave={handleSave}
      saveLabel={isSubmitting ? "Enviando..." : "Enviar"}
      cancelLabel="Cancelar"
      disableSave={!isValid || isSubmitting}
      stickyFooter
    >
      <div className={form.stack}>
        {errorMessage ? <p style={{ color: "#9f1f1f", fontSize: 12 }}>{errorMessage}</p> : null}

        <div className={form.field}>
          <label className={form.label} htmlFor="notif-title">Título</label>
          <input
            id="notif-title"
            className={form.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Nova coleção disponível"
            maxLength={100}
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="notif-body">Mensagem</label>
          <textarea
            id="notif-body"
            className={form.textarea}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Ex: Descubra as novas peças da coleção Inverno 2025."
            rows={4}
            maxLength={300}
          />
          <small style={{ display: "block", marginTop: 4, fontSize: 10, color: "#aaa" }}>
            {body.length}/300 caracteres
          </small>
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="notif-target">Destinatários</label>
          <select
            id="notif-target"
            className={form.select}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            {TARGET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={{ borderTop: "1px solid #e8e8e8", paddingTop: 20, marginTop: 4 }}>
          <p style={{ fontSize: 11, color: "#888", lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: "#555" }}>Pré-visualização</strong><br />
            <span style={{ fontSize: 12, color: "#111", fontWeight: 500 }}>{title || "Título da notificação"}</span><br />
            <span style={{ fontSize: 11, color: "#555" }}>{body || "Mensagem da notificação aparece aqui."}</span>
          </p>
        </div>
      </div>
    </Drawer>
  );
}
