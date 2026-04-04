import type { Address } from "./address";

export type UserTitle = "sr" | "sra" | "srta" | "nao_informar" | "";

export interface User {
  id: string;
  title: UserTitle;
  name: string;
  email: string;
  phone: string;
  isGuest: boolean;
  createdVia: string;
  loginDisabled: boolean;
  lastLoginAt: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  birthDate: string;
  cpf: string;
  cep: string;
  addresses: Address[];
  defaultAddressId: string;
  passwordHash: string | null;
  adminMfaEnabled: boolean;
  adminMfaSecretEnc: string;
  adminMfaRecoveryCodes: string[];
  adminMfaEnabledAt: string | null;
  adminMfaDisabledAt: string | null;
  passwordResetRequired: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface PublicUser {
  id: string;
  title: UserTitle;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  birthDate: string;
  cpf: string;
  cep: string;
  defaultAddressId: string;
  addresses: Address[];
  avatarUrl?: string | null;
}
