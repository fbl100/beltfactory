// HUD — two chrome layers over the canvas, styled to read as a game, not a settings page:
//   • a slim TOP status bar: level pill, "Make N" goal, delivery progress, transient toasts,
//     and (right side) the mute button + a gear ⚙ menu holding the rare/dangerous actions
//     (theme switcher, Clear Map, Start Over) so a 9-year-old can't fat-finger them mid-game.
//   • a BOTTOM-CENTER hotbar: ONE unified row of selectable slots — Belt/Split/Tunnel, the four
//     operator types, Erase. One selection model (activeTool + activeOp) painted by ONE
//     paintSelection(), so exactly one slot ever glows (the old separate paintTools/paintOps
//     could leave Belt and × both looking lit).
// The hotbar is also the single source of truth for the build hotkeys (TOOL_HOTKEYS/OP_HOTKEYS,
// consumed by main.ts's keydown): 1 Belt · 2 Split · 3 Tunnel · 4–7 the ops · 0 Erase.
import type { Theme } from '../render/renderer';
import { THEMES, DEFAULT_THEME } from '../render/themes';
import { formatValue } from '../render/format';
import type { GameState } from '../sim/grid';
import { LEVELS, ENDLESS_START, opsForLevel } from '../content/levels';
import { OPERATIONS } from '../content/operations';
import type { OpId } from '../content/operations';

export type Tool = 'belt' | 'operator' | 'splitter' | 'tunnel' | 'square' | 'eraser';

// ---- hotbar slot model (exported so the main.ts keymap and tests share it) ----
// No 'operator' tool slot: picking an op glyph IS picking the operator tool (one tap = "build
// this operator"). No Miner slot: miners are automatic (ensureMiners) and can't be removed.
export interface ToolSlot { kind: 'tool'; tool: Exclude<Tool, 'operator'>; key: string; glyph: string; label: string }
export interface OpSlot { kind: 'op'; op: OpId; key: string }
export type SlotDef = ToolSlot | OpSlot;

// Order = visual order. The op slots follow ALL_OPS order (add, subtract, multiply, divide).
export const SLOTS: SlotDef[] = [
  { kind: 'tool', tool: 'belt', key: '1', glyph: '➡️', label: 'Belt' },
  { kind: 'tool', tool: 'splitter', key: '2', glyph: '🔀', label: 'Split' },
  { kind: 'tool', tool: 'tunnel', key: '3', glyph: '🚇', label: 'Tunnel' },
  { kind: 'op', op: 'add', key: '4' },
  { kind: 'op', op: 'subtract', key: '5' },
  { kind: 'op', op: 'multiply', key: '6' },
  { kind: 'op', op: 'divide', key: '7' },
  { kind: 'tool', tool: 'square', key: '8', glyph: 'x²', label: 'Square' },
  { kind: 'tool', tool: 'eraser', key: '0', glyph: '🧽', label: 'Erase' },
];

// Hotkey maps DERIVED from SLOTS, so the key badge on a slot and the key main.ts listens for can
// never drift apart. Values are `| undefined` because any keyboard key can be looked up.
const toolKeys: Record<string, Exclude<Tool, 'operator'>> = {};
const opKeys: Record<string, OpId> = {};
for (const s of SLOTS) { if (s.kind === 'tool') toolKeys[s.key] = s.tool; else opKeys[s.key] = s.op; }
export const TOOL_HOTKEYS: Readonly<Record<string, Exclude<Tool, 'operator'> | undefined>> = toolKeys;
export const OP_HOTKEYS: Readonly<Record<string, OpId | undefined>> = opKeys;

// THE selection rule, pure so it's testable without a DOM: a tool slot lights when its tool is
// active; an op slot lights only while the operator tool is active AND it is the chosen op.
// activeTool is a single value, so two slots can never both satisfy this.
export function slotIsSelected(def: SlotDef, activeTool: Tool, activeOp: OpId): boolean {
  return def.kind === 'tool'
    ? activeTool === def.tool
    : activeTool === 'operator' && activeOp === def.op;
}

