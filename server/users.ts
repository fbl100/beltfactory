import bcrypt from 'bcryptjs';

export interface User { username: string; hash: string }

// SEED_USERS format: "dad:secret1,kid:apples" — plaintext, hashed at startup.
// Private family app; keep it simple. Change via .env.
export function loadUsers(): User[] {
  const raw = process.env.SEED_USERS ?? 'dad:changeme,kid:apples';
  return raw.split(',').map((pair) => {
    const [username, password] = pair.split(':');
    return { username: username.trim(), hash: bcrypt.hashSync((password ?? '').trim(), 8) };
  });
}

export function verifyUser(users: User[], username: string, password: string): boolean {
  const u = users.find((x) => x.username === username);
  return u ? bcrypt.compareSync(password, u.hash) : false;
}
