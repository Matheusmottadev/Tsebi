"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { HttpError } from "@/lib/http";
import {
  createUserAdmin,
  deleteUserAdmin,
  disableUserLoginAdmin,
  getUserAdmin,
  logoutUserSessionsAdmin,
  setUserTempPasswordAdmin,
  updateUserAdmin,
  type AdminUserDetail,
  type AdminUserRow,
} from "@/services/admin";
import styles from "./UsersManager.module.css";

type UsersManagerProps = {
  users: AdminUserRow[];
  csrfToken: string;
};

type UserDraft = {
  title: "sr" | "sra" | "srta" | "nao_informar" | "";
  name: string;
  email: string;
  phone: string;
  birthDate: string;
  cpf: string;
  cep: string;
};

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    const payload = error.payload;
    if (payload && typeof payload === "object" && "error" in payload) {
      const code = String((payload as { error?: unknown }).error || "").trim();
      if (code) return code;
    }
    return error.message || "Falha na operacao.";
  }
  if (error instanceof Error) return error.message || "Falha na operacao.";
  return "Falha na operacao.";
}

function normalizeDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

function formatCpfInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 11);
  const part1 = digits.slice(0, 3);
  const part2 = digits.slice(3, 6);
  const part3 = digits.slice(6, 9);
  const part4 = digits.slice(9, 11);
  if (digits.length <= 3) return part1;
  if (digits.length <= 6) return `${part1}.${part2}`;
  if (digits.length <= 9) return `${part1}.${part2}.${part3}`;
  return `${part1}.${part2}.${part3}-${part4}`;
}

