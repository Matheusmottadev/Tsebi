"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";

interface Props {
  currentAvatarUrl?: string | null;
  initials: string;
}

export function AvatarUpload({ currentAvatarUrl, initials }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleFile(file: File) {
    // Mostra preview imediato
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);

    const formData = new FormData();
    formData.append("avatar", file);

    try {
      const res = await fetch("/api/my/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload falhou");

      // Atualiza a página para refletir a nova URL do banco
      startTransition(() => router.refresh());
    } catch {
      setPreview(null);
    }
  }

  const displaySrc = preview ?? currentAvatarUrl;

  return (
    <div
      className={styles.avatarWrapper}
      onClick={() => inputRef.current?.click()}
      title="Alterar foto de perfil"
    >
      {displaySrc ? (
        <img
          src={displaySrc}
          alt="Avatar"
          className={styles.avatarPhoto}
        />
      ) : (
        <div className={styles.avatar}>{initials}</div>
      )}

      <div className={styles.avatarCameraIcon}>
        {isPending ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
