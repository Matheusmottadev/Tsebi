/**
 * Cache com TTL em localStorage.
 * Garante que dados offline não fiquem obsoletos além do tempo definido.
 */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export function setCached<T>(
  key: string,
  value: T,
  ttlMs: number = 60 * 60 * 1000 // 1 hora por padrão
): void {
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage pode estar bloqueado (modo privado, storage cheio)
  }
}

export function getCached<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function clearCached(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // silencioso
  }
}
