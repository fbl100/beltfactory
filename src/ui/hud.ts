import type { Theme } from '../render/renderer';
import { THEMES } from '../render/themes';
import { formatValue } from '../render/format';
import type { GameState, Direction } from '../sim/grid';

export type Tool = 'belt' | 'miner' | 'operator' | 'splitter';

export function createHud(
  parent: HTMLElement,
  onTheme: (t: Theme) => void,
  onDir: (d: Direction) => void,
  onTool: (t: Tool) => void,
  onReset: () => void,
) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-family:system-ui;z-index:5';

  const target = document.createElement('div');
  target.style.cssText = 'background:#000a;color:#fff;padding:6px 12px;border-radius:8px;font-weight:700';

  // --- progress bar (delivered / required) ---
  const progWrap = document.createElement('div');
  progWrap.style.cssText = 'display:flex;align-items:center;gap:6px';
  const progBar = document.createElement('div');
  progBar.style.cssText = 'width:120px;height:12px;background:#0003;border-radius:6px;overflow:hidden';
  const progFill = document.createElement('div');
  progFill.style.cssText = 'height:100%;width:0%;background:#2e7d32;transition:width .2s';
  progBar.appendChild(progFill);
  const progText = document.createElement('div');
  progText.style.cssText = 'color:#000a;font-weight:700;font-size:12px';
  progWrap.append(progBar, progText);

  // --- build-tool selector ---
  const tools: { id: Tool; label: string }[] = [
    { id: 'belt', label: 'Belt' }, { id: 'splitter', label: 'Split' },
    { id: 'miner', label: 'Miner' }, { id: 'operator', label: '+ Op' },
  ];
  let activeTool: Tool = 'belt';
  const toolWrap = document.createElement('div'); toolWrap.style.cssText = 'display:flex;gap:4px';
  const toolBtns: Record<string, HTMLButtonElement> = {};
  for (const tl of tools) {
    const b = document.createElement('button');
    b.textContent = tl.label;
    b.style.cssText = 'padding:6px 10px;border-radius:8px;border:2px solid transparent;cursor:pointer;font-weight:700';
    b.addEventListener('click', () => { activeTool = tl.id; onTool(tl.id); paintTools(); });
    toolBtns[tl.id] = b; toolWrap.appendChild(b);
  }
  const paintTools = () => tools.forEach((tl) => { toolBtns[tl.id].style.borderColor = tl.id === activeTool ? '#1e88e5' : 'transparent'; });
  paintTools();

  // --- direction / rotation ---
  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  const glyph: Record<Direction, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
  let activeDir: Direction = 'right';
  const dirWrap = document.createElement('div'); dirWrap.style.cssText = 'display:flex;gap:4px';
  const dirBtns: Record<string, HTMLButtonElement> = {};
  for (const d of dirs) {
    const b = document.createElement('button');
    b.textContent = glyph[d];
    b.style.cssText = 'padding:6px 10px;border-radius:8px;border:2px solid transparent;cursor:pointer';
    b.addEventListener('click', () => { activeDir = d; onDir(d); paintDirs(); });
    dirBtns[d] = b; dirWrap.appendChild(b);
  }
  const paintDirs = () => dirs.forEach((d) => { dirBtns[d].style.borderColor = d === activeDir ? '#1e88e5' : 'transparent'; });
  paintDirs();

  // --- theme switcher ---
  const sel = document.createElement('select'); sel.style.cssText = 'padding:6px;border-radius:8px';
  for (const th of THEMES) { const o = document.createElement('option'); o.value = th.id; o.textContent = th.name; sel.appendChild(o); }
  sel.addEventListener('change', () => onTheme(THEMES.find((x) => x.id === sel.value)!));

  const reset = document.createElement('button');
  reset.textContent = 'Reset';
  reset.style.cssText = 'padding:6px 10px;border-radius:8px;border:0;background:#c62828;color:#fff;font-weight:700;cursor:pointer';
  reset.addEventListener('click', () => onReset());

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#000a;font-size:12px';
  hint.textContent = 'drag = belt · click = build · R = rotate · right-drag = erase · 1-4 = tools';

  const notYet = document.createElement('div');
  notYet.style.cssText = 'background:#ef6c00;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  notYet.textContent = 'Not yet — try again!';

  const banner = document.createElement('div');
  banner.style.cssText = 'margin-left:auto;background:#2e7d32;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  banner.textContent = '🎉 You did it!';

  bar.append(target, progWrap, toolWrap, dirWrap, sel, reset, hint, notYet, banner);
  parent.appendChild(bar);

  let lastMisses = 0;
  let flash = 0; // frames remaining for the "Not yet" banner
  return {
    update(state: GameState) {
      let goal = '?';
      let required = 0;
      for (const b of state.buildings.values()) if (b.type === 'target') { goal = formatValue(b.target); required = b.required; break; }
      target.textContent = `Make ${goal}`;
      const pct = required > 0 ? Math.min(100, Math.round((100 * state.delivered) / required)) : 0;
      progFill.style.width = `${pct}%`;
      progText.textContent = required > 0 ? `${state.delivered}/${required}` : `${state.delivered}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';
      if (state.misses > lastMisses) { flash = 90; lastMisses = state.misses; }
      if (flash > 0) { flash--; notYet.style.display = 'block'; } else notYet.style.display = 'none';
    },
    setDir(d: Direction) { activeDir = d; paintDirs(); },
    setTool(t: Tool) { activeTool = t; paintTools(); },
  };
}
