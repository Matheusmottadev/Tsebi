"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createUserAdmin } from "@/services/admin";
import { Drawer } from "./Drawer";
import form from "./DrawerForms.module.css";

type UserTitle = "" | "sr" | "sra" | "dr" | "dra";

type DrawerNovoUsuarioProps = {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function hasLettersAndNumbers(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value);
}

function passwordStrength(value: string): "weak" | "medium" | "strong" {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (hasLettersAndNumbers(value)) score += 1;
  if (value.length >= 12 || /[^A-Za-z0-9]/.test(value)) score += 1;
  if (score <= 1) return "weak";
  if (score === 2) return "medium";
  return "strong";
}

function mapTitle(value: UserTitle): "sr" | "sra" | "srta" | "nao_informar" | undefined {
  if (!value) return undefined;
  if (value === "dr") return "sr";
  if (value === "dra") return "sra";
  return value;
}

export function DrawerNovoUsuario({ isOpen, onClose, onSaved }: DrawerNovoUsuarioProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [optionalOpen, setOptionalOpen] = useState(false);
  const [title, setTitle] = useState<UserTitle>("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [cep, setCep] = useState("");
  const [cepHint, setCepHint] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const numericCep = cep.replace(/\D/g, "");
    if (numericCep.length !== 8) {
      setCepHint("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${numericCep}/json/`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { localidade?: string; uf?: string; erro?: boolean };
        if (cancelled || data.erro) return;
        const city = String(data.localidade || "").trim();
        const state = String(data.uf || "").trim();
        setCepHint(city && state ? `${city} - ${state}` : "CEP válido");
      } catch {
        if (!cancelled) setCepHint("");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cep]);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const requiredValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return false;
    if (password.length < 8 || !hasLettersAndNumbers(password)) return false;
    return true;
  }, [name, email, password]);

  function validate() {
    const nextErrors: Record<string, string> = {};

    if (!name.trim()) nextErrors.name = "Informe o nome.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) nextErrors.email = "Informe um e-mail válido.";

    if (password.length < 8 || !hasLettersAndNumbers(password)) {
      nextErrors.password = "Use no mínimo 8 caracteres, com letra e número.";
    }

    if (cpf && cpf.replace(/\D/g, "").length !== 11) {
      nextErrors.cpf = "CPF deve ter 11 dígitos.";
    }

    const cepDigits = cep.replace(/\D/g, "");
    if (cep && cepDigits.length !== 8) {
      nextErrors.cep = "CEP deve ter 8 dígitos.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});
    try {
      await createUserAdmin({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        title: mapTitle(title),
        phone: phone.trim() || undefined,
        birthDate: birthDate || undefined,
        cpf: cpf.replace(/\D/g, "") || undefined,
        cep: cep.replace(/\D/g, "") || undefined,
      });

      onClose();
      onSaved();

      setName("");
      setEmail("");
      setPassword("");
      setOptionalOpen(false);
      setTitle("");
      setPhone("");
      setBirthDate("");
      setCpf("");
      setCep("");
      setCepHint("");
    } catch {
      setErrors({ form: "Falha ao criar usuário. Verifique os dados e tente novamente." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Novo Usuário"
      subtitle="Criar conta de usuário"
      onSave={handleSave}
      disableSave={!requiredValid || isSubmitting}
      saveLabel={isSubmitting ? "Salvando..." : "Salvar"}
    >
      <div className={form.stack}>
        {errors.form ? <p className={form.error}>{errors.form}</p> : null}

        <div className={form.field}>
          <label className={form.label} htmlFor="user-name">
            Nome
          </label>
          <input
            id="user-name"
            className={`${form.input} ${errors.name ? form.inputError : ""}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {errors.name ? <p className={form.error}>{errors.name}</p> : null}
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="user-email">
            E-mail
          </label>
          <input
            id="user-email"
            className={`${form.input} ${errors.email ? form.inputError : ""}`}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {errors.email ? <p className={form.error}>{errors.email}</p> : null}
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="user-password">
            Senha
          </label>
          <input
            id="user-password"
            type="password"
            className={`${form.input} ${errors.password ? form.inputError : ""}`}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div
            className={`${form.passwordMeter} ${
              strength === "weak" ? form.passwordMeterWeak : strength === "medium" ? form.passwordMeterMedium : form.passwordMeterStrong
            }`}
          >
            <span />
            <span />
            <span />
          </div>
          <p className={form.helper}>
            Força: {strength === "weak" ? "fraca" : strength === "medium" ? "média" : "forte"}
          </p>
          {errors.password ? <p className={form.error}>{errors.password}</p> : null}
        </div>

        <section className={form.optional}>
          <button type="button" className={form.optionalBtn} onClick={() => setOptionalOpen((current) => !current)}>
            {optionalOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Opcionais
          </button>

          {optionalOpen ? (
            <div className={form.optionalContent}>
              <div className={form.field}>
                <label className={form.label} htmlFor="user-title">
                  Título
                </label>
                <select
                  id="user-title"
                  className={form.select}
                  value={title}
                  onChange={(event) => setTitle(event.target.value as UserTitle)}
                >
                  <option value="">Não informar</option>
                  <option value="sr">Sr.</option>
                  <option value="sra">Sra.</option>
                  <option value="dr">Dr.</option>
                  <option value="dra">Dra.</option>
                </select>
              </div>

              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="user-phone">
                    Telefone
                  </label>
                  <input id="user-phone" className={form.input} value={phone} onChange={(event) => setPhone(event.target.value)} />
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="user-birthDate">
                    Data de nascimento
                  </label>
                  <input
                    id="user-birthDate"
                    type="date"
                    className={form.input}
                    value={birthDate}
                    onChange={(event) => setBirthDate(event.target.value)}
                  />
                </div>
              </div>

              <div className={form.row2}>
                <div className={form.field}>
                  <label className={form.label} htmlFor="user-cpf">
                    CPF
                  </label>
                  <input
                    id="user-cpf"
                    className={`${form.input} ${errors.cpf ? form.inputError : ""}`}
                    value={cpf}
                    onChange={(event) => setCpf(event.target.value)}
                  />
                  {errors.cpf ? <p className={form.error}>{errors.cpf}</p> : null}
                </div>

                <div className={form.field}>
                  <label className={form.label} htmlFor="user-cep">
                    CEP
                  </label>
                  <input
                    id="user-cep"
                    className={`${form.input} ${errors.cep ? form.inputError : ""}`}
                    value={cep}
                    onChange={(event) => setCep(event.target.value)}
                  />
                  {cepHint ? <p className={form.helper}>{cepHint}</p> : null}
                  {errors.cep ? <p className={form.error}>{errors.cep}</p> : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </Drawer>
  );
}

