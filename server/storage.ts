import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function safe(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
// null when the name sanitizes to nothing — never fall back to a shared/empty filename.
function file(dataDir: string, username: string): string | null {
  const s = safe(username);
  return s ? join(dataDir, `${s}.json`) : null;
}

export function saveState(dataDir: string, username: string, json: string): void {
  const f = file(dataDir, username);
  if (!f) return;
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(f, json, 'utf8');
}

export function loadState(dataDir: string, username: string): string | null {
  const f = file(dataDir, username);
  return f && existsSync(f) ? readFileSync(f, 'utf8') : null;
}
