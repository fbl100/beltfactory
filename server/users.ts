import bcrypt from 'bcryptjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Self-service accounts (no seeded users): people create their own username + password, and their
// hashed record is persisted to <DATA_DIR>/users.json. Passwords are bcrypt-hashed; the plaintext is
// never stored. `mode` is the difficulty they picked at sign-up — it seeds their FIRST game (the save
// is authoritative thereafter). This is a self-hosted household app; registration is open, so the
// server must not be exposed beyond the home network.
export type UserMode = 'easy' | 'normal';
export interface User { username: string; hash: string; mode: UserMode }

function usersFile(dataDir: string): string { return join(dataDir, 'users.json'); }

export function loadUsers(dataDir: string): User[] {
  const f = usersFile(dataDir);
  if (!existsSync(f)) return [];
  try {
    const arr = JSON.parse(readFileSync(f, 'utf8'));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((u) => u && typeof u.username === 'string' && typeof u.hash === 'string')
      .map((u) => ({ username: u.username, hash: u.hash, mode: u.mode === 'easy' ? 'easy' : 'normal' }));
  } catch {
    return []; // a corrupt users.json shouldn't crash the server; treat as no users
  }
}

function persist(dataDir: string, users: User[]): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  writeFileSync(usersFile(dataDir), JSON.stringify(users, null, 2), 'utf8');
}

// Case-insensitive lookup: usernames map to save filenames (storage.safe lowercases them), so two
// accounts differing only in case would share one save — we forbid that at registration.
export function findUser(users: User[], username: string): User | undefined {
  const u = username.trim().toLowerCase();
  return users.find((x) => x.username.toLowerCase() === u);
}

export function verifyUser(users: User[], username: string, password: string): boolean {
  const u = findUser(users, username);
  return u ? bcrypt.compareSync(password, u.hash) : false;
}

// Usernames stay within the save-filename alphabet ([a-z0-9_-], case-insensitive); passwords are 4–64
// chars (bcrypt silently truncates past 72 bytes, so we cap well below that).
export const USERNAME_RE = /^[A-Za-z0-9_-]{2,20}$/;
export function credentialError(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) return 'Username must be 2–20 letters, numbers, - or _.';
  if (typeof password !== 'string' || password.length < 4) return 'Password must be at least 4 characters.';
  if (password.length > 64) return 'Password must be 64 characters or fewer.';
  return null;
}

export type RegisterResult = { ok: true; user: User } | { ok: false; error: string };

// Create a new account (validating, enforcing uniqueness), persist it, and return the stored user.
// Mutates `users` in place so the caller's in-memory list stays current without re-reading disk.
export function registerUser(dataDir: string, users: User[], username: unknown, password: unknown, mode: unknown): RegisterResult {
  const err = credentialError(username, password);
  if (err) return { ok: false, error: err };
  const name = (username as string).trim();
  if (findUser(users, name)) return { ok: false, error: 'That username is already taken.' };
  const user: User = { username: name, hash: bcrypt.hashSync(password as string, 10), mode: mode === 'easy' ? 'easy' : 'normal' };
  users.push(user);
  persist(dataDir, users);
  return { ok: true, user };
}
