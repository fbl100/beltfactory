import bcrypt from 'bcryptjs';

export interface User { username: string; hash: string }

// SEED_USERS format: "dad:secret1,kid:apples" — plaintext, hashed at startup.
// Private family app; keep it simple. Change via .env.
export function loadUsers(): User[] {
  const raw = process.env.SEED_USERS ?? 'dad:changeme,kid:apples';
  const users: User[] = [];
  for (const pair of raw.split(',')) {
    const [rawUser, rawPass] = pair.split(':');
    const username = (rawUser ?? '').trim();
    const password = (rawPass ?? '').trim();
    // Skip malformed entries: an empty username or password would mint a
    // passwordless account (login succeeds with a blank password).
    if (!username || !password) {
      if (pair.trim()) console.warn(`Ignoring SEED_USERS entry "${pair}" (needs user:password).`);
      continue;
    }
    users.push({ username, hash: bcrypt.hashSync(password, 8) });
  }
  return users;
}

export function verifyUser(users: User[], username: string, password: string): boolean {
  const u = users.find((x) => x.username === username);
  return u ? bcrypt.compareSync(password, u.hash) : false;
}
