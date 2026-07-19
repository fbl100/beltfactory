import { apiLogin, apiRegister } from '../net/api';
import type { Mode } from '../content/levels';

// Centered login / create-account screen; resolves once the player is signed in (login OR register).
// No seeded users — the first person creates an account. New accounts pick a difficulty (Easy = + −
// for a little kid; Normal = the full game), which seeds their first game.
export function showLogin(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    let view: 'login' | 'register' = 'login';
    let mode: Mode = 'normal';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#1118;z-index:10;font-family:system-ui';
    parent.appendChild(overlay);

    const modePicker = (): string => `
      <div style="display:grid;gap:6px">
        <div style="font-size:12px;font-weight:700;color:#555">Choose a difficulty</div>
        <div style="display:flex;gap:8px">
          <button type="button" data-mode="normal" class="mode" style="flex:1;padding:10px;border-radius:10px;border:2px solid #ddd;background:#fff;font-weight:800;cursor:pointer">🔢 Normal</button>
          <button type="button" data-mode="easy" class="mode" style="flex:1;padding:10px;border-radius:10px;border:2px solid #ddd;background:#fff;font-weight:800;cursor:pointer">🐣 Easy (＋ −)</button>
        </div>
        <div class="modehint" style="font-size:12px;color:#777;min-height:15px"></div>
      </div>`;

    function render(): void {
      const reg = view === 'register';
      overlay.innerHTML = `
        <form style="background:#fff;padding:24px;border-radius:14px;display:grid;gap:12px;min-width:280px;box-shadow:0 12px 40px #0004">
          <h2 style="margin:0 0 2px">${reg ? 'Create your account' : 'Belt Factory'}</h2>
          <input name="u" placeholder="username" autocomplete="username" style="padding:9px;border:1px solid #ccc;border-radius:8px;font-size:15px" />
          <input name="p" type="password" placeholder="password" autocomplete="${reg ? 'new-password' : 'current-password'}" style="padding:9px;border:1px solid #ccc;border-radius:8px;font-size:15px" />
          ${reg ? modePicker() : ''}
          <button type="submit" style="padding:10px;font-weight:800;font-size:15px;border:0;border-radius:10px;background:#1e88e5;color:#fff;cursor:pointer">${reg ? 'Create account' : 'Play'}</button>
          <div class="err" style="color:#c00;font-size:13px;min-height:16px"></div>
          <div style="font-size:13px;color:#555;text-align:center">
            ${reg ? 'Already have an account? ' : 'New here? '}
            <a href="#" class="toggle" style="color:#1e88e5;font-weight:700">${reg ? 'Sign in' : 'Create an account'}</a>
          </div>
        </form>`;
      wire();
    }

    function wire(): void {
      const form = overlay.querySelector('form') as HTMLFormElement;
      const err = overlay.querySelector('.err') as HTMLDivElement;
      const uEl = form.elements.namedItem('u') as HTMLInputElement;
      const pEl = form.elements.namedItem('p') as HTMLInputElement;

      // Difficulty picker (register view only): highlight the choice and describe it.
      const paintMode = () => {
        overlay.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) => {
          const on = b.dataset.mode === mode;
          b.style.borderColor = on ? '#1e88e5' : '#ddd';
          b.style.background = on ? '#e3f2fd' : '#fff';
        });
        const hint = overlay.querySelector('.modehint');
        if (hint) hint.textContent = mode === 'easy'
          ? 'Adding & subtracting with tiny numbers — great for a young kid.'
          : 'The full game: +, −, ×, ÷ and bigger numbers.';
      };
      overlay.querySelectorAll<HTMLButtonElement>('.mode').forEach((b) =>
        b.addEventListener('click', (e) => { e.preventDefault(); mode = (b.dataset.mode as Mode); paintMode(); }));
      if (view === 'register') paintMode();

      // Toggle between sign-in and create-account, preserving whatever they've typed.
      overlay.querySelector('.toggle')!.addEventListener('click', (e) => {
        e.preventDefault();
        const u = uEl.value, p = pEl.value;
        view = view === 'register' ? 'login' : 'register';
        render();
        const f = overlay.querySelector('form') as HTMLFormElement;
        (f.elements.namedItem('u') as HTMLInputElement).value = u;
        (f.elements.namedItem('p') as HTMLInputElement).value = p;
      });

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const u = uEl.value.trim(), p = pEl.value;
        if (view === 'register') {
          const r = await apiRegister(u, p, mode);
          if (r.ok) { overlay.remove(); resolve(); }
          else err.textContent = r.error;
        } else {
          if (await apiLogin(u, p)) { overlay.remove(); resolve(); }
          else err.textContent = 'Wrong username or password.';
        }
      });
    }

    render();
  });
}
