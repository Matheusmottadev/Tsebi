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
      adminProfile?: Record<string, unknown> | null;
      rawBody?: Buffer;
    }
  }
}

export {};
