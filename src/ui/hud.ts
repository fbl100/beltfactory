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
import { countMachines } from '../sim/buildings';
import { LEVELS, ENDLESS_START, opsForLevel, levelAt } from '../content/levels';
import type { Mode } from '../content/levels';
import { OPERATIONS } from '../content/operations';
import type { OpId } from '../content/operations';
import { starsFor } from '../content/config';

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
  onReplay: (levelIndex: number) => void; // replay a past endless puzzle from the ⭐ My Puzzles screen
  onSkipTutorial: () => void;             // "Skip to Endless" — jump past the authored campaign (main.ts confirms)
  onSetMode: (mode: Mode) => void;        // switch Easy (+ −) / Normal difficulty — starts a fresh game (main.ts confirms)
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
.bf-pill--par{font-variant-numeric:tabular-nums;transition:background .2s}
.bf-par--3{background:linear-gradient(135deg,#2e7d32,#43a047)}
.bf-par--2{background:linear-gradient(135deg,#ef6c00,#f9a825)}
.bf-par--1{background:rgba(11,16,36,.85)}
.bf-par-off{opacity:.35}
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

/* ---- My Star Collection modal (design: Fable pass, matched to the tokens above) ---- */
.bf-stars-overlay{position:fixed;inset:0;z-index:9;display:none;align-items:center;justify-content:center;background:rgba(4,6,16,.6);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);font-family:system-ui,sans-serif;padding:16px}
.bf-stars-overlay.open{display:flex}
.bf-stars-panel{display:flex;flex-direction:column;gap:12px;width:min(520px,100%);max-height:min(680px,calc(100vh - 32px));background:rgba(11,16,36,.96);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:14px;box-shadow:0 12px 32px rgba(0,0,0,.55);color:#fff;overflow:hidden}
@media (prefers-reduced-motion:no-preference){
  .bf-stars-overlay.open .bf-stars-panel{animation:bf-stars-pop .22s cubic-bezier(.34,1.4,.64,1)}
  @keyframes bf-stars-pop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}
}
.bf-stars-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.bf-stars-title{margin:0;font-size:20px;font-weight:800;background:linear-gradient(135deg,#34e1ff,#7b2ff7);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:#7b2ff7}
.bf-stars-sub{font-size:12px;font-weight:700;opacity:.7;margin-top:2px}
.bf-stars-close{flex:none}
.bf-stars-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.bf-stars-tile{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:10px 6px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.bf-stars-tile--gold{background:linear-gradient(135deg,#ef6c00,#f9a825);border-color:rgba(255,255,255,.2)}
.bf-stars-tile--green{background:linear-gradient(135deg,#2e7d32,#43a047);border-color:rgba(255,255,255,.2)}
.bf-stars-tile-num{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px rgba(0,0,0,.5)}
.bf-stars-tile-label{font-size:10px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;opacity:.85;margin-top:2px}
.bf-stars-cheer{font-size:13px;font-weight:800;text-align:center;color:#8ff0a4;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.bf-stars-cheer:empty{display:none}
.bf-stars-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;margin:0;padding:2px;list-style:none;display:flex;flex-direction:column;gap:8px}
.bf-stars-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.09)}
.bf-stars-row-info{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;white-space:nowrap;overflow:hidden}
.bf-stars-row-num{font-size:12px;font-weight:800;opacity:.55;flex:none}
.bf-stars-row-target{font-size:15px;font-weight:800;font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis}
.bf-stars-pager{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding-top:2px}
.bf-stars-pager:empty{display:none}
.bf-stars-page-btn{min-width:34px;padding:7px 9px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font-weight:800;font-size:13px;cursor:pointer;font-family:inherit;touch-action:manipulation}
.bf-stars-page-btn.on{background:linear-gradient(135deg,#1e88e5,#7b2ff7);border-color:transparent}
@media (pointer:coarse){ .bf-stars-page-btn{min-width:42px;padding:10px 12px} }
.bf-stars-row-stars{display:flex;gap:2px;font-size:18px;line-height:1;flex:none}
.bf-star{color:rgba(255,255,255,.22)}
.bf-star.on{color:#f9a825;text-shadow:0 0 6px rgba(249,168,37,.55)}
.bf-stars-row--3{border-color:rgba(249,168,37,.45);background:linear-gradient(90deg,rgba(249,168,37,.14),rgba(255,255,255,.05))}
.bf-stars-row--2{border-color:rgba(239,108,0,.35);background:linear-gradient(90deg,rgba(239,108,0,.10),rgba(255,255,255,.05))}
@media (prefers-reduced-motion:no-preference){
  .bf-stars-row--3{position:relative;overflow:hidden}
  .bf-stars-row--3::after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(105deg,transparent,rgba(255,235,170,.13),transparent);animation:bf-stars-sheen 5s ease-in-out infinite;pointer-events:none}
  @keyframes bf-stars-sheen{0%,70%{left:-60%}90%,100%{left:120%}}
}
.bf-stars-replay{flex:none;padding:9px 14px;border-radius:10px;border:0;background:linear-gradient(135deg,#1e88e5,#7b2ff7);color:#fff;font-weight:800;font-size:13px;font-family:inherit;cursor:pointer;touch-action:manipulation;box-shadow:0 2px 10px rgba(0,0,0,.35)}
.bf-stars-replay:hover{filter:brightness(1.15)}
.bf-stars-replay:active{transform:scale(.94)}
.bf-stars-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:28px 16px}
.bf-stars-empty-glyph{font-size:40px;color:rgba(249,168,37,.5);letter-spacing:6px}
.bf-stars-empty-head{font-size:18px;font-weight:800}
.bf-stars-empty-text{margin:0;font-size:13px;font-weight:600;opacity:.75;max-width:300px;line-height:1.5}
@media (pointer:coarse){
  .bf-stars-row{padding:12px;gap:12px}
  .bf-stars-replay{padding:14px 16px;font-size:14px;min-height:48px}
  .bf-stars-row-stars{font-size:22px}
  .bf-stars-tile-num{font-size:24px}
  .bf-stars-close{width:48px;height:48px}
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

  // Golf pill: live "machines you've built / par" + a projected star rating, so she can see whether
  // she's still on track for 3 stars WHILE building — the beat-par tension, not just an after-the-fact score.
  const parPill = document.createElement('div');
  parPill.className = 'bf-pill bf-pill--par';

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

  // ⭐ My Star Collection — her progress/replay screen (opens the overlay built below).
  const starsBtn = document.createElement('button');
  starsBtn.className = 'bf-icon-btn';
  starsBtn.textContent = '⭐';
  starsBtn.title = 'My Stars';

  const gearBtn = document.createElement('button');
  gearBtn.className = 'bf-icon-btn';
  gearBtn.textContent = '⚙️';
  gearBtn.title = 'Settings';

  bar.append(levelLabel, target, parPill, progWrap, levelToast, notYet, banner, spacer, starsBtn, muteBtn, gearBtn);

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

  // Difficulty toggle: Easy (+ −, for a 6-year-old) vs Normal. Switching starts a fresh game (main.ts
  // confirms). Its label is repainted each frame in update() to show the mode she'd switch TO.
  const modeBtn = document.createElement('button');
  modeBtn.className = 'bf-menu-btn';
  modeBtn.style.background = '#00897b';
  modeBtn.textContent = '🐣 Easy Mode (+ −)';
  gameButton(modeBtn, () => {
    menu.classList.remove('open');
    cb.onSetMode(latestState && latestState.mode === 'easy' ? 'normal' : 'easy');
  });

  // Skip to Endless: jump past the authored tutorial straight into the endless puzzles (main.ts
  // confirms). Hidden once she's already in endless (see update()). Uses the level-pill gradient so
  // it reads as "go play", like the ⭐ screen's Play again button.
  const skipBtn = document.createElement('button');
  skipBtn.className = 'bf-menu-btn';
  skipBtn.style.background = 'linear-gradient(135deg,#1e88e5,#7b2ff7)';
  skipBtn.textContent = 'Skip to Endless ⏩';
  gameButton(skipBtn, () => { menu.classList.remove('open'); cb.onSkipTutorial(); });

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

  menu.append(themeLabel, sel, modeBtn, skipBtn, clearMap, reset, acctLabel, whoami, logout, hint);

  gameButton(gearBtn, () => menu.classList.toggle('open'));
  // Click anywhere else closes the menu. gearBtn is excluded so its own click stays a pure toggle.
  document.addEventListener('pointerdown', (e) => {
    if (!menu.classList.contains('open')) return;
    const t = e.target as Node;
    if (!menu.contains(t) && !gearBtn.contains(t)) menu.classList.remove('open');
  });

  // ---------- ⭐ My Star Collection overlay (design: Fable pass) ----------
  // Static shell built once; the tiles / cheer / list / empty-state are (re)populated from live state
  // each time it opens (renderStars). Modal, above everything, closes on ✕ / backdrop / Escape.
  const overlay = document.createElement('div');
  overlay.className = 'bf-stars-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML =
    '<div class="bf-stars-panel">'
    + '<header class="bf-stars-head"><div>'
    + '<h2 class="bf-stars-title">⭐ My Star Collection</h2>'
    + '<div class="bf-stars-sub">Every puzzle you solve earns stars!</div>'
    + '</div><button class="bf-icon-btn bf-stars-close" aria-label="Close">✕</button></header>'
    + '<div class="bf-stars-tiles">'
    + '<div class="bf-stars-tile"><div class="bf-stars-tile-num" data-stat="solved">0</div><div class="bf-stars-tile-label">Puzzles Solved</div></div>'
    + '<div class="bf-stars-tile bf-stars-tile--gold"><div class="bf-stars-tile-num" data-stat="stars">0 ★</div><div class="bf-stars-tile-label">Stars Collected</div></div>'
    + '<div class="bf-stars-tile bf-stars-tile--green"><div class="bf-stars-tile-num" data-stat="perfect">0</div><div class="bf-stars-tile-label">Perfect Clears</div></div>'
    + '</div>'
    + '<div class="bf-stars-cheer"></div>'
    + '<ul class="bf-stars-list"></ul>'
    + '<nav class="bf-stars-pager"></nav>'
    + '<div class="bf-stars-empty" style="display:none">'
    + '<div class="bf-stars-empty-glyph">☆☆☆</div>'
    + '<div class="bf-stars-empty-head">Your stars are waiting!</div>'
    + "<p class=\"bf-stars-empty-text\">Finish the practice levels and you'll start collecting stars for every puzzle you solve.</p>"
    + '</div></div>';
  const q = <T extends Element>(sel: string) => overlay.querySelector(sel) as T;
  const listEl = q<HTMLUListElement>('.bf-stars-list');
  const pagerEl = q<HTMLElement>('.bf-stars-pager');
  const emptyEl = q<HTMLDivElement>('.bf-stars-empty');
  const cheerEl = q<HTMLDivElement>('.bf-stars-cheer');
  const PER_PAGE = 10;
  let starsPage = 0; // which page of the puzzle list is showing (reset to 0 each time it opens)

  const cheerLine = (solved: number, perfect: number): string =>
    perfect >= 10 ? "Ten perfect clears?! You're a star machine! 🌟"
    : perfect >= 3 ? `Wow — ${perfect} perfect clears. Amazing building!`
    : solved >= 1 ? 'Keep going — every star counts!'
    : '';

  // Render the whole collection from state's bestStars (endless levels only). Newest puzzle first.
  function renderStars(state: GameState): void {
    const entries = [...state.bestStars.entries()]
      .filter(([idx]) => idx >= ENDLESS_START)
      .sort((a, b) => b[0] - a[0]); // newest (highest index) first — feeds the LIST only
    // Totals come from lifetime counters, not `entries`, so they stay correct after bestStars is pruned.
    const solved = state.solvedCount;
    const stars = state.starsTotal;
    const perfect = state.perfectCount;

    q<HTMLDivElement>('[data-stat="solved"]').textContent = String(solved);
    q<HTMLDivElement>('[data-stat="stars"]').textContent = `${stars} ★`;
    q<HTMLDivElement>('[data-stat="perfect"]').textContent = String(perfect);
    cheerEl.textContent = cheerLine(solved, perfect);

    const has = solved > 0;
    listEl.style.display = has ? '' : 'none';
    emptyEl.style.display = has ? 'none' : '';

    // Paginate: 10 puzzles per page, with a numbered pager. Clamp the page in case the list shrank.
    const pageCount = Math.max(1, Math.ceil(entries.length / PER_PAGE));
    if (starsPage >= pageCount) starsPage = pageCount - 1;
    const pageEntries = entries.slice(starsPage * PER_PAGE, starsPage * PER_PAGE + PER_PAGE);

    listEl.replaceChildren();
    for (const [idx, st] of pageEntries) {
      const li = document.createElement('li');
      li.className = `bf-stars-row bf-stars-row--${st}`;
      // One line: a muted "Puzzle N" then a bold "Make T". Easy counts from 1; normal keeps its level number.
      const info = document.createElement('div');
      info.className = 'bf-stars-row-info';
      const num = document.createElement('span');
      num.className = 'bf-stars-row-num';
      num.textContent = `Puzzle ${state.mode === 'easy' ? idx - ENDLESS_START + 1 : idx + 1}`;
      const tgt = document.createElement('span');
      tgt.className = 'bf-stars-row-target';
      tgt.textContent = `Make ${formatValue(levelAt(idx, state.seed, state.mode).target)}`;
      info.append(num, tgt);
      const starsEl = document.createElement('div');
      starsEl.className = 'bf-stars-row-stars';
      starsEl.setAttribute('aria-label', `${st} of 3 stars`);
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.className = i < st ? 'bf-star on' : 'bf-star';
        s.textContent = i < st ? '★' : '☆';
        starsEl.appendChild(s);
      }
      const replay = document.createElement('button');
      replay.className = 'bf-stars-replay';
      replay.textContent = 'Play again';
      gameButton(replay, () => { cb.onReplay(idx); overlay.classList.remove('open'); });
      li.append(info, starsEl, replay);
      listEl.appendChild(li);
    }

    // Numbered pager (one button per 10 puzzles); hidden when everything fits on one page.
    pagerEl.replaceChildren();
    if (pageCount > 1) {
      for (let p = 0; p < pageCount; p++) {
        const b = document.createElement('button');
        b.className = 'bf-stars-page-btn' + (p === starsPage ? ' on' : '');
        b.textContent = String(p + 1);
        const page = p;
        gameButton(b, () => { starsPage = page; renderStars(state); });
        pagerEl.appendChild(b);
      }
    }
  }

  const closeStars = () => overlay.classList.remove('open');
  gameButton(starsBtn, () => {
    menu.classList.remove('open');
    starsPage = 0; // always open on the newest page
    if (latestState) renderStars(latestState);
    overlay.classList.add('open');
  });
  gameButton(q<HTMLButtonElement>('.bf-stars-close'), closeStars);
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) closeStars(); }); // backdrop click
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeStars(); });

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

  parent.append(bar, menu, hotbar, overlay);

  // ---------- per-frame state ----------
  let latestState: GameState | null = null; // most recent state, so the ⭐ overlay renders on open
  let lastMisses = 0;
  let lastParHtml = ''; // last painted golf-pill markup, so we only touch the DOM when it changes
  let flash = 0;   // frames remaining for the "Not yet" toast
  let grace = 0;   // frames after a level-up during which the "Not yet" flash is suppressed
  let toast = 0;   // frames remaining for the level-up toast

  return {
    update(state: GameState) {
      latestState = state; // so the ⭐ overlay can render the current collection when opened
      const idx = Math.max(0, Math.trunc(state.levelIndex));
      const isEndless = idx >= ENDLESS_START;
      let goal = '?';
      let required = 0;
      let par = 0;
      for (const b of state.buildings.values()) if (b.type === 'target') { goal = formatValue(b.target); required = b.required; par = b.par; break; }
      const easy = state.mode === 'easy';
      target.textContent = `Make ${goal}`;
      levelLabel.textContent = easy
        ? `Puzzle ${idx - ENDLESS_START + 1}` // easy counts from 1 (it lives in the endless range)
        : isEndless ? `Level ${idx + 1} · ∞` : `Level ${idx + 1}/${LEVELS.length}`;
      skipBtn.style.display = isEndless ? 'none' : ''; // "Skip to Endless" is pointless once endless
      modeBtn.textContent = easy ? '🔢 Normal Mode' : '🐣 Easy Mode (+ −)';

      // Live golf pill (endless puzzles only — the campaign isn't golfed): machines built so far vs
      // par + the star rating she's on track for. Rewrite the DOM only when the text actually changes
      // (update() runs every animation frame; innerHTML churn each frame is pure waste).
      if (isEndless) {
        const used = countMachines(state); // endless board starts empty, so this IS the puzzle's cost
        const proj = par > 0 ? starsFor(used, par) : 3;
        const html = `⚙️ ${used}/${par} &nbsp;` + '★'.repeat(proj) + `<span class="bf-par-off">${'★'.repeat(3 - proj)}</span>`;
        if (html !== lastParHtml) {
          parPill.className = `bf-pill bf-pill--par bf-par--${proj}`;
          parPill.innerHTML = html;
          lastParHtml = html;
        }
        parPill.style.display = '';
      } else if (parPill.style.display !== 'none') {
        parPill.style.display = 'none';
        lastParHtml = '';
      }

      // show only the operator slots this mode/level allows; easy also hides the x² (multiply) tool.
      const availOps = opsForLevel(idx, state.mode);
      for (const { def, el } of slotEls) {
        if (def.kind === 'op') el.style.display = availOps.includes(def.op) ? 'flex' : 'none';
        else if (def.tool === 'square') el.style.display = easy ? 'none' : 'flex';
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
    // True while the ⭐ overlay is open, so main.ts can swallow game hotkeys behind the modal.
    isModalOpen(): boolean { return overlay.classList.contains('open'); },
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
