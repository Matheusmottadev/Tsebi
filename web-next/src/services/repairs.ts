import { get, post, HttpError } from "@/lib/http";
import type { RepairPhoto, RepairRequest } from "@/types";

const userCsrfCookieName =
  String(process.env.NEXT_PUBLIC_USER_CSRF_COOKIE_NAME || "tsebi.csrf").trim() || "tsebi.csrf";
const REPAIR_PHOTO_MAX_DIMENSION = 1600;
const REPAIR_PHOTO_TARGET_BYTES = Math.round(2.5 * 1024 * 1024);
const REPAIR_PHOTO_MIN_COMPRESS_BYTES = Math.round(1.2 * 1024 * 1024);

function readCookieByName(name: string): string {
  if (typeof document === "undefined") return "";
  const source = String(document.cookie || "");
  if (!source) return "";
  const prefix = `${name}=`;
  for (const chunk of source.split(";")) {
    const item = String(chunk || "").trim();
    if (!item.startsWith(prefix)) continue;
    return decodeURIComponent(item.slice(prefix.length));
  }
  return "";
}

export interface ListMyRepairsResponse {
  history: RepairRequest[];
}

export interface CreateRepairRequestPayload {
  orderId: string;
  orderItemId: string;
  repairType: string;
  description: string;
  returnAddress: string;
  photos: RepairPhoto[];
}

export interface CreateRepairRequestResponse {
  repair: RepairRequest;
  history: RepairRequest[];
}

export interface UploadRepairPhotoResponse {
  ok: true;
  photo: RepairPhoto & {
    contentType?: string;
  };
}

function resolveUploadContentType(file: File): string {
  const rawType = String(file.type || "").trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(rawType)) return rawType;
  if (rawType === "image/jpg" || rawType === "image/pjpeg") return "image/jpeg";

  const lowerName = String(file.name || "").trim().toLowerCase();
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".jfif")) return "image/jpeg";
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function replaceFileExtension(fileName: string, extension: string): string {
  const safeName = String(fileName || "").trim() || "reparo";
  const nextExtension = String(extension || "").trim().replace(/^\./, "");
  if (!nextExtension) return safeName;
  const lastDot = safeName.lastIndexOf(".");
  const baseName = lastDot > 0 ? safeName.slice(0, lastDot) : safeName;
  return `${baseName}.${nextExtension}`;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("IMAGE_LOAD_FAILED"));
    };
    image.src = objectUrl;
  });
}

