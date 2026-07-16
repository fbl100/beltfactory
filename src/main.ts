import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, ensureChunksInRange } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import type { GameState } from './sim/grid';
import type { Direction } from './sim/grid';
import { paintBeltLine, eraseBeltLine } from './input/place';
import { showLogin } from './ui/login';
import { createHud } from './ui/hud';
import { apiMe, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

// Be forgiving: a corrupt / truncated / incompatible save must never brick the game
// (blank screen). Fall back to a fresh world instead of throwing.
function loadOrNewGame(saved: string | null): GameState {
  if (saved) {
    try {
      const s = deserialize(saved);
      if (Array.isArray(s.items) && s.cells instanceof Map && s.loadedChunks instanceof Set) return s;
    } catch {
      // unreadable save -> start fresh
    }
    console.warn('Ignoring an unreadable save; starting a new game.');
  }
  return newGame(Date.now() >>> 0, mvpGenerator);
}

async function boot() {
  if (!(await apiMe())) await showLogin(parent);

  const saved = await apiGetState();
  // A new game seeds from the current clock; resumed games keep their saved seed.
  const state: GameState = loadOrNewGame(saved);

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);

  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  let placeDir: Direction = 'right';
  const hud = createHud(parent, (t) => { theme = t; renderer.setTheme(t); }, (d) => { placeDir = d; });

  // --- input: place/remove belts, pan (arrows), zoom (wheel) ---
  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  const cellOf = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  };
  // Click-and-drag to paint a belt run (belts orient along the drag); right-drag erases.
  let paintMode: 'place' | 'erase' | null = null;
  let lastCell: { x: number; y: number } | null = null;
  canvas.addEventListener('mousedown', (e) => {
    const c = cellOf(e);
    paintMode = e.button === 2 ? 'erase' : 'place';
    if (paintMode === 'erase') eraseBeltLine(state, c.x, c.y, c.x, c.y);
    else paintBeltLine(state, c.x, c.y, c.x, c.y, placeDir);
    lastCell = c; dirty = true; e.preventDefault();
  });
  canvas.addEventListener('mousemove', (e) => {
    if (!paintMode || !lastCell) return;
    const c = cellOf(e);
    if (c.x === lastCell.x && c.y === lastCell.y) return;
    if (paintMode === 'erase') eraseBeltLine(state, lastCell.x, lastCell.y, c.x, c.y);
    else paintBeltLine(state, lastCell.x, lastCell.y, c.x, c.y, placeDir);
    lastCell = c; dirty = true;
  });
  const endPaint = () => { paintMode = null; lastCell = null; };
  window.addEventListener('mouseup', endPaint);
  canvas.addEventListener('mouseleave', endPaint);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    cam.zoom = Math.max(12, Math.min(96, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    renderer.setCamera(cam); e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    const pan: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const d = pan[e.key];
    if (d) { cam.x += d[0]; cam.y += d[1]; renderer.setCamera(cam); }
  });

  // --- fixed-timestep sim loop + rAF render ---
  const tickMs = 1000 / TICKS_PER_SECOND;
  const MAX_CATCHUP = tickMs * 5; // avoid a tick "spiral of death" after the tab is backgrounded
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc = Math.min(acc + (now - last), MAX_CATCHUP); last = now;
    while (acc >= tickMs) { step(state); acc -= tickMs; dirty = true; }
    // stream in any chunks the camera can now see (empty land for MVP)
    const cr = renderer.visibleChunkRange();
    ensureChunksInRange(state, mvpGenerator, cr.minCx, cr.minCy, cr.maxCx, cr.maxCy);
    renderer.draw(state, Math.min(acc / tickMs, 1));
    hud.update(state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // --- autosave every 3s if changed, and on exit ---
  setInterval(() => { if (dirty) { apiSaveState(serialize(state)); dirty = false; } }, 3000);
  window.addEventListener('beforeunload', () => {
    navigator.sendBeacon('/api/save', new Blob([serialize(state)], { type: 'application/json' }));
  });
}

boot().catch((err) => {
  console.error('Belt Factory failed to start', err);
  parent.textContent = 'Something went wrong starting the game. Please refresh.';
});
