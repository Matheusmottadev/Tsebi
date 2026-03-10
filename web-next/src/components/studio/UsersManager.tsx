"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement
  );
}

function pickErrorMessage(error: unknown): string {
  if (error instanceof HttpError) {
    const payload = error.payload;
    if (payload && typeof payload === "object" && "error" in payload) {
      const code = String((payload as { error?: unknown }).error || "").trim();
      if (code === "INVALID_INPUT") {
        return "Dados inválidos. Verifique senha (mín. 8 com letra e número), data, CPF e CEP.";
      }
      if (code) return code;
    }
    return error.message || "Falha na operação.";
  }
  if (error instanceof Error) return error.message || "Falha na operação.";
  return "Falha na operação.";
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

function isStrongPassword(value: string): boolean {
  const password = String(value || "");
  if (password.length < 8 || password.length > 128) return false;
  return /[A-Za-z]/.test(password) && /\d/.test(password);
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
  const drawerPanelRef = useRef<HTMLElement | null>(null);
  const deleteConfirmCardRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);
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

  useEffect(() => {
    if (!selectedUser) return;
    window.setTimeout(() => {
      const focusable = getFocusableElements(drawerPanelRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        drawerPanelRef.current?.focus();
      }
    }, 0);
  }, [selectedUser]);

  useEffect(() => {
    if (!deleteConfirmOpen) return;
    window.setTimeout(() => {
      const focusable = getFocusableElements(deleteConfirmCardRef.current);
      if (focusable.length > 0) {
        focusable[0].focus();
      } else {
        deleteConfirmCardRef.current?.focus();
      }
    }, 0);
  }, [deleteConfirmOpen]);

  useEffect(() => {
    if (!selectedUser) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (deleteConfirmOpen) {
          setDeleteConfirmOpen(false);
          return;
        }
        closeDrawer();
        return;
      }

      if (event.key !== "Tab") return;
      const container = deleteConfirmOpen ? deleteConfirmCardRef.current : drawerPanelRef.current;
      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        event.preventDefault();
        container?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteConfirmOpen, selectedUser]);

  function closeDrawer() {
    setDeleteConfirmOpen(false);
    setEditMode(false);
    setSelectedUser(null);
    const elementToRestore = lastFocusedElementRef.current;
    window.setTimeout(() => elementToRestore?.focus(), 0);
  }

  async function openUser(userId: string) {
    lastFocusedElementRef.current = document.activeElement as HTMLElement | null;
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
    const normalizedPhone = normalizePhoneDigits(createData.phone);
    const normalizedCpf = normalizeDigits(createData.cpf);
    const normalizedCep = normalizeDigits(createData.cep);
    const birthDateApi = toApiBirthDate(createData.birthDate);

    if (!isStrongPassword(createData.password)) {
      setError("Senha inválida: use no mínimo 8 caracteres com letra e número.");
      setMessage("");
      return;
    }
    if (createData.birthDate.trim() && !birthDateApi) {
      setError("Data de nascimento inválida. Use DD/MM/AAAA.");
      setMessage("");
      return;
    }
    if (normalizedCpf && normalizedCpf.length !== 11) {
      setError("CPF inválido.");
      setMessage("");
      return;
    }
    if (normalizedCep && normalizedCep.length !== 8) {
      setError("CEP inválido.");
      setMessage("");
      return;
    }
    if (normalizedPhone && normalizedPhone.length < 10) {
      setError("Telefone inválido.");
      setMessage("");
      return;
    }

    setLoadingId("create");
    setError("");
    setMessage("");
    try {
      await createUserAdmin(
        {
          title: createData.title,
          name: createData.name.trim(),
          email: createData.email.trim(),
          phone: normalizedPhone,
          password: createData.password,
          birthDate: birthDateApi,
          cpf: normalizedCpf,
          cep: normalizedCep,
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
      setMessage("Usuário criado com sucesso.");
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
      setMessage("Nenhuma alteração para salvar.");
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
      setMessage(`Usuário ${updated.email} atualizado.`);
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
            <option value="nao_informar">Não informar</option>
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
          <input
            value={createData.password}
            onChange={(event) => setCreateData((c) => ({ ...c, password: event.target.value }))}
            placeholder="Senha"
            type="password"
            minLength={8}
            maxLength={128}
          />
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
          disabled={!createData.name.trim() || !createData.email.trim() || !isStrongPassword(createData.password) || loadingId === "create"}
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
              <th>Usuário</th>
              <th>Email</th>
              <th>Status</th>
              <th>Último login</th>
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
                onClick={closeDrawer}
              />
              <aside ref={drawerPanelRef} className={styles.drawerPanel} role="dialog" aria-modal="true" aria-labelledby="userDrawerTitle" tabIndex={-1}>
                <div className={styles.detailHeader}>
                  <div>
                    <h3 id="userDrawerTitle">Cliente: {selectedUser.name || selectedUser.email}</h3>
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
                      onClick={closeDrawer}
                    >
                      Fechar
                    </button>
                  </div>
                </div>

                <section className={styles.block}>
                  <h4>Cadastro</h4>
                  <div className={styles.detailGrid}>
            <label>
              <span>Título</span>
              <select
                disabled={!editMode}
                value={draft.title}
                onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value as UserDraft["title"] } : current))}
              >
                <option value="nao_informar">Não informar</option>
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
              <span>Último login</span>
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
                  <h4>Ações</h4>
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

