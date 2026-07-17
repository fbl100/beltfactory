import type { Theme } from '../render/renderer';
import { THEMES } from '../render/themes';
import { formatValue } from '../render/format';
import type { GameState } from '../sim/grid';
import { LEVELS, clampLevelIndex, opsForLevel } from '../content/levels';
import { ALL_OPS, OPERATIONS } from '../content/operations';
import type { OpId } from '../content/operations';

export type Tool = 'belt' | 'miner' | 'operator' | 'splitter' | 'tunnel';

export function createHud(
  parent: HTMLElement,
  onTheme: (t: Theme) => void,
  onTool: (t: Tool) => void,
  onReset: () => void,
  onClearMap: () => void,
) {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-family:system-ui;z-index:5';

  const levelLabel = document.createElement('div');
  levelLabel.style.cssText = 'background:#1e88e5;color:#fff;padding:6px 10px;border-radius:8px;font-weight:800;font-size:13px';

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
    { id: 'belt', label: 'Belt' }, { id: 'splitter', label: 'Split' }, { id: 'tunnel', label: 'Tunnel' },
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

  // --- operator-type selector (which op the "+ Op" tool builds; visibility gated by level) ---
  let activeOp: OpId = 'add';
  const opWrap = document.createElement('div'); opWrap.style.cssText = 'display:flex;gap:4px';
  const opBtns: Record<string, HTMLButtonElement> = {};
  for (const op of ALL_OPS) {
    const b = document.createElement('button');
    b.textContent = OPERATIONS[op].symbol; b.title = OPERATIONS[op].label;
    b.style.cssText = 'padding:6px 10px;border-radius:8px;border:2px solid transparent;cursor:pointer;font-weight:800;min-width:30px';
    // Picking an op also selects the operator tool, so one click means "build this operator".
    b.addEventListener('click', () => { activeOp = op; activeTool = 'operator'; onTool('operator'); paintTools(); paintOps(); });
    opBtns[op] = b; opWrap.appendChild(b);
  }
  const paintOps = () => { for (const op of ALL_OPS) opBtns[op].style.borderColor = op === activeOp ? '#1e88e5' : 'transparent'; };
  paintOps();

  // Placement facing is rotated with the R key (see main.ts); belts orient by the direction
  // you drag/click, so there are no manual direction buttons.

  // --- theme switcher ---
  const sel = document.createElement('select'); sel.style.cssText = 'padding:6px;border-radius:8px';
  for (const th of THEMES) { const o = document.createElement('option'); o.value = th.id; o.textContent = th.name; sel.appendChild(o); }
  sel.addEventListener('change', () => onTheme(THEMES.find((x) => x.id === sel.value)!));

  // Clear Map: wipe what you built on THIS level (keep the level + goal). Start Over: full restart.
  const clearMap = document.createElement('button');
  clearMap.textContent = 'Clear Map';
  clearMap.style.cssText = 'padding:6px 10px;border-radius:8px;border:0;background:#ef6c00;color:#fff;font-weight:700;cursor:pointer';
  clearMap.addEventListener('click', () => onClearMap());

  const reset = document.createElement('button');
  reset.textContent = 'Start Over';
  reset.style.cssText = 'padding:6px 10px;border-radius:8px;border:0;background:#c62828;color:#fff;font-weight:700;cursor:pointer';
  reset.addEventListener('click', () => onReset());

  const hint = document.createElement('div');
  hint.style.cssText = 'color:#000a;font-size:12px';
  hint.textContent = 'drag = belt · scroll or space-drag = pan · pinch or +/− = zoom · R = rotate · right-drag = erase · 1-5 = tools';

  const notYet = document.createElement('div');
  notYet.style.cssText = 'background:#ef6c00;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  notYet.textContent = 'Not yet — try again!';

  const levelToast = document.createElement('div');
  levelToast.style.cssText = 'background:#1565c0;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';

  const banner = document.createElement('div');
  banner.style.cssText = 'margin-left:auto;background:#2e7d32;color:#fff;padding:6px 12px;border-radius:8px;font-weight:800;display:none';
  banner.textContent = '🎉 You beat them all!';

  bar.append(levelLabel, target, progWrap, toolWrap, opWrap, sel, clearMap, reset, hint, notYet, levelToast, banner);
  parent.appendChild(bar);

  let lastMisses = 0;
  let flash = 0;        // frames remaining for the "Not yet" banner
  let grace = 0;        // frames after a level-up during which the "Not yet" flash is suppressed
  let toast = 0;        // frames remaining for the "Level up!" toast
  let lastLevel = -1;   // -1 until the first update, so a resumed save doesn't false-celebrate
  return {
    update(state: GameState) {
      const idx = clampLevelIndex(state.levelIndex);
      let goal = '?';
      let required = 0;
      for (const b of state.buildings.values()) if (b.type === 'target') { goal = formatValue(b.target); required = b.required; break; }
      target.textContent = `Make ${goal}`;
      levelLabel.textContent = `Level ${idx + 1}/${LEVELS.length}`;
      // show only the operator types unlocked at this level; fall back if the active one locked
      const availOps = opsForLevel(idx);
      for (const op of ALL_OPS) opBtns[op].style.display = availOps.includes(op) ? 'block' : 'none';
      if (!availOps.includes(activeOp)) activeOp = 'add';
      paintOps();
      const pct = required > 0 ? Math.min(100, Math.round((100 * state.delivered) / required)) : 0;
      progFill.style.width = `${pct}%`;
      progText.textContent = required > 0 ? `${state.delivered}/${required}` : `${state.delivered}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';

      // Level-up: announce the new goal, and give the still-running old factory a grace window
      // so leftover old-value items don't immediately spam the "Not yet" flash. Machine keeps
      // running (auto-advance). No toast on the very first update (resume) or the final win.
      if (lastLevel >= 0 && state.levelIndex > lastLevel && state.status === 'playing') {
        toast = 210; grace = 210;
        levelToast.textContent = `⭐ Level ${idx + 1}! Now make ${goal}`;
      }
      lastLevel = state.levelIndex;
      if (toast > 0) { toast--; levelToast.style.display = 'block'; } else levelToast.style.display = 'none';

      if (grace > 0) { grace--; lastMisses = state.misses; flash = 0; notYet.style.display = 'none'; }
      else {
        if (state.misses > lastMisses) { flash = 90; lastMisses = state.misses; }
        if (flash > 0) { flash--; notYet.style.display = 'block'; } else notYet.style.display = 'none';
      }
    },
    setTool(t: Tool) { activeTool = t; paintTools(); },
    getOp(): OpId { return activeOp; },
  };
}
