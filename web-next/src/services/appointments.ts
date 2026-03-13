import { get, post } from "@/lib/http";
import type { HttpRequestOptions } from "@/lib/http";

const userCsrfCookieName = String(process.env.NEXT_PUBLIC_USER_CSRF_COOKIE_NAME || "tsebi.csrf").trim() || "tsebi.csrf";

export interface AppointmentBooking {
  id: string;
  slotId: string;
  userId: string;
  userName: string;
  userEmail: string;
  status: "scheduled" | "completed" | "canceled";
  serviceType: string;
  modality: string;
  notes: string;
  adminNote: string;
  createdAt: string | null;
  updatedAt: string | null;
  startsAt: string | null;
  endsAt: string | null;
  date: string;
  time: string;
  label: string;
  location: string;
}

export interface AppointmentSlot {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  date: string;
  time: string;
  label: string;
  modality: string;
  location: string;
  adminNote: string;
  isAvailable: boolean;
  isBlocked: boolean;
  capacity: number;
  bookedCount: number;
  remainingCount: number;
  status: "available" | "unavailable" | "blocked" | "filled" | "booked";
  createdByAdminId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  appointments: AppointmentBooking[];
}

interface ListAvailableAppointmentSlotsResponse {
  slots: AppointmentSlot[];
}

interface ListMyAppointmentsResponse {
  appointments: AppointmentBooking[];
}

interface CreateAppointmentPayload {
  slotId: string;
  serviceType: string;
  modality?: string;
  notes?: string;
}

interface CreateAppointmentResponse {
  appointment: AppointmentBooking;
}

function readCookieByName(name: string): string {
  if (typeof document === "undefined") return "";
  const source = String(document.cookie || "");
  if (!source) return "";
  const prefix = `${name}=`;
  for (const part of source.split(";")) {
    const item = String(part || "").trim();
    if (!item.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(item.slice(prefix.length));
    } catch {
      return item.slice(prefix.length);
    }
  }
  return "";
}

export async function listAvailableAppointmentSlots(date: string, options?: HttpRequestOptions): Promise<AppointmentSlot[]> {
  const query = `?date=${encodeURIComponent(String(date || "").trim())}`;
  const response = await get<ListAvailableAppointmentSlotsResponse>(`/api/appointments/slots${query}`, {
    cache: "no-store",
    ...options,
  });
  return Array.isArray(response.slots) ? response.slots : [];
}

export async function listMyAppointments(options?: HttpRequestOptions): Promise<AppointmentBooking[]> {
  const response = await get<ListMyAppointmentsResponse>("/api/my/appointments", { cache: "no-store", ...options });
  return Array.isArray(response.appointments) ? response.appointments : [];
}

export async function createAppointment(payload: CreateAppointmentPayload, options?: HttpRequestOptions): Promise<AppointmentBooking> {
  const csrfToken = readCookieByName(userCsrfCookieName);
  const response = await post<CreateAppointmentResponse>("/api/appointments", payload, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  return response.appointment;
}
