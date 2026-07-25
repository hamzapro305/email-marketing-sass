// A "session" scopes a user's uploaded files and staged leads. There's no auth
// in this demo, so we generate an opaque id once and persist it locally; every
// API call sends it as the `x-session-id` header.

const STORAGE_KEY = 'ems.sessionId';

function generateId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

let cached: string | null = null;

/** Return the persistent session id, creating one on first use. */
export function getSessionId(): string {
  if (cached) return cached;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const fresh = generateId();
    localStorage.setItem(STORAGE_KEY, fresh);
    cached = fresh;
    return fresh;
  } catch {
    // localStorage unavailable (rare) — fall back to an in-memory id.
    cached = cached ?? generateId();
    return cached;
  }
}
