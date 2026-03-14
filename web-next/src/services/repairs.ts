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
  const response = await fetch(
    `/api/my/repairs/photos?name=${encodeURIComponent(String(file.name || "reparo"))}`,
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
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
