"use client";

import { useState } from "react";
import type { PublicUser, UserTitle } from "@/types";
import styles from "../account.module.css";

type Props = { user: PublicUser };

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0] ?? "", ""];
  const last = parts[parts.length - 1] ?? "";
  const first = parts.slice(0, -1).join(" ");
  return [first, last];
}

export function ProfileTab({ user }: Props) {
  const [firstName, lastName] = splitName(user.name);
  const defaultAddr =
    user.addresses.find((a) => a.id === user.defaultAddressId) ?? user.addresses[0] ?? null;

  // Personal data
  const [fname, setFname] = useState(firstName);
  const [lname, setLname] = useState(lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [cpf, setCpf] = useState(user.cpf ?? "");
  const [birthDate, setBirthDate] = useState(user.birthDate ?? "");
  const [title, setTitle] = useState<UserTitle>(user.title ?? "nao_informar");

  // Address
  const [cep, setCep] = useState(defaultAddr?.cep ?? user.cep ?? "");
  const [state, setState] = useState(defaultAddr?.state ?? "");
  const [street, setStreet] = useState(defaultAddr?.street ?? "");
  const [city, setCity] = useState(defaultAddr?.city ?? "");
  const [district, setDistrict] = useState(defaultAddr?.district ?? "");

  // Security
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave}>
      {/* ── Dados pessoais ── */}
      <section className={styles.formSection}>
        <h2 className={styles.sectionTitle}>Dados pessoais</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Nome</label>
            <input
              className={styles.fieldInput}
              value={fname}
              onChange={(e) => setFname(e.target.value)}
              placeholder="Nome"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Sobrenome</label>
            <input
              className={styles.fieldInput}
              value={lname}
              onChange={(e) => setLname(e.target.value)}
              placeholder="Sobrenome"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Email</label>
            <input
              className={styles.fieldInput}
              type="email"
              value={user.email}
              readOnly
              style={{ opacity: 0.6, cursor: "default" }}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Telefone</label>
            <input
              className={styles.fieldInput}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>CPF</label>
            <input
              className={styles.fieldInput}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="000.000.000-00"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Data de nascimento</label>
            <input
              className={styles.fieldInput}
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Pronome / Tratamento</label>
            <select
              className={styles.fieldSelect}
              value={title}
              onChange={(e) => setTitle(e.target.value as UserTitle)}
            >
              <option value="nao_informar">Não informar</option>
              <option value="sr">Sr.</option>
              <option value="sra">Sra.</option>
              <option value="srta">Srta.</option>
            </select>
          </div>
        </div>
      </section>

      <hr className={styles.formDivider} />

      {/* ── Endereço principal ── */}
      <section className={styles.formSection}>
        <h2 className={styles.sectionTitle}>Endereço principal</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>CEP</label>
            <input
              className={styles.fieldInput}
              value={cep}
              onChange={(e) => setCep(e.target.value)}
              placeholder="00000-000"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Estado</label>
            <input
              className={styles.fieldInput}
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="SP"
            />
          </div>
          <div className={`${styles.field}`} style={{ gridColumn: "1 / -1" }}>
            <label className={styles.fieldLabel}>Endereço</label>
            <input
              className={styles.fieldInput}
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Rua, número e complemento"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Cidade</label>
            <input
              className={styles.fieldInput}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="São Paulo"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Bairro</label>
            <input
              className={styles.fieldInput}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Pinheiros"
            />
          </div>
        </div>
      </section>

      <hr className={styles.formDivider} />

      {/* ── Segurança ── */}
      <section className={styles.formSection}>
        <h2 className={styles.sectionTitle}>Segurança</h2>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Senha atual</label>
            <input
              className={styles.fieldInput}
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div />
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Nova senha</label>
            <input
              className={styles.fieldInput}
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Confirmar nova senha</label>
            <input
              className={styles.fieldInput}
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
      </section>

      <div className={styles.formActions}>
        <button
          type="submit"
          className={`${styles.btnPill} ${styles.btnPillFilled}`}
          disabled={saving}
        >
          {saving ? "Salvando…" : saved ? "Salvo!" : "Salvar alterações"}
        </button>
        <button
          type="button"
          className={styles.btnPill}
          onClick={() => {
            setFname(firstName);
            setLname(lastName);
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
