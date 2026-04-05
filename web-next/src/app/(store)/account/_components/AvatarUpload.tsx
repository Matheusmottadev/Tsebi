"use client";

import { useRef, useState, useTransition, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import styles from "../account.module.css";

interface Props {
  currentAvatarUrl?: string | null;
  initials: string;
}

const CROP_SIZE = 260; // px do círculo na modal

export function AvatarUpload({ currentAvatarUrl, initials }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function openPicker() {
    // Limpa o value para permitir selecionar o mesmo arquivo novamente
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSrc(null);

    // Mostra preview local imediatamente enquanto faz upload
    const objectUrl = URL.createObjectURL(blob);
    setPreview(objectUrl);

    const formData = new FormData();
    formData.append("avatar", blob, "avatar.jpg");

    try {
      // Lê o token CSRF do cookie (necessário para mutations no browser)
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("tsebi.csrf="))
        ?.split("=")?.[1] ?? "";

      const res = await fetch("/api/my/avatar", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
      });
      if (!res.ok) throw new Error("Upload falhou");

      const json = await res.json();
      const cloudinaryUrl: string = json.avatarUrl;

      // Pré-carrega a imagem do Cloudinary antes de trocar o preview
      // Evita piscar: só troca quando a imagem já está em cache no browser
      await new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = cloudinaryUrl;
      });

      URL.revokeObjectURL(objectUrl);
      setPreview(cloudinaryUrl); // troca para URL definitiva (já em cache)

      // Atualiza o servidor em background — preview já está estável
      startTransition(() => router.refresh());
    } catch {
      setPreview(null);
    }
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  const displaySrc = preview ?? currentAvatarUrl;

  return (
    <>
      <div
        className={styles.avatarWrapper}
        onClick={openPicker}
        title="Alterar foto de perfil"
      >
        {displaySrc ? (
          <img src={displaySrc} alt="Avatar" className={styles.avatarPhoto} />
        ) : (
          <div className={styles.avatar}>{initials}</div>
        )}

        <div className={styles.avatarCameraIcon}>
          {isPending ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>

      {cropSrc && typeof document !== "undefined" && createPortal(
        <CropModal
          src={cropSrc}
          cropSize={CROP_SIZE}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />,
        document.body
      )}
    </>
  );
}

// ─── CropModal ────────────────────────────────────────────────────────────────

interface CropModalProps {
  src: string;
  cropSize: number;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}

function CropModal({ src, cropSize, onConfirm, onCancel }: CropModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);

  // Estado dos gestos — refs para evitar re-render desnecessário
  const drag = useRef({ active: false, startX: 0, startY: 0, startOX: 0, startOY: 0 });
  const pinch = useRef({ active: false, startDist: 0, startScale: 1 });

  // Carrega a imagem e define o scale inicial para preencher o círculo
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImgSize({ w, h });
      imgRef.current = img;

      // Scale inicial: a menor dimensão da imagem cobre o cropSize
      const container = containerRef.current;
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const minSide = Math.min(w, h);
      const initialScale = cropSize / minSide;
      setScale(initialScale);
      setOffset({ x: 0, y: 0 });
    };
    img.src = src;
  }, [src, cropSize]);

  // ── Drag (mouse) ─────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, startOX: offset.x, startOY: offset.y };
  }, [offset]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current.active) return;
    setOffset({
      x: drag.current.startOX + e.clientX - drag.current.startX,
      y: drag.current.startOY + e.clientY - drag.current.startY,
    });
  }, []);

  const onMouseUp = useCallback(() => { drag.current.active = false; }, []);

  // ── Drag (touch) ─────────────────────────────────────────────────────────
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      drag.current = {
        active: true,
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startOX: offset.x,
        startOY: offset.y,
      };
    } else if (e.touches.length === 2) {
      drag.current.active = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch.current = { active: true, startDist: Math.hypot(dx, dy), startScale: scale };
    }
  }, [offset, scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && drag.current.active) {
      setOffset({
        x: drag.current.startOX + e.touches[0].clientX - drag.current.startX,
        y: drag.current.startOY + e.touches[0].clientY - drag.current.startY,
      });
    } else if (e.touches.length === 2 && pinch.current.active) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.3, pinch.current.startScale * (dist / pinch.current.startDist));
      setScale(newScale);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    drag.current.active = false;
    pinch.current.active = false;
  }, []);

  // ── Zoom com scroll ──────────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale(s => Math.max(0.3, s * (e.deltaY < 0 ? 1.08 : 0.93)));
  }, []);

  // ── Confirmar: renderiza no canvas e exporta ─────────────────────────────
  function handleConfirm() {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;

    // Dimensões da imagem renderizada na tela
    const renderedW = imgSize.w * scale;
    const renderedH = imgSize.h * scale;

    // Posição top-left da imagem na tela (centralizada + offset)
    const imgX = cw / 2 - renderedW / 2 + offset.x;
    const imgY = ch / 2 - renderedH / 2 + offset.y;

    // Posição top-left do círculo de crop na tela
    const cropX = cw / 2 - cropSize / 2;
    const cropY = ch / 2 - cropSize / 2;

    // Região da imagem que corresponde ao círculo (em pixels da imagem original)
    const srcX = (cropX - imgX) / scale;
    const srcY = (cropY - imgY) / scale;
    const srcW = cropSize / scale;
    const srcH = cropSize / scale;

    // Renderiza num canvas de 400×400
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;

    // Clip circular
    ctx.beginPath();
    ctx.arc(200, 200, 200, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      Math.max(0, srcX), Math.max(0, srcY),
      Math.min(srcW, imgSize.w - Math.max(0, srcX)),
      Math.min(srcH, imgSize.h - Math.max(0, srcY)),
      0, 0, 400, 400
    );

    canvas.toBlob(blob => {
      if (blob) onConfirm(blob);
    }, "image/jpeg", 0.88);
  }

  return (
    <div className={styles.cropOverlay}>
      {/* Área da imagem */}
      <div
        ref={containerRef}
        className={styles.cropContainer}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
        style={{ cursor: "grab", userSelect: "none" }}
      >
        {/* Imagem */}
        {imgSize.w > 0 && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              width: imgSize.w * scale,
              height: imgSize.h * scale,
              left: `calc(50% - ${(imgSize.w * scale) / 2 - offset.x}px)`,
              top: `calc(50% - ${(imgSize.h * scale) / 2 - offset.y}px)`,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        )}

        {/* Overlay escuro com buraco circular via clip-path */}
        <div className={styles.cropDimmer} style={{ "--crop-size": `${cropSize}px` } as React.CSSProperties} />

        {/* Borda do círculo */}
        <div
          className={styles.cropCircleBorder}
          style={{ width: cropSize, height: cropSize }}
        />

        {/* Dica */}
        <p className={styles.cropHint}>Arraste para reposicionar · Scroll para zoom</p>
      </div>

      {/* Botões */}
      <div className={styles.cropActions}>
        <button className={styles.cropCancel} onClick={onCancel}>Cancelar</button>
        <button className={styles.cropConfirm} onClick={handleConfirm}>Confirmar</button>
      </div>
    </div>
  );
}
