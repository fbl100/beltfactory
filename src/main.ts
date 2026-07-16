import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, ensureChunksInRange } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import type { GameState } from './sim/grid';
import type { Direction } from './sim/grid';
import { placeBelt, removeCell } from './input/place';
import { showLogin } from './ui/login';
import { createHud } from './ui/hud';
import { apiMe, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

async function boot() {
  if (!(await apiMe())) await showLogin(parent);

  const saved = await apiGetState();
  // A new game seeds from the current clock; resumed games keep their saved seed.
  const state: GameState = saved ? deserialize(saved) : newGame(Date.now() >>> 0, mvpGenerator);

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);

  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  let placeDir: Direction = 'right';
  const hud = createHud(parent, (t) => { theme = t; renderer.setTheme(t); }, (d) => { placeDir = d; });

  // --- input: place/remove belts, pan (arrows), zoom (wheel) ---
  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  canvas.addEventListener('mousedown', (e) => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
    if (e.button === 2) removeCell(state, x, y);
    else placeBelt(state, x, y, placeDir);
    dirty = true;
    e.preventDefault();
  });
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
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc += now - last; last = now;
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

boot();