function getResizedDimensions(width: number, height: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const longestSide = Math.max(width, height);
  if (longestSide <= REPAIR_PHOTO_MAX_DIMENSION) return { width, height };

  const scale = REPAIR_PHOTO_MAX_DIMENSION / longestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function createTransformedRepairPhoto(
  file: File,
  outputType: "image/webp" | "image/jpeg",
  quality: number
): Promise<File | null> {
  const image = await loadImageElement(file);
  const originalWidth = Number(image.naturalWidth || image.width || 0);
  const originalHeight = Number(image.naturalHeight || image.height || 0);
  if (!originalWidth || !originalHeight) return null;

  const { width, height } = getResizedDimensions(originalWidth, originalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return null;

  context.drawImage(image, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, outputType, quality);
  if (!blob || !blob.size) return null;

  const extension = outputType === "image/webp" ? "webp" : "jpg";
  return new File([blob], replaceFileExtension(file.name, extension), {
    type: outputType,
    lastModified: Date.now(),
  });
}

export async function prepareRepairPhotoForUpload(file: File): Promise<File> {
  const contentType = resolveUploadContentType(file);
  const isImage = contentType.startsWith("image/");
  if (typeof window === "undefined" || !isImage || contentType === "image/gif") return file;

  const shouldOptimize =
    file.size > REPAIR_PHOTO_MIN_COMPRESS_BYTES || file.size > REPAIR_PHOTO_TARGET_BYTES;
  if (!shouldOptimize) return file;

  const candidates: File[] = [];

  try {
    const webpVersion = await createTransformedRepairPhoto(file, "image/webp", 0.82);
    if (webpVersion) candidates.push(webpVersion);
  } catch {
    // Keep the original file if the browser cannot transform this image.
  }

  try {
    const jpegVersion = await createTransformedRepairPhoto(file, "image/jpeg", 0.84);
    if (jpegVersion) candidates.push(jpegVersion);
  } catch {
    // Keep the original file if the browser cannot transform this image.
  }

  const bestCandidate = candidates.sort((left, right) => left.size - right.size)[0] || null;
  if (!bestCandidate) return file;
  if (bestCandidate.size >= file.size && file.size <= REPAIR_PHOTO_TARGET_BYTES) return file;
  return bestCandidate;
}

function resolveUploadErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return "Nao foi possivel enviar as fotos agora. Tente novamente.";
  const code =
    error.payload && typeof error.payload === "object" && "error" in error.payload
      ? String((error.payload as { error?: unknown }).error || "").trim().toUpperCase()
      : "";

  if (code === "UNSUPPORTED_IMAGE_TYPE") return "Formato de imagem nao suportado. Use JPG, PNG, WEBP ou GIF.";
  if (code === "IMAGE_REQUIRED") return "Selecione uma imagem valida para enviar.";
  if (code === "ENTITY.TOO.LARGE" || error.status === 413) return "A imagem e muito grande. Use arquivos de ate 8 MB.";
  if (code === "R2_NOT_CONFIGURED") return "O envio de fotos ainda nao esta disponivel neste ambiente.";
  return "Nao foi possivel enviar as fotos agora. Tente novamente.";
}

function resolveRepairRequestErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return "Nao foi possivel enviar a solicitacao. Tente novamente.";
  const code =
    error.payload && typeof error.payload === "object" && "error" in error.payload
      ? String((error.payload as { error?: unknown }).error || "").trim().toUpperCase()
      : "";
  const details =
    error.payload && typeof error.payload === "object" && "details" in error.payload
      ? (error.payload as { details?: unknown }).details
      : null;

  if (Array.isArray(details)) {
    const hasDescriptionIssue = details.some((item) => {
      if (!item || typeof item !== "object") return false;
      return String((item as { path?: unknown }).path || "").trim() === "description";
    });
    if (hasDescriptionIssue) return "Descreva o problema com pelo menos 4 caracteres.";

    const hasReturnAddressIssue = details.some((item) => {
      if (!item || typeof item !== "object") return false;
      return String((item as { path?: unknown }).path || "").trim() === "returnAddress";
    });
    if (hasReturnAddressIssue) return "Informe um endereco de devolucao mais completo.";
  }

  if (code === "EMAIL_PROVIDER_NOT_CONFIGURED") {
    return "A solicitacao foi bloqueada pelo envio de e-mail no ambiente atual.";
  }
  if (code === "INVALID_INPUT") return "Revise os dados da solicitacao e tente novamente.";
  if (code === "ORDER_NOT_DELIVERED") return "So e possivel solicitar reparo para pedidos ja entregues.";
  if (code === "ORDER_NOT_FOUND" || code === "ORDER_ITEM_NOT_FOUND") return "Nao foi possivel localizar a peca selecionada.";
  return "Nao foi possivel enviar a solicitacao. Tente novamente.";
}

export async function listMyRepairs(): Promise<RepairRequest[]> {
  const response = await get<ListMyRepairsResponse>("/api/my/repairs", { cache: "no-store" });
  return Array.isArray(response.history) ? response.history : [];
}

export async function createRepairRequest(
  payload: CreateRepairRequestPayload
): Promise<CreateRepairRequestResponse> {
  return post<CreateRepairRequestResponse>("/api/my/repairs", payload);
}

export async function uploadRepairPhoto(file: File): Promise<RepairPhoto> {
  const token = readCookieByName(userCsrfCookieName);
  const contentType = resolveUploadContentType(file);
  const response = await fetch(
    `/api/my/repairs/photos?name=${encodeURIComponent(String(file.name || "reparo"))}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": contentType,
        ...(token ? { "x-csrf-token": token } : {}),
      },
      body: file,
    }
  );

  let payload: UploadRepairPhotoResponse | { error?: string } | null = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorPayload = payload && "error" in payload ? payload : null;
    const message =
      errorPayload && typeof errorPayload.error === "string"
        ? errorPayload.error
        : `Request failed with status ${response.status}`;
    throw new HttpError(message, response.status, "/api/my/repairs/photos", payload);
  }

  const successPayload = payload as UploadRepairPhotoResponse | null;
  return {
    url: String(successPayload?.photo?.url || "").trim(),
    fileName: String(successPayload?.photo?.fileName || file.name || "").trim(),
  };
}

export { resolveRepairRequestErrorMessage, resolveUploadErrorMessage };
