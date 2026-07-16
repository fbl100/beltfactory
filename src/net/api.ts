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
export async function apiMe(): Promise<string | null> {
  try {
    const r = await fetch('/api/me');
    return r.ok ? ((await r.json()).username as string) : null;
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
