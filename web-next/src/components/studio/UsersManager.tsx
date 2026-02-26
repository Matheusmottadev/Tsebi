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
    phone: user.phone || "",
    birthDate: user.birthDate || "",
    cpf: user.cpf || "",
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
          phone: createData.phone.trim(),
          password: createData.password,
          birthDate: createData.birthDate.trim(),
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
    if (draft.phone.trim() !== (selectedUser.phone || "")) patch.phone = draft.phone.trim();
    if (draft.birthDate.trim() !== (selectedUser.birthDate || "")) patch.birthDate = draft.birthDate.trim();

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
        <h3>Novo usuario</h3>
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
          <input value={createData.phone} onChange={(event) => setCreateData((c) => ({ ...c, phone: event.target.value }))} placeholder="Telefone" />
          <input value={createData.password} onChange={(event) => setCreateData((c) => ({ ...c, password: event.target.value }))} placeholder="Senha" type="password" />
          <input value={createData.birthDate} onChange={(event) => setCreateData((c) => ({ ...c, birthDate: event.target.value }))} placeholder="Nascimento AAAA-MM-DD" />
          <input value={createData.cpf} onChange={(event) => setCreateData((c) => ({ ...c, cpf: event.target.value }))} placeholder="CPF" />
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
                  Nenhum usuario encontrado.
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
              <input disabled={!editMode} value={draft.phone} onChange={(event) => setDraft((c) => (c ? { ...c, phone: event.target.value } : c))} />
            </label>
            <label>
              <span>Nascimento</span>
              <input disabled={!editMode} value={draft.birthDate} onChange={(event) => setDraft((c) => (c ? { ...c, birthDate: event.target.value } : c))} />
            </label>
            <label>
              <span>CPF</span>
              <input disabled={!editMode} value={draft.cpf} onChange={(event) => setDraft((c) => (c ? { ...c, cpf: event.target.value } : c))} />
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
              <input disabled value={selectedUser.emailVerified ? "sim" : "nao"} />
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
                      onClick={() => {
                        if (!window.confirm(`Excluir usuario ${selectedUser.email}?`)) return;
                        runAction("Usuario excluido.", async () => {
                          await deleteUserAdmin(selectedUser.id, csrfToken);
                          setSelectedUser(null);
                        });
                      }}
                    >
                      Excluir usuario
                    </button>
                  </div>
                </section>
              </aside>
            </div>
            ,
            document.body
          )
        : null}
    </div>
  );
}
