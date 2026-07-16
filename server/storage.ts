import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function safe(username: string): string {
  return username.toLowerCase().replace(/[^a-z0-9_-]/g, '');
}
function file(dataDir: string, username: string): string {
  return join(dataDir, `${safe(username)}.json`);
}

export function saveState(dataDir: string, username: string, json: string): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(file(dataDir, username), json, 'utf8');
}

export function loadState(dataDir: string, username: string): string | null {
  const f = file(dataDir, username);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}
