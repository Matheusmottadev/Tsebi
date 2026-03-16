"use client";

const TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function getBrowserCrypto(): Crypto | null {
  const candidate = globalThis.crypto;
  if (!candidate || typeof candidate.getRandomValues !== "function") {
    return null;
  }
  return candidate;
}

function createUuidFromBytes(bytes: Uint8Array): string {
  const next = new Uint8Array(bytes);
  next[6] = (next[6] & 0x0f) | 0x40;
  next[8] = (next[8] & 0x3f) | 0x80;

  const hex = Array.from(next, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createMathRandomUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function createClientUuid(): string {
  const browserCrypto = getBrowserCrypto();
  if (browserCrypto && typeof browserCrypto.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }

  if (browserCrypto) {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return createUuidFromBytes(bytes);
  }

  return createMathRandomUuid();
}

export function createClientToken(size = 24): string {
  const safeSize = Math.max(1, Math.floor(Number(size || 0)));
  const browserCrypto = getBrowserCrypto();

  if (browserCrypto) {
    const values = new Uint8Array(safeSize);
    browserCrypto.getRandomValues(values);
    let token = "";
    for (let index = 0; index < values.length; index += 1) {
      token += TOKEN_ALPHABET[values[index] % TOKEN_ALPHABET.length];
    }
    return token;
  }

  let token = "";
  for (let index = 0; index < safeSize; index += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return token;
}