function normalizePhoneDigits(value: string): string {
  let digits = normalizeDigits(value);
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

function formatPhoneInput(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (!rest) return `(${ddd}`;
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
}

function formatBirthDateInput(value: string): string {
  const digits = normalizeDigits(value).slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

function toDisplayBirthDate(value: string): string {
  const raw = String(value || "").trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  return formatBirthDateInput(raw);
}

function toApiBirthDate(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  const digits = normalizeDigits(raw);
  if (digits.length !== 8) return "";
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function buildDraft(user: AdminUserDetail): UserDraft {
  return {
    title: user.title || "nao_informar",
    name: user.name || "",
    email: user.email || "",
    phone: formatPhoneInput(user.phone || ""),
    birthDate: toDisplayBirthDate(user.birthDate || ""),
    cpf: formatCpfInput(user.cpf || ""),
    cep: user.cep || "",
  };
}

export function UsersManager({ users, csrfToken }: UsersManagerProps) {
  const router = useRouter();
  const [rows, setRows] = useState(users);
  const [loadingId, setLoadingId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [createData, setCreateData] = useState({
    title: "nao_informar" as "sr" | "sra" | "srta" | "nao_informar",
    name: "",
    email: "",
    phone: "",
    password: "",
    birthDate: "",
    cpf: "",
    cep: "",
  });

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    [rows]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!selectedUser) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUser) setDeleteConfirmOpen(false);
  }, [selectedUser]);

  async function openUser(userId: string) {
    setLoadingId(userId);
    setError("");
    setMessage("");
    try {
      const user = await getUserAdmin(userId);
      setSelectedUser(user);
      setDraft(buildDraft(user));
      setEditMode(false);
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoadingId("");
    }
  }

  async function handleCreate() {
    setLoadingId("create");
    setError("");
    setMessage("");
    try {
      await createUserAdmin(
        {
          title: createData.title,
          name: createData.name.trim(),
          email: createData.email.trim(),
          phone: normalizePhoneDigits(createData.phone),
          password: createData.password,
          birthDate: toApiBirthDate(createData.birthDate),
          cpf: normalizeDigits(createData.cpf),
          cep: normalizeDigits(createData.cep),
        },
        csrfToken
      );
      setCreateData({
        title: "nao_informar",
        name: "",
        email: "",
        phone: "",
        password: "",
        birthDate: "",
        cpf: "",
        cep: "",
      });
      setMessage("Usuario criado com sucesso.");
      router.refresh();
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoadingId("");
    }
  }

  async function saveSelectedUser() {
    if (!selectedUser || !draft) return;

    const patch: Record<string, string> = {};
    if (draft.title !== selectedUser.title) patch.title = draft.title || "nao_informar";
    if (draft.name.trim() !== selectedUser.name) patch.name = draft.name.trim();
    if (draft.email.trim() !== selectedUser.email) patch.email = draft.email.trim();
    const draftPhone = normalizePhoneDigits(draft.phone);
    const selectedPhone = normalizePhoneDigits(selectedUser.phone || "");
    if (draftPhone !== selectedPhone) patch.phone = draftPhone;
    const draftBirthDateApi = toApiBirthDate(draft.birthDate);
    const selectedBirthDateApi = toApiBirthDate(selectedUser.birthDate || "");
    if (draftBirthDateApi !== selectedBirthDateApi) patch.birthDate = draftBirthDateApi;

    const draftCpf = normalizeDigits(draft.cpf);
    const currentCpf = normalizeDigits(selectedUser.cpf || "");
    if (draftCpf !== currentCpf) patch.cpf = draftCpf;

    const draftCep = normalizeDigits(draft.cep);
    const currentCep = normalizeDigits(selectedUser.cep || "");
    if (draftCep !== currentCep) patch.cep = draftCep;

    if (Object.keys(patch).length === 0) {
      setMessage("Nenhuma alteracao para salvar.");
      setEditMode(false);
      return;
    }

    setLoadingId(selectedUser.id);
    setError("");
    setMessage("");
    try {
      await updateUserAdmin(selectedUser.id, patch, csrfToken);
      const updated = await getUserAdmin(selectedUser.id);
      setSelectedUser(updated);
      setDraft(buildDraft(updated));
      setRows((current) =>
        current.map((row) =>
          row.id === updated.id
            ? {
                ...row,
                title: updated.title,
                name: updated.name,
                email: updated.email,
                phone: updated.phone,
                cpf: updated.cpf,
                cep: updated.cep,
                status: updated.loginDisabled ? "disabled" : "active",
                passwordSetupPending: Boolean(updated.passwordResetRequired),
                lastLoginAt: updated.lastLoginAt,
              }
            : row
        )
      );
      setEditMode(false);
      setMessage(`Usuario ${updated.email} atualizado.`);
      router.refresh();
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoadingId("");
    }
  }

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (!selectedUser) return;
    setLoadingId(selectedUser.id);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(label);
      const refreshed = await getUserAdmin(selectedUser.id).catch(() => null);
      if (refreshed) {
        setSelectedUser(refreshed);
        setDraft(buildDraft(refreshed));
      }
      router.refresh();
    } catch (err) {
      setError(pickErrorMessage(err));
    } finally {
      setLoadingId("");
    }
  }

  return (
    <div className={styles.wrapper}>
      <section className={styles.createCard}>
        <h3>Novo usuário</h3>
        <div className={styles.grid}>
          <select
            value={createData.title}
            onChange={(event) =>
              setCreateData((current) => ({
                ...current,
                title: event.target.value as "sr" | "sra" | "srta" | "nao_informar",
              }))
            }
          >
            <option value="nao_informar">Nao informar</option>
            <option value="sr">Sr</option>
            <option value="sra">Sra</option>
            <option value="srta">Srta</option>
          </select>
          <input value={createData.name} onChange={(event) => setCreateData((c) => ({ ...c, name: event.target.value }))} placeholder="Nome" />
          <input value={createData.email} onChange={(event) => setCreateData((c) => ({ ...c, email: event.target.value }))} placeholder="Email" type="email" />
          <input
            value={createData.phone}
            onChange={(event) => setCreateData((c) => ({ ...c, phone: formatPhoneInput(event.target.value) }))}
            placeholder="Telefone"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={15}
          />
          <input value={createData.password} onChange={(event) => setCreateData((c) => ({ ...c, password: event.target.value }))} placeholder="Senha" type="password" />
          <input
            value={createData.birthDate}
            onChange={(event) => setCreateData((c) => ({ ...c, birthDate: formatBirthDateInput(event.target.value) }))}
            placeholder="Nascimento DD/MM/AAAA"
          />
          <input
            value={createData.cpf}
            onChange={(event) => setCreateData((c) => ({ ...c, cpf: formatCpfInput(event.target.value) }))}
            placeholder="CPF"
          />
          <input value={createData.cep} onChange={(event) => setCreateData((c) => ({ ...c, cep: event.target.value }))} placeholder="CEP" />
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!createData.name || !createData.email || !createData.password || loadingId === "create"}
        >
          {loadingId === "create" ? "Salvando..." : "Cadastrar"}
        </button>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.ok}>{message}</p> : null}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Email</th>
              <th>Status</th>
              <th>Ultimo login</th>
              <th>Criado em</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((user) => (
              <tr key={user.id}>
                <td>{user.name || "-"}</td>
                <td>{user.email || "-"}</td>
                <td>{user.passwordSetupPending ? "cliente sem senha" : user.status || "-"}</td>
                <td>{formatDate(user.lastLoginAt)}</td>
                <td>{formatDate(user.createdAt)}</td>
                <td>
                  <button type="button" onClick={() => openUser(user.id)} disabled={loadingId === user.id}>
                    {loadingId === user.id ? "Abrindo..." : "Editar"}
                  </button>
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.empty}>
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {mounted && selectedUser && draft
        ? createPortal(
            <div className={styles.drawerRoot}>
              <button
                type="button"
                className={styles.drawerBackdrop}
                aria-label="Fechar painel do cliente"
                onClick={() => {
                  setSelectedUser(null);
                  setEditMode(false);
                }}
              />
              <aside className={styles.drawerPanel}>
                <div className={styles.detailHeader}>
                  <div>
                    <h3>Cliente: {selectedUser.name || selectedUser.email}</h3>
                    <p className={styles.drawerSub}>{selectedUser.email}</p>
                    {selectedUser.passwordResetRequired ? <p className={styles.warning}>cliente sem senha</p> : null}
                  </div>
                  <div className={styles.detailActions}>
                    <button type="button" onClick={() => setEditMode((v) => !v)}>
                      {editMode ? "Cancelar" : "Editar"}
                    </button>
                    <button type="button" onClick={saveSelectedUser} disabled={!editMode || loadingId === selectedUser.id}>
                      {loadingId === selectedUser.id ? "Salvando..." : "Salvar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUser(null);
                        setEditMode(false);
                      }}
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                <section className={styles.block}>
                  <h4>Cadastro</h4>
                  <div className={styles.detailGrid}>
            <label>
              <span>Titulo</span>
              <select
                disabled={!editMode}
                value={draft.title}
                onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value as UserDraft["title"] } : current))}
              >
                <option value="nao_informar">Nao informar</option>
                <option value="sr">Sr</option>
                <option value="sra">Sra</option>
                <option value="srta">Srta</option>
              </select>
            </label>
            <label>
              <span>Nome</span>
              <input disabled={!editMode} value={draft.name} onChange={(event) => setDraft((c) => (c ? { ...c, name: event.target.value } : c))} />
            </label>
            <label>
              <span>Email</span>
              <input disabled={!editMode} value={draft.email} onChange={(event) => setDraft((c) => (c ? { ...c, email: event.target.value } : c))} />
            </label>
            <label>
              <span>Telefone</span>
              <input
                disabled={!editMode}
                value={draft.phone}
                onChange={(event) => setDraft((c) => (c ? { ...c, phone: formatPhoneInput(event.target.value) } : c))}
                inputMode="numeric"
                autoComplete="tel"
                maxLength={15}
              />
            </label>
            <label>
              <span>Nascimento</span>
              <input
                disabled={!editMode}
                value={draft.birthDate}
                onChange={(event) => setDraft((c) => (c ? { ...c, birthDate: formatBirthDateInput(event.target.value) } : c))}
              />
            </label>
            <label>
              <span>CPF</span>
              <input
                disabled={!editMode}
                value={draft.cpf}
                onChange={(event) => setDraft((c) => (c ? { ...c, cpf: formatCpfInput(event.target.value) } : c))}
              />
            </label>
            <label>
              <span>CEP</span>
              <input disabled={!editMode} value={draft.cep} onChange={(event) => setDraft((c) => (c ? { ...c, cep: event.target.value } : c))} />
            </label>
            <label>
              <span>Status login</span>
              <input disabled value={selectedUser.loginDisabled ? "disabled" : "active"} />
            </label>
            <label>
              <span>Status cadastro</span>
              <input disabled value={selectedUser.passwordResetRequired ? "cliente sem senha" : "com senha"} />
            </label>
                  </div>
                </section>

                <section className={styles.block}>
                  <h4>Conta</h4>
                  <div className={styles.metaGrid}>
            <label>
              <span>Email verificado</span>
              <input disabled value={selectedUser.emailVerified ? "sim" : "não"} />
            </label>
            <label>
              <span>Ultimo login</span>
              <input disabled value={formatDate(selectedUser.lastLoginAt)} />
            </label>
            <label>
              <span>Criado em</span>
              <input disabled value={formatDate(selectedUser.createdAt)} />
            </label>
            <label>
              <span>Atualizado em</span>
              <input disabled value={formatDate(selectedUser.updatedAt)} />
            </label>
                  </div>
                </section>

                <section className={styles.block}>
                  <h4>Acoes</h4>
                  <div className={styles.actionGrid}>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(`Senha temporaria gerada para ${selectedUser.email}.`, async () => {
                          const result = await setUserTempPasswordAdmin(selectedUser.id, csrfToken);
                          setMessage(`Senha temporaria de ${selectedUser.email}: ${result.tempPassword}`);
                        })
                      }
                    >
                      Gerar senha temp
                    </button>
                    <button type="button" onClick={() => runAction("Sessoes invalidadas.", () => logoutUserSessionsAdmin(selectedUser.id, csrfToken))}>
                      Forcar logout
                    </button>
                    <button type="button" onClick={() => runAction("Login desativado.", () => disableUserLoginAdmin(selectedUser.id, csrfToken))}>
                      Desativar login
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Excluir usuário
                    </button>
                  </div>
	                </section>
	              </aside>
	              {deleteConfirmOpen ? (
	                <div className={styles.confirmLayer} role="dialog" aria-modal="true" aria-labelledby="confirmDeleteTitle">
	                  <button
	                    type="button"
	                    className={styles.confirmBackdrop}
	                    aria-label="Cancelar exclusao de usuario"
	                    onClick={() => setDeleteConfirmOpen(false)}
	                  />
	                  <div className={styles.confirmCard}>
	                    <h4 id="confirmDeleteTitle">Excluir usuÃ¡rio?</h4>
	                    <p>
	                      Essa acao remove <strong>{selectedUser.email}</strong> permanentemente.
	                    </p>
	                    <div className={styles.confirmActions}>
	                      <button type="button" onClick={() => setDeleteConfirmOpen(false)}>
	                        Cancelar
	                      </button>
	                      <button
	                        type="button"
	                        className={styles.danger}
	                        onClick={() => {
	                          setDeleteConfirmOpen(false);
	                          runAction("Usuario excluido.", async () => {
	                            await deleteUserAdmin(selectedUser.id, csrfToken);
	                            setSelectedUser(null);
	                          });
	                        }}
	                      >
	                        Excluir usuÃ¡rio
	                      </button>
	                    </div>
	                  </div>
	                </div>
	              ) : null}
	            </div>
	            ,
	            document.body
          )
        : null}
    </div>
  );
}

