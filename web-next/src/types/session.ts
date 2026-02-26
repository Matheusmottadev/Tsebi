import type { PublicUser } from "./user";

export interface StudioAdminAuthSession {
  userId: string;
  email: string;
  mfaVerified: boolean;
  pendingMfaSecretEnc: string | null;
  lastActiveAt: number;
  csrfToken: string | null;
}

export interface PasskeyRegistrationSession {
  userId: string;
  challenge: string;
  createdAt: number;
}

export interface PasskeyAuthenticationSession {
  userId: string;
  email: string;
  challenge: string;
  createdAt: number;
}

export interface SessionData {
  userId?: string;
  adminAuth?: StudioAdminAuthSession;
  passkeyRegistration?: PasskeyRegistrationSession;
  passkeyAuthentication?: PasskeyAuthenticationSession;
  // TODO confirm if any additional session keys are persisted by middlewares.
  [key: string]: unknown;
}

export type SessionUser = PublicUser;

export interface AuthSessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
}
