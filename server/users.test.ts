import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { verifyUser, User } from './users';

describe('users', () => {
  it('verifies a correct password against a hash', () => {
    const users: User[] = [{ username: 'kid', hash: bcrypt.hashSync('apples', 8) }];
    expect(verifyUser(users, 'kid', 'apples')).toBe(true);
    expect(verifyUser(users, 'kid', 'wrong')).toBe(false);
    expect(verifyUser(users, 'ghost', 'apples')).toBe(false);
  });
});
