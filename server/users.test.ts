import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyUser, loadUsers, User } from './users';

describe('users', () => {
  it('verifies a correct password against a hash', () => {
    const users: User[] = [{ username: 'kid', hash: bcrypt.hashSync('apples', 8) }];
    expect(verifyUser(users, 'kid', 'apples')).toBe(true);
    expect(verifyUser(users, 'kid', 'wrong')).toBe(false);
    expect(verifyUser(users, 'ghost', 'apples')).toBe(false);
  });
  it('drops passwordless / malformed SEED_USERS entries', () => {
    const prev = process.env.SEED_USERS;
    process.env.SEED_USERS = 'dad:secret,ghost:,:nopass,kid:apples';
    const users = loadUsers();
    expect(users.map((u) => u.username).sort()).toEqual(['dad', 'kid']);
    expect(verifyUser(users, 'ghost', '')).toBe(false); // no passwordless account minted
    if (prev === undefined) delete process.env.SEED_USERS; else process.env.SEED_USERS = prev;
  });
});
