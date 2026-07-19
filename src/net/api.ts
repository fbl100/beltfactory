import type { Mode } from '../content/levels';

export interface Me { username: string; mode: Mode }

// All calls are resilient: a network failure resolves to a safe value instead of
// throwing, so a flaky/offline server never crashes the game loop or the login form.
export async function apiLogin(username: string, password: string): Promise<boolean> {
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Create a new account and sign in. Returns the server's validation error (e.g. "username taken") on failure.
export async function apiRegister(username: string, password: string, mode: Mode): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await fetch('/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, mode }),
    });
    if (r.ok) return { ok: true };
    const data = await r.json().catch(() => ({}));
    return { ok: false, error: (data.error as string) ?? 'Could not create account.' };
  } catch {
    return { ok: false, error: 'Network error — is the server running?' };
  }
}

export async function apiMe(): Promise<Me | null> {
  try {
    const r = await fetch('/api/me');
    if (!r.ok) return null;
    const d = await r.json();
    return { username: d.username as string, mode: d.mode === 'easy' ? 'easy' : 'normal' };
  } catch {
    return null;
  }
}
export async function apiLogout(): Promise<void> {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
}
export async function apiGetState(): Promise<string | null> {
  try {
    const r = await fetch('/api/state');
    if (r.status === 204 || !r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}
export async function apiSaveState(json: string): Promise<void> {
  try {
    await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json });
  } catch {
    /* autosave is best-effort; a failed save must not break the game loop */
  }
}
