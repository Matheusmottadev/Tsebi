import { get, post, HttpError } from "@/lib/http";
import type { RepairPhoto, RepairRequest } from "@/types";

const userCsrfCookieName =
  String(process.env.NEXT_PUBLIC_USER_CSRF_COOKIE_NAME || "tsebi.csrf").trim() || "tsebi.csrf";

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

function resolveUploadErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return "Não foi possível enviar as fotos agora. Tente novamente.";
  const code =
    error.payload && typeof error.payload === "object" && "error" in error.payload
      ? String((error.payload as { error?: unknown }).error || "").trim().toUpperCase()
      : "";

  if (code === "UNSUPPORTED_IMAGE_TYPE") return "Formato de imagem não suportado. Use JPG, PNG, WEBP ou GIF.";
  if (code === "IMAGE_REQUIRED") return "Selecione uma imagem válida para enviar.";
  if (code === "entity.too.large" || error.status === 413) return "A imagem é muito grande. Use arquivos de até 8 MB.";
  if (code === "R2_NOT_CONFIGURED") return "O envio de fotos ainda não está disponível neste ambiente.";
  return "Não foi possível enviar as fotos agora. Tente novamente.";
}

function resolveRepairRequestErrorMessage(error: unknown): string {
  if (!(error instanceof HttpError)) return "Não foi possível enviar a solicitação. Tente novamente.";
  const code =
    error.payload && typeof error.payload === "object" && "error" in error.payload
      ? String((error.payload as { error?: unknown }).error || "").trim().toUpperCase()
      : "";

  if (code === "EMAIL_PROVIDER_NOT_CONFIGURED") {
    return "A solicitação foi bloqueada pelo envio de e-mail no ambiente atual.";
  }
  if (code === "INVALID_INPUT") return "Revise os dados da solicitação e tente novamente.";
  if (code === "ORDER_NOT_DELIVERED") return "Só é possível solicitar reparo para pedidos já entregues.";
  if (code === "ORDER_NOT_FOUND" || code === "ORDER_ITEM_NOT_FOUND") return "Não foi possível localizar a peça selecionada.";
  return "Não foi possível enviar a solicitação. Tente novamente.";
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
