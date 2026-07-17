import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, resetGame, ensureChunksInRange } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { TARGET_COUNT, TUNNEL_REACH } from './content/config';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import type { GameState, Direction } from './sim/grid';
import { DELTA } from './sim/grid';
import {
  paintBeltLine, eraseLine, placeMiner, placeOperator, placeSplitter, placeTunnel,
  canPlaceMiner, canPlaceOperator, ROTATE_CW,
} from './input/place';
import { showLogin } from './ui/login';
import { createHud } from './ui/hud';
import type { Tool } from './ui/hud';
import { apiMe, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

// A corrupt / partial / incompatible (v1) save must never brick the game — fall
// back to a fresh world instead of throwing to a blank screen.
function loadOrNewGame(saved: string | null): GameState {
  if (saved) {
    try {
      const s = deserialize(saved);
      if (Array.isArray(s.items) && s.belts instanceof Map && s.buildings instanceof Map
        && s.nodes instanceof Map && s.loadedChunks instanceof Set) { healLevel(s); return s; }
    } catch {
      // unreadable / old-version save -> start fresh
    }
    console.warn('Ignoring an unreadable save; starting a new game.');
  }
  return newGame(Date.now() >>> 0, mvpGenerator);
}

// Repair older/partial saves so the level goal is never undefined.
function healLevel(s: GameState): void {
  if (typeof s.delivered !== 'number') s.delivered = 0;
  for (const b of s.buildings.values()) {
    if (b.type === 'target' && typeof b.required !== 'number') b.required = TARGET_COUNT;
  }
}

async function boot() {
  if (!(await apiMe())) await showLogin(parent);
  const state: GameState = loadOrNewGame(await apiGetState());

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);
  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  let placeDir: Direction = 'right';
  let tool: Tool = 'belt';
  let hover: { x: number; y: number } | null = null;
  let pendingTunnel: { x: number; y: number } | null = null; // entrance awaiting its exit
  let beltAnchor: { x: number; y: number } | null = null;    // first click of a belt segment
  const hud = createHud(
    parent,
    (t) => { theme = t; renderer.setTheme(t); },
    (d) => { placeDir = d; },
    (tl) => { tool = tl; pendingTunnel = null; beltAnchor = null; },
    () => {
      if (!confirm('Start this level over? This clears everything you built.')) return;
      resetGame(state, Date.now() >>> 0, mvpGenerator);
      dirty = true;
      apiSaveState(serialize(state)); // overwrite the old save right away
    },
  );

  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  const cellOf = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  };

  // Belts drag-to-paint; buildings are single centered clicks; right-drag erases.
  // Belts support press-and-drag AND click-start / click-end: after one click, a second
  // click paints an oriented line to it. Other tools are single clicks; right-drag erases.
  let paintMode: 'place' | 'erase' | null = null;
  let lastCell: { x: number; y: number } | null = null;
  let downCell: { x: number; y: number } | null = null;
  let anchorAtDown: { x: number; y: number } | null = null;
  let dragMoved = false;
  canvas.addEventListener('mousedown', (e) => {
    const c = cellOf(e);
    if (e.button === 2) { paintMode = 'erase'; beltAnchor = null; eraseLine(state, c.x, c.y, c.x, c.y); lastCell = c; }
    else if (tool === 'belt') {
      paintMode = 'place'; downCell = c; anchorAtDown = beltAnchor; dragMoved = false; lastCell = c;
      paintBeltLine(state, c.x, c.y, c.x, c.y, placeDir); // immediate single-belt feedback
    }
    else if (tool === 'miner') { placeMiner(state, c.x, c.y, placeDir); paintMode = null; lastCell = null; }
    else if (tool === 'operator') { placeOperator(state, c.x, c.y, placeDir); paintMode = null; lastCell = null; }
    else if (tool === 'splitter') { placeSplitter(state, c.x, c.y, placeDir); paintMode = null; lastCell = null; }
    else { placeTunnelTool(c); paintMode = null; lastCell = null; } // tunnel
    dirty = true; e.preventDefault();
  });

  // Tunnel tool: first click drops an entrance; a click ahead (same facing, in reach) drops the paired exit.
  function placeTunnelTool(c: { x: number; y: number }) {
    const d = DELTA[placeDir];
    if (pendingTunnel) {
      const dx = c.x - pendingTunnel.x, dy = c.y - pendingTunnel.y;
      const ahead = d.dx !== 0
        ? dy === 0 && Math.sign(dx) === Math.sign(d.dx) && Math.abs(dx) >= 1 && Math.abs(dx) <= TUNNEL_REACH
        : dx === 0 && Math.sign(dy) === Math.sign(d.dy) && Math.abs(dy) >= 1 && Math.abs(dy) <= TUNNEL_REACH;
      if (ahead && placeTunnel(state, c.x, c.y, placeDir, 'out')) { pendingTunnel = null; beltAnchor = null; return; }
    }
    if (placeTunnel(state, c.x, c.y, placeDir, 'in')) pendingTunnel = c;
  }
  canvas.addEventListener('mousemove', (e) => {
    const c = cellOf(e); hover = c;
    if (!paintMode || !lastCell) return;
    if (c.x === lastCell.x && c.y === lastCell.y) return;
    dragMoved = true;
    if (paintMode === 'erase') eraseLine(state, lastCell.x, lastCell.y, c.x, c.y);
    else paintBeltLine(state, lastCell.x, lastCell.y, c.x, c.y, placeDir);
    lastCell = c; dirty = true;
  });
  const endPaint = () => {
    if (paintMode === 'place' && tool === 'belt' && downCell) {
      if (dragMoved) {
        beltAnchor = null; // a drag is a complete line
      } else if (anchorAtDown && (anchorAtDown.x !== downCell.x || anchorAtDown.y !== downCell.y)) {
        paintBeltLine(state, anchorAtDown.x, anchorAtDown.y, downCell.x, downCell.y, placeDir); // click1 -> click2
        beltAnchor = null; // segment complete
        dirty = true;
      } else {
        beltAnchor = downCell; // first click; anchor here for the next click
      }
    }
    paintMode = null; lastCell = null; downCell = null; dragMoved = false;
  };
  window.addEventListener('mouseup', endPaint);
  canvas.addEventListener('mouseleave', () => { endPaint(); hover = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    cam.zoom = Math.max(12, Math.min(96, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    renderer.setCamera(cam); e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') { placeDir = ROTATE_CW[placeDir]; hud.setDir(placeDir); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '1') { tool = 'belt'; hud.setTool('belt'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '2') { tool = 'miner'; hud.setTool('miner'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '3') { tool = 'operator'; hud.setTool('operator'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '4') { tool = 'splitter'; hud.setTool('splitter'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '5') { tool = 'tunnel'; hud.setTool('tunnel'); pendingTunnel = null; beltAnchor = null; return; }
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
    const cr = renderer.visibleChunkRange();
    ensureChunksInRange(state, mvpGenerator, cr.minCx, cr.minCy, cr.maxCx, cr.maxCy);
    // placement ghost for the building tools
    if (tool === 'belt' || tool === 'splitter' || tool === 'tunnel' || !hover) {
      renderer.setPreview(null); // 1x1 tools: no 3x3 ghost
    } else {
      const ok = tool === 'miner' ? canPlaceMiner(state, hover.x, hover.y) : canPlaceOperator(state, hover.x, hover.y);
      renderer.setPreview({ type: tool, ox: hover.x - 1, oy: hover.y - 1, dir: placeDir, valid: ok });
    }
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