export interface HudCallbacks {
  onTheme: (t: Theme) => void;
  onTool: (t: Tool) => void;
  onReset: () => void;      // "Start Over" — main.ts owns the confirm()
  onClearMap: () => void;   // "Clear Map" — main.ts owns the confirm()
  onMuteToggle: () => boolean; // flip mute where the Sfx lives (main.ts); returns the NEW muted state
  isMuted: () => boolean;      // initial icon state
  username: string;         // who's signed in (shown in the gear menu)
  onLogout: () => void;     // "Log Out" — main.ts owns the confirm() + reload
}

// All HUD styling in one injected block. Dark translucent rounded panels + a cyan selection glow
// read as "game", stay legible over all three themes, and the coarse-pointer query grows every
// hit target for the iPad (a confirmed target device).
const STYLE = `
.bf-top{position:fixed;top:8px;left:8px;right:8px;z-index:6;display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-family:system-ui,sans-serif;pointer-events:none}
.bf-top>*{pointer-events:auto}
.bf-spacer{flex:1;pointer-events:none!important}
.bf-pill{background:rgba(11,16,36,.85);color:#fff;padding:7px 12px;border-radius:10px;font-weight:800;font-size:13px;border:1px solid rgba(255,255,255,.09);box-shadow:0 2px 10px rgba(0,0,0,.35)}
.bf-pill--level{background:linear-gradient(135deg,#1e88e5,#7b2ff7)}
.bf-pill--goal{font-size:15px}
.bf-prog{display:flex;align-items:center;gap:7px}
.bf-prog-bar{width:130px;height:14px;background:rgba(11,16,36,.85);border:1px solid rgba(255,255,255,.14);border-radius:8px;overflow:hidden}
.bf-prog-fill{height:100%;width:0%;background:linear-gradient(90deg,#19c37d,#8ff0a4);transition:width .2s}
.bf-prog-text{color:#fff;font-weight:800;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.bf-toast{padding:7px 14px;border-radius:10px;font-weight:800;color:#fff;display:none;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.bf-toast--notyet{background:#ef6c00}
.bf-toast--level{background:#1565c0}
.bf-toast--win{background:#2e7d32}
.bf-icon-btn{width:40px;height:40px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(11,16,36,.85);color:#fff;font-size:19px;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center;padding:0}
.bf-icon-btn:active{transform:scale(.94)}
.bf-menu{position:fixed;top:58px;right:8px;z-index:7;display:none;flex-direction:column;gap:10px;background:rgba(11,16,36,.96);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;min-width:220px;box-shadow:0 12px 32px rgba(0,0,0,.55);color:#fff;font-family:system-ui,sans-serif}
.bf-menu.open{display:flex}
.bf-menu-label{font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;opacity:.7}
.bf-menu select{padding:8px;border-radius:8px;font-weight:700;font-size:14px}
.bf-menu-btn{padding:10px;border-radius:10px;border:0;font-weight:800;font-size:14px;color:#fff;cursor:pointer;touch-action:manipulation}
.bf-menu-btn--clear{background:#ef6c00}
.bf-menu-btn--reset{background:#c62828}
.bf-hint{font-size:11px;line-height:1.6;opacity:.75;max-width:240px}
.bf-hotbar{position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:6;display:flex;align-items:stretch;gap:6px;padding:8px;border-radius:16px;background:rgba(11,16,36,.88);border:1px solid rgba(255,255,255,.12);box-shadow:0 8px 28px rgba(0,0,0,.5);font-family:system-ui,sans-serif;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.bf-divider{width:1px;margin:4px 2px;background:rgba(255,255,255,.16)}
.bf-slot{position:relative;width:52px;height:52px;border-radius:12px;border:2px solid transparent;background:rgba(255,255,255,.07);color:#fff;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:0;font-family:inherit;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.bf-slot:hover{background:rgba(255,255,255,.15)}
.bf-slot:active{transform:scale(.94)}
.bf-slot .g{font-size:19px;line-height:1;font-weight:800}
.bf-slot--op .g{font-size:23px;color:#ffd54f}
.bf-slot .t{font-size:9px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;opacity:.85}
.bf-slot .k{position:absolute;top:2px;left:5px;font-size:9px;font-weight:800;opacity:.55}
.bf-slot.sel{border-color:#34e1ff;background:rgba(52,225,255,.16);box-shadow:0 0 10px rgba(52,225,255,.6),inset 0 0 8px rgba(52,225,255,.25)}
@media (pointer:coarse){
  .bf-slot{width:60px;height:60px;border-radius:14px}
  .bf-slot .g{font-size:22px}
  .bf-slot--op .g{font-size:26px}
  .bf-slot .t{font-size:10px}
  .bf-icon-btn{width:48px;height:48px;font-size:22px}
  .bf-hotbar{gap:8px;padding:10px}
  .bf-menu{top:66px}
}
`;

