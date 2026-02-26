declare global {
  interface Error {
    code?: string;
    status?: number;
    payload?: unknown;
    details?: unknown;
    originalError?: unknown;
  }
}

export {};
