import type { PublicUser } from "./user";

export type AdminTheme = "system" | "light" | "dark";
export type AdminAccent = "emerald" | "blue" | "violet" | "amber" | "rose" | "slate";
export type AdminRole = "owner" | "manager" | "editor" | "viewer";

export interface AdminProfile {
  id: string;
  userId: string | null;
  email: string;
  nickname: string;
  avatarUrl: string;
  theme: AdminTheme;
  accent: AdminAccent;
  role: AdminRole;
  createdAt: string | null;
  updatedAt: string | null;
}

export type AdminUser = PublicUser;

export interface AdminMeResponse {
  admin: AdminUser;
  profile: AdminProfile | null;
}