function ensureStyle(): void {
  if (document.getElementById('bf-hud-style')) return;
  const s = document.createElement('style');
  s.id = 'bf-hud-style';
  s.textContent = STYLE;
  document.head.appendChild(s);
}

// Every HUD button goes through this: preventDefault on mousedown keeps the button from ever
// taking focus (so the Space key — which pans — can never re-activate the last-clicked button;
// worst case that was Start Over), and blur() after click covers browsers that focus anyway.
function gameButton(el: HTMLButtonElement, onClick: () => void): HTMLButtonElement {
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', () => { onClick(); el.blur(); });
  return el;
}

export function createHud(parent: HTMLElement, cb: HudCallbacks) {
  ensureStyle();

  // ---------- top status bar ----------
  const bar = document.createElement('div');
  bar.className = 'bf-top';

  const levelLabel = document.createElement('div');
  levelLabel.className = 'bf-pill bf-pill--level';

  const target = document.createElement('div');
  target.className = 'bf-pill bf-pill--goal';

  const progWrap = document.createElement('div');
  progWrap.className = 'bf-prog';
  const progBar = document.createElement('div');
  progBar.className = 'bf-prog-bar';
  const progFill = document.createElement('div');
  progFill.className = 'bf-prog-fill';
  progBar.appendChild(progFill);
  const progText = document.createElement('div');
  progText.className = 'bf-prog-text';
  progWrap.append(progBar, progText);

  const levelToast = document.createElement('div');
  levelToast.className = 'bf-toast bf-toast--level';

  const notYet = document.createElement('div');
  notYet.className = 'bf-toast bf-toast--notyet';
  notYet.textContent = 'Not yet — try again!';

  const banner = document.createElement('div');
  banner.className = 'bf-toast bf-toast--win';
  banner.textContent = '🎉 You beat them all!';

  const spacer = document.createElement('div');
  spacer.className = 'bf-spacer';

  // Mute lives in the HUD now (it used to be a lone floating button in main.ts). The Sfx itself
  // stays in main.ts; the HUD just asks it to toggle and paints the returned state.
  const muteBtn = document.createElement('button');
  muteBtn.className = 'bf-icon-btn';
  muteBtn.title = 'Mute / unmute sounds (M)';
  const paintMuteIcon = (m: boolean) => { muteBtn.textContent = m ? '🔇' : '🔊'; };
  gameButton(muteBtn, () => paintMuteIcon(cb.onMuteToggle()));
  paintMuteIcon(cb.isMuted());

  const gearBtn = document.createElement('button');
  gearBtn.className = 'bf-icon-btn';
  gearBtn.textContent = '⚙️';
  gearBtn.title = 'Settings';

  bar.append(levelLabel, target, progWrap, levelToast, notYet, banner, spacer, muteBtn, gearBtn);

  // ---------- gear menu (theme + the dangerous buttons, tucked away from small fingers) ----------
  const menu = document.createElement('div');
  menu.className = 'bf-menu';

  const themeLabel = document.createElement('div');
  themeLabel.className = 'bf-menu-label';
  themeLabel.textContent = 'Theme';
  const sel = document.createElement('select');
  for (const th of THEMES) { const o = document.createElement('option'); o.value = th.id; o.textContent = th.name; sel.appendChild(o); }
  sel.value = DEFAULT_THEME.id; // match the theme the renderer actually boots with (Neon Arcade)
  // blur after choosing so Space-pan can't reopen/re-trigger the select. (No mousedown
  // preventDefault here — that would stop the native dropdown from opening at all.)
  sel.addEventListener('change', () => { cb.onTheme(THEMES.find((x) => x.id === sel.value)!); sel.blur(); });

  // Clear Map: wipe what you built on THIS level (keep the level + goal). Start Over: full restart.
  // Both confirm() in main.ts. Close the menu first so it isn't stuck open behind the dialog.
  const clearMap = document.createElement('button');
  clearMap.className = 'bf-menu-btn bf-menu-btn--clear';
  clearMap.textContent = 'Clear Map';
  gameButton(clearMap, () => { menu.classList.remove('open'); cb.onClearMap(); });

  const reset = document.createElement('button');
  reset.className = 'bf-menu-btn bf-menu-btn--reset';
  reset.textContent = 'Start Over';
  gameButton(reset, () => { menu.classList.remove('open'); cb.onReset(); });

  const hint = document.createElement('div');
  hint.className = 'bf-hint';
  hint.textContent = '1 Belt · 2 Split · 3 Tunnel · 4–7 ＋ − × ÷ · 8 x² · 0 Erase · R rotate · drag (or click, then click) paints belts · right-drag erases · scroll / space-drag pans · pinch or + / − zooms · M mute';

  // Account: who's signed in + a Log Out button (main.ts confirms + reloads to the login screen).
  const acctLabel = document.createElement('div');
  acctLabel.className = 'bf-menu-label';
  acctLabel.textContent = 'Account';
  const whoami = document.createElement('div');
  whoami.style.cssText = 'font-weight:800;font-size:13px;margin-top:-4px';
  whoami.textContent = `Signed in as ${cb.username}`;
  const logout = document.createElement('button');
  logout.className = 'bf-menu-btn';
  logout.style.background = '#455a64';
  logout.textContent = 'Log Out';
  gameButton(logout, () => { menu.classList.remove('open'); cb.onLogout(); });

  menu.append(themeLabel, sel, clearMap, reset, acctLabel, whoami, logout, hint);

  gameButton(gearBtn, () => menu.classList.toggle('open'));
  // Click anywhere else closes the menu. gearBtn is excluded so its own click stays a pure toggle.
  document.addEventListener('pointerdown', (e) => {
    if (!menu.classList.contains('open')) return;
    const t = e.target as Node;
    if (!menu.contains(t) && !gearBtn.contains(t)) menu.classList.remove('open');
  });

  // ---------- bottom-center hotbar ----------
  let activeTool: Tool = 'belt';
  let activeOp: OpId = 'add';

  const hotbar = document.createElement('div');
  hotbar.className = 'bf-hotbar';
  const slotEls: { def: SlotDef; el: HTMLButtonElement }[] = [];
  let prevKind: SlotDef['kind'] | null = null;
  for (const def of SLOTS) {
    if (prevKind !== null && prevKind !== def.kind) {
      const d = document.createElement('div'); d.className = 'bf-divider'; hotbar.appendChild(d);
    }
    prevKind = def.kind;
    const b = document.createElement('button');
    b.className = def.kind === 'op' ? 'bf-slot bf-slot--op' : 'bf-slot';
    const glyph = def.kind === 'op' ? OPERATIONS[def.op].symbol : def.glyph;
    const label = def.kind === 'op' ? (OPERATIONS[def.op].label.split(' ')[1] ?? '') : def.label;
    b.title = def.kind === 'op' ? `${OPERATIONS[def.op].label} (key ${def.key})` : `${def.label} (key ${def.key})`;
    const g = document.createElement('span'); g.className = 'g'; g.textContent = glyph;
    const t = document.createElement('span'); t.className = 't'; t.textContent = label;
    const k = document.createElement('span'); k.className = 'k'; k.textContent = def.key;
    b.append(g, t, k);
    gameButton(b, () => {
      if (def.kind === 'tool') { activeTool = def.tool; cb.onTool(def.tool); }
      else { activeOp = def.op; activeTool = 'operator'; cb.onTool('operator'); } // one tap = "build this operator"
      paintSelection();
    });
    slotEls.push({ def, el: b });
    hotbar.appendChild(b);
  }
  const paintSelection = () => {
    for (const { def, el } of slotEls) el.classList.toggle('sel', slotIsSelected(def, activeTool, activeOp));
  };
  paintSelection();

  parent.append(bar, menu, hotbar);

  // ---------- per-frame state ----------
  let lastMisses = 0;
  let flash = 0;   // frames remaining for the "Not yet" toast
  let grace = 0;   // frames after a level-up during which the "Not yet" flash is suppressed
  let toast = 0;   // frames remaining for the level-up toast

  return {
    update(state: GameState) {
      const idx = Math.max(0, Math.trunc(state.levelIndex));
      const isEndless = idx >= ENDLESS_START;
      let goal = '?';
      let required = 0;
      for (const b of state.buildings.values()) if (b.type === 'target') { goal = formatValue(b.target); required = b.required; break; }
      target.textContent = `Make ${goal}`;
      levelLabel.textContent = isEndless ? `Level ${idx + 1} · ∞` : `Level ${idx + 1}/${LEVELS.length}`;

      // show only the operator slots unlocked at this level; fall back if the active one locked
      const availOps = opsForLevel(idx);
      for (const { def, el } of slotEls) {
        if (def.kind === 'op') el.style.display = availOps.includes(def.op) ? 'flex' : 'none';
      }
      if (!availOps.includes(activeOp)) { activeOp = 'add'; paintSelection(); }

      const pct = required > 0 ? Math.min(100, Math.round((100 * state.delivered) / required)) : 0;
      progFill.style.width = `${pct}%`;
      progText.textContent = required > 0 ? `${state.delivered}/${required}` : `${state.delivered}`;
      banner.style.display = state.status === 'won' ? 'block' : 'none';

      // NOTE: the old lastLevel level-up DETECTOR lived here. It's gone on purpose — main.ts's
      // single level-up event source (P3) calls announceGoal() instead, so the HUD only displays.
      if (toast > 0) { toast--; levelToast.style.display = 'block'; } else levelToast.style.display = 'none';

      if (grace > 0) { grace--; lastMisses = state.misses; flash = 0; notYet.style.display = 'none'; }
      else {
        if (state.misses > lastMisses) { flash = 90; lastMisses = state.misses; }
        if (flash > 0) { flash--; notYet.style.display = 'block'; } else notYet.style.display = 'none';
      }
    },
    setTool(t: Tool) { activeTool = t; paintSelection(); },
    // Hotkeys 4–7 land here: choosing an op implies the operator tool (mirrors the slot click,
    // but does NOT call cb.onTool — main.ts sets its own `tool` var before calling, like setTool).
    setOp(op: OpId) { activeOp = op; activeTool = 'operator'; paintSelection(); },
    getOp(): OpId { return activeOp; },
    // Show the level-up toast + start the "Not yet" grace window (leftover old-value items keep
    // flowing after an auto-advance; they must not read as mistakes). Caller composes the text.
    announceGoal(text: string) { levelToast.textContent = text; toast = 210; grace = 210; },
    // For the M hotkey in main.ts, which toggles the Sfx directly and then repaints our icon.
    setMuted(m: boolean) { paintMuteIcon(m); },
  };
}
