import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerUser, verifyUser, loadUsers, findUser, credentialError } from './users';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bf-users-')); });

describe('users (self-service accounts)', () => {
  it('starts empty with no users.json', () => {
    expect(loadUsers(dir)).toEqual([]);
  });

  it('registers a user, persists it, and verifies the password (not the wrong one)', () => {
    const users = loadUsers(dir);
    const r = registerUser(dir, users, 'Abby', 'apples', 'easy');
    expect(r.ok).toBe(true);
    expect(existsSync(join(dir, 'users.json'))).toBe(true);
    // reloading from disk sees the new account with its chosen mode
    const reloaded = loadUsers(dir);
    expect(reloaded.map((u) => u.username)).toEqual(['Abby']);
    expect(findUser(reloaded, 'abby')?.mode).toBe('easy'); // case-insensitive lookup
    expect(verifyUser(reloaded, 'Abby', 'apples')).toBe(true);
    expect(verifyUser(reloaded, 'Abby', 'wrong')).toBe(false);
    expect(verifyUser(reloaded, 'ghost', 'apples')).toBe(false);
  });

  it('rejects a duplicate username case-insensitively (would collide on the save file)', () => {
    const users = loadUsers(dir);
    expect(registerUser(dir, users, 'dad', 'secret', 'normal').ok).toBe(true);
    const dup = registerUser(dir, users, 'DAD', 'other', 'normal');
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/taken/i);
    expect(loadUsers(dir).length).toBe(1); // not persisted twice
  });

  it('defaults an invalid/missing mode to normal', () => {
    const users = loadUsers(dir);
    registerUser(dir, users, 'kid', 'apples', 'banana' as unknown);
    expect(findUser(loadUsers(dir), 'kid')?.mode).toBe('normal');
  });

  it('validates usernames and passwords, and never persists a rejected registration', () => {
    expect(credentialError('a', 'apples')).toMatch(/username/i);        // too short
    expect(credentialError('has space', 'apples')).toMatch(/username/i); // illegal char
    expect(credentialError('kid', '123')).toMatch(/4 characters/i);      // password too short
    expect(credentialError('kid', 'x'.repeat(65))).toMatch(/64/);        // password too long
    expect(credentialError('kid_2', 'apples')).toBeNull();               // ok
    const users = loadUsers(dir);
    expect(registerUser(dir, users, 'a', 'apples', 'normal').ok).toBe(false);
    expect(loadUsers(dir)).toEqual([]);
  });
});
