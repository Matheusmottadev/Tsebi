import "express-session";

export type AdminAuthSession = {
  userId: string;
  email?: string;
  mfaVerified?: boolean;
  pendingMfaSecretEnc?: string | null;
  lastActiveAt?: number;
  csrfToken?: string | null;
};

export type PasskeyRegistrationSession = {
  userId: string;
  challenge: string;
  createdAt?: number;
};

export type PasskeyAuthenticationSession = {
  challenge: string;
  userId?: string;
  email?: string;
  createdAt?: number;
};

export type PublicUserLike = {
  id: string;
  email?: string;
  name?: string;
  [key: string]: unknown;
};

export type AdminRequestAccess = {
  id: string;
  email: string;
  role: "admin" | "director" | "superadmin";
  isActive: boolean;
  permissions: Array<"balance" | "orders" | "users" | "products">;
  createdAt?: string | null;
  updatedAt?: string | null;
};

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuth?: AdminAuthSession;
    passkeyRegistration?: PasskeyRegistrationSession;
    passkeyAuthentication?: PasskeyAuthenticationSession;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: PublicUserLike;
      adminUser?: PublicUserLike;
      adminSession?: AdminAuthSession;
      admin?: AdminRequestAccess;
      adminProfile?: Record<string, unknown> | null;
      rawBody?: Buffer;
      requestId?: string;
    }
  }
}

export {};
