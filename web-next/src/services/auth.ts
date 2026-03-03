import { del, get, post, put } from "@/lib/http";
import type { HttpRequestOptions } from "@/lib/http";
import type { AddressBook, PublicUser, UserTitle } from "@/types";

/*
Endpoint mapping used in this file:
- GET /api/auth/me
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/register
- POST /api/auth/forgot-password
- POST /api/auth/forgot-password/verify-code
- POST /api/auth/email/start
- POST /api/auth/email/verify
- POST /api/auth/email/verify-account
- POST /api/auth/email/resend-account-code
- POST /api/auth/login/verify-code
- GET /api/my/addresses
- GET /api/my/checkout-prefill
- POST /api/my/addresses
- PUT /api/my/addresses/:addressId
- DELETE /api/my/addresses/:addressId
- POST /api/my/addresses/:addressId/default
- GET /api/my/favorites
- PUT /api/my/favorites
*/

export type AuthFlowStage =
  | "account_verification_required"
  | "login_code_required"
  | "password_reset_required"
  | "authenticated"
  | string;

export interface AuthMeResponse {
  authenticated: boolean;
  user: PublicUser | null;
}

export interface CheckoutPrefillResponse {
  phone: string;
  cpf: string;
  fullName: string;
  sources?: {
    phone?: string;
    cpf?: string;
    fullName?: string;
  };
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  title?: Exclude<UserTitle, "">;
  name: string;
  email: string;
  password: string;
  birthDate: string;
  cpf: string;
  cep: string;
}

export interface EmailPayload {
  email: string;
}

export interface EmailCodePayload {
  email: string;
  code: string;
}

export interface PasswordResetCodePayload {
  email: string;
  code: string;
  password: string;
}

export interface AddressInput {
  label: string;
  fullName: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
}

export interface AuthUserResponse {
  ok: true;
  user: PublicUser;
  stage?: AuthFlowStage;
}

export interface AuthCodeChallengeResponse {
  ok: true;
  email: string;
  stage: AuthFlowStage;
  expiresAt: string | null;
  devCode?: string | null;
}

export interface BasicOkResponse {
  ok: true;
}

export interface GoogleAuthConfigResponse {
  ok: true;
  enabled: boolean;
  clientId: string;
}

export interface GoogleLoginPayload {
  idToken: string;
  nonce?: string;
}

export interface FavoritesResponse {
  favorites: string[];
}

export type LoginResponse = AuthUserResponse | AuthCodeChallengeResponse;
export type RegisterResponse = AuthCodeChallengeResponse;
export type EmailFlowResponse = AuthUserResponse | AuthCodeChallengeResponse;
export type ResendAccountCodeResponse = BasicOkResponse | AuthCodeChallengeResponse;

export interface ForgotPasswordResponse extends BasicOkResponse {
  expiresAt?: string | null;
  devCode?: string | null;
}

/**
 * GET /api/auth/me
 * Auth: optional (returns unauthenticated state when session is absent).
 */
export async function getMe(options?: HttpRequestOptions): Promise<PublicUser | null> {
  const response = await get<AuthMeResponse>("/api/auth/me", { cache: "no-store", ...options });
  if (!response.authenticated) return null;
  return response.user;
}

/**
 * POST /api/auth/login
 * Auth: public (creates session when flow reaches authenticated stage).
 */
export async function login(payload: LoginPayload): Promise<LoginResponse>;
export async function login(email: string, password: string): Promise<LoginResponse>;
export async function login(payloadOrEmail: LoginPayload | string, password?: string): Promise<LoginResponse> {
  const payload: LoginPayload =
    typeof payloadOrEmail === "string"
      ? { email: payloadOrEmail, password: String(password || "") }
      : payloadOrEmail;
  return post<LoginResponse>("/api/auth/login", payload);
}

/**
 * POST /api/auth/logout
 * Auth: optional (safe even without active session).
 */
export async function logout(): Promise<BasicOkResponse> {
  return post<BasicOkResponse>("/api/auth/logout", {});
}

/**
 * POST /api/auth/register
 * Auth: public.
 */
export async function register(payload: RegisterPayload): Promise<RegisterResponse> {
  return post<RegisterResponse>("/api/auth/register", payload);
}

/**
 * POST /api/auth/forgot-password
 * Auth: public.
 */
export async function requestPasswordReset(payload: EmailPayload): Promise<ForgotPasswordResponse> {
  return post<ForgotPasswordResponse>("/api/auth/forgot-password", payload);
}

/**
 * POST /api/auth/forgot-password/verify-code
 * Auth: public.
 */
export async function resetPassword(payload: PasswordResetCodePayload): Promise<BasicOkResponse> {
  return post<BasicOkResponse>("/api/auth/forgot-password/verify-code", payload);
}

