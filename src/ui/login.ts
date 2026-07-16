import { apiLogin } from '../net/api';

// Centered login form; resolves once login succeeds.
export function showLogin(parent: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#1118;z-index:10';
    overlay.innerHTML = `
      <form style="background:#fff;padding:24px;border-radius:12px;display:grid;gap:10px;min-width:260px;font-family:system-ui">
        <h2 style="margin:0">Belt Factory</h2>
        <input name="u" placeholder="username" autocomplete="username" style="padding:8px" />
        <input name="p" type="password" placeholder="password" autocomplete="current-password" style="padding:8px" />
        <button style="padding:8px;font-weight:700">Play</button>
        <div class="err" style="color:#c00;font-size:13px;min-height:16px"></div>
      </form>`;
    parent.appendChild(overlay);
    const form = overlay.querySelector('form')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = (form.elements.namedItem('u') as HTMLInputElement).value;
      const p = (form.elements.namedItem('p') as HTMLInputElement).value;
      if (await apiLogin(u, p)) { overlay.remove(); resolve(); }
      else overlay.querySelector('.err')!.textContent = 'Wrong username or password';
    });
  });
}
