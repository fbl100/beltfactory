export async function apiLogin(username: string, password: string): Promise<boolean> {
  const r = await fetch('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  return r.ok;
}
export async function apiMe(): Promise<string | null> {
  const r = await fetch('/api/me');
  return r.ok ? ((await r.json()).username as string) : null;
}
export async function apiLogout(): Promise<void> { await fetch('/api/logout', { method: 'POST' }); }
export async function apiGetState(): Promise<string | null> {
  const r = await fetch('/api/state');
  if (r.status === 204 || !r.ok) return null;
  return await r.text();
}
export async function apiSaveState(json: string): Promise<void> {
  await fetch('/api/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json });
}