/**
 * POST /api/auth/email/start
 * Auth: public.
 */
export async function startEmailVerification(payload: EmailPayload): Promise<AuthCodeChallengeResponse> {
  return post<AuthCodeChallengeResponse>("/api/auth/email/start", payload);
}

/**
 * POST /api/auth/email/verify
 * Auth: public (creates session on success).
 */
export async function verifyEmailCode(payload: EmailCodePayload): Promise<EmailFlowResponse> {
  return post<EmailFlowResponse>("/api/auth/email/verify", payload);
}

/**
 * POST /api/auth/email/verify-account
 * Auth: public (creates session on success).
 */
export async function verifyAccountCode(payload: EmailCodePayload): Promise<AuthUserResponse> {
  return post<AuthUserResponse>("/api/auth/email/verify-account", payload);
}

/**
 * POST /api/auth/login/verify-code
 * Auth: public (creates session on success).
 */
export async function verifyLoginCode(payload: EmailCodePayload): Promise<AuthUserResponse>;
export async function verifyLoginCode(email: string, code: string): Promise<AuthUserResponse>;
export async function verifyLoginCode(payloadOrEmail: EmailCodePayload | string, code?: string): Promise<AuthUserResponse> {
  const payload: EmailCodePayload =
    typeof payloadOrEmail === "string" ? { email: payloadOrEmail, code: String(code || "") } : payloadOrEmail;
  return post<AuthUserResponse>("/api/auth/login/verify-code", payload);
}

/**
 * POST /api/auth/login/resend-code
 * Auth: public.
 *
 * Optional endpoint: some deployments may not expose it yet.
 */
export async function resendLoginCode(payload: EmailPayload): Promise<AuthCodeChallengeResponse> {
  return post<AuthCodeChallengeResponse>("/api/auth/login/resend-code", payload);
}

/**
 * POST /api/auth/email/resend-account-code
 * Auth: public.
 */
export async function resendAccountVerificationCode(payload: EmailPayload): Promise<ResendAccountCodeResponse> {
  return post<ResendAccountCodeResponse>("/api/auth/email/resend-account-code", payload);
}

/**
 * GET /api/auth/google/config
 * Auth: public.
 */
export async function getGoogleAuthConfig(): Promise<GoogleAuthConfigResponse> {
  return get<GoogleAuthConfigResponse>("/api/auth/google/config");
}

/**
 * POST /api/auth/google
 * Auth: public (creates session on success).
 */
export async function loginWithGoogle(payload: GoogleLoginPayload): Promise<AuthUserResponse> {
  return post<AuthUserResponse>("/api/auth/google", payload);
}

/**
 * GET /api/my/addresses
 * Auth: required.
 */
export async function listAddresses(): Promise<AddressBook> {
  return get<AddressBook>("/api/my/addresses");
}

/**
 * GET /api/my/checkout-prefill
 * Auth: required.
 */
export async function getCheckoutPrefill(options?: HttpRequestOptions): Promise<CheckoutPrefillResponse> {
  return get<CheckoutPrefillResponse>("/api/my/checkout-prefill", { cache: "no-store", ...options });
}

/**
 * POST /api/my/addresses
 * Auth: required.
 */
export async function addAddress(payload: AddressInput): Promise<AddressBook> {
  return post<AddressBook>("/api/my/addresses", payload);
}

/**
 * PUT /api/my/addresses/:addressId
 * Auth: required.
 */
export async function updateAddress(addressId: string, payload: AddressInput): Promise<AddressBook> {
  return put<AddressBook>(`/api/my/addresses/${encodeURIComponent(addressId)}`, payload);
}

/**
 * DELETE /api/my/addresses/:addressId
 * Auth: required.
 */
export async function deleteAddress(addressId: string): Promise<AddressBook> {
  return del<AddressBook>(`/api/my/addresses/${encodeURIComponent(addressId)}`);
}

/**
 * POST /api/my/addresses/:addressId/default
 * Auth: required.
 */
export async function setDefaultAddress(addressId: string): Promise<AddressBook> {
  return post<AddressBook>(`/api/my/addresses/${encodeURIComponent(addressId)}/default`, {});
}

/**
 * GET /api/my/favorites
 * Auth: required.
 */
export async function getFavorites(options?: HttpRequestOptions): Promise<FavoritesResponse> {
  return get<FavoritesResponse>("/api/my/favorites", options);
}

/**
 * PUT /api/my/favorites
 * Auth: required.
 */
export async function updateFavorites(favorites: string[], options?: HttpRequestOptions): Promise<FavoritesResponse> {
  return put<FavoritesResponse>("/api/my/favorites", { favorites }, options);
}
