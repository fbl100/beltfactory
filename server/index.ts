import express from 'express';
import cookieSession from 'cookie-session';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUsers, verifyUser } from './users';
import { loadState, saveState } from './storage';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '..', 'data');
const DIST_DIR = join(__dirname, '..', 'dist');

const DEFAULT_SECRETS = ['dev-secret-change-me', 'please-change-this'];
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
if (DEFAULT_SECRETS.includes(SESSION_SECRET)) {
  // A known/default secret lets anyone forge a signed session cookie.
  console.warn('WARNING: SESSION_SECRET is unset or a default. Set a long random SESSION_SECRET before real use.');
}

const users = loadUsers();
const app = express();

app.use(express.json({ limit: '4mb' }));
app.use(cookieSession({
  name: 'bf',
  secret: SESSION_SECRET,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}));

function requireUser(req: express.Request, res: express.Response): string | null {
  const u = req.session?.username;
  if (!u) { res.status(401).json({ error: 'not logged in' }); return null; }
  return u;
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string' || !verifyUser(users, username, password)) {
    return res.status(401).json({ error: 'bad credentials' });
  }
  req.session!.username = username;
  res.json({ username });
});

app.post('/api/logout', (req, res) => { req.session = null; res.json({ ok: true }); });

app.get('/api/me', (req, res) => {
  const u = req.session?.username;
  if (!u) return res.status(401).json({ error: 'not logged in' });
  res.json({ username: u });
});

app.get('/api/state', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  const json = loadState(DATA_DIR, u);
  if (!json) return res.status(204).end();
  res.type('application/json').send(json);
});

app.post('/api/save', (req, res) => {
  const u = requireUser(req, res); if (!u) return;
  saveState(DATA_DIR, u, JSON.stringify(req.body));
  res.json({ ok: true });
});

app.use(express.static(DIST_DIR));
app.get('*', (_req, res) => res.sendFile(join(DIST_DIR, 'index.html')));

app.listen(PORT, () => console.log(`Belt Factory on http://localhost:${PORT}`));
