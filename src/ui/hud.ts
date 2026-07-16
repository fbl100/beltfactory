import type { Theme } from '../render/renderer';
import { THEMES } from '../render/themes';
import type { GameState } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function createHud(
  parent: HTMLElement,
  onTheme: (t: Theme) => void,
  onDir: (d: Direction) => void,
) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;font-family:system-ui;z-index:5';

  const target = document.createElement('div');
  target.style.cssText = 'background:#000a;color:#fff;padding:6px 12px;border-radius:8px;font-weight:700';

  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  const glyph: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
  const dirWrap = document.createElement('div');
  dirWrap.style.cssText = 'display:flex;gap:4px';
  let active: Direction = 'right';
  const btns: Record<string, HTMLButtonElement> = {};
  for (const d of dirs) {
    const b = document.createElement('button');
    b.textContent = glyph[d];
    b.style.cssText = 'padding:6px 10px;border-radius:8px;border:2px solid transparent;cursor:pointer';
    b.addEventListener('click', () => { active = d; onDir(d); paint(); });
    btns[d] = b; dirWrap.appendChild(b);
  }
  const paint = () => dirs.forEach((d) => { btns[d].style.borderColor = d === active ? '#1e88e5' : 'transparent'; });
  paint();

  const sel = document.createElement('select');
  sel.style.cssText = 'padding:6px;border-radius:8px';
  for (const t of THEMES) { const o = document.createElement('option'); o.value = t.id; o.textContent = t.name; sel.appendChild(o); }
  sel.addEventListener('change', () => onTheme(THEMES.find((x) => x.id === sel.value)!));

  const banner = document.createElement('div');
  banner.style.cssText = 'margin-left:auto;background:#2e7d32;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  banner.textContent = '🎉 You did it!';

  bar.append(target, dirWrap, sel, banner);
  parent.appendChild(bar);

  return {
    update(state: GameState) {
      let goal = '?';
      for (const c of state.cells.values()) if (c.type === 'sink') { goal = String(c.target); break; }
      target.textContent = `Target: ${goal}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';
    },
  };
}
