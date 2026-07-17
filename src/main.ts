import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, resetGame, clearBuild, ensureChunksInRange } from './sim/world';
import { mvpGenerator } from './content/worldgen';
import { opsForLevel } from './content/levels';
import type { OpId } from './content/operations';
import { TUNNEL_REACH } from './content/config';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import { reconcileLevel } from './sim/progression';
import type { GameState, Direction } from './sim/grid';
import { DELTA, parseKey } from './sim/grid';
import {
  paintBeltLine, eraseLine, placeOperator, placeSplitter, placeTunnel,
  canPlaceOperator, ROTATE_CW,
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
        && s.nodes instanceof Map && s.loadedChunks instanceof Set) { reconcileLevel(s); return s; }
    } catch {
      // unreadable / old-version save -> start fresh
    }
    console.warn('Ignoring an unreadable save; starting a new game.');
  }
  return newGame(Date.now() >>> 0, mvpGenerator);
}

async function boot() {
  if (!(await apiMe())) await showLogin(parent);
  const state: GameState = loadOrNewGame(await apiGetState());

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);
  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  // When a level-up reveals a new number deposit, nudge the camera to it if it isn't already
  // comfortably in view — so she never has to hunt off-screen for the new number.
  let lastLevelIndex = state.levelIndex;
  const seenNodeKeys = new Set(state.nodes.keys());
  function ensureNodeVisible(nx: number, ny: number): void {
    const b = renderer.visibleCellBounds();
    const m = 2; // keep the whole 3x3 miner spot in view, not just the center
    if (nx - 1 < b.minX + m || nx + 1 > b.maxX - m || ny - 1 < b.minY + m || ny + 1 > b.maxY - m) {
      cam.x = nx; cam.y = ny; renderer.setCamera(cam);
    }
  }

  let placeDir: Direction = 'right';
  let tool: Tool = 'belt';
  let hover: { x: number; y: number } | null = null;
  let pendingTunnel: { x: number; y: number } | null = null; // entrance awaiting its exit
  let beltAnchor: { x: number; y: number } | null = null;    // first click of a belt segment
  const hud = createHud(
    parent,
    (t) => { theme = t; renderer.setTheme(t); },
    (tl) => { tool = tl; pendingTunnel = null; beltAnchor = null; },
    () => {
      if (!confirm('Start over from Level 1? This wipes ALL progress and everything you built.')) return;
      resetGame(state, Date.now() >>> 0, mvpGenerator);
      lastLevelIndex = state.levelIndex;
      seenNodeKeys.clear();
      for (const k of state.nodes.keys()) seenNodeKeys.add(k);
      dirty = true;
      apiSaveState(serialize(state)); // overwrite the old save right away
    },
    () => {
      if (!confirm('Clear everything you built on this level? You keep the level and its goal.')) return;
      clearBuild(state);
      dirty = true;
      apiSaveState(serialize(state)); // persist the cleared build
    },
  );

  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  const cellOf = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  };

  // The operator type to build: the HUD's selected op, gated to what this level has unlocked.
  const currentOp = (): OpId => {
    const op = hud.getOp();
    return opsForLevel(state.levelIndex).includes(op) ? op : 'add';
  };

  // Belts drag-to-paint; buildings are single centered clicks; right-drag erases.
  // Belts support press-and-drag AND click-start / click-end: after one click, a second
  // click paints an oriented line to it. Other tools are single clicks; right-drag erases.
  let paintMode: 'place' | 'erase' | null = null;
  let lastCell: { x: number; y: number } | null = null;
  let downCell: { x: number; y: number } | null = null;
  let anchorAtDown: { x: number; y: number } | null = null;
  let dragMoved = false;
  // Pan-by-drag: middle-button drag, or space-held left drag. Records the grab origin (screen px)
  // and the camera at grab time; mousemove then drags the world under the cursor.
  let panning: { sx: number; sy: number; camX: number; camY: number } | null = null;
  let spaceDown = false;
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      panning = { sx: e.clientX, sy: e.clientY, camX: cam.x, camY: cam.y };
      canvas.style.cursor = 'grabbing'; e.preventDefault(); return;
    }
    const c = cellOf(e);
    if (e.button === 2 || tool === 'eraser') { paintMode = 'erase'; beltAnchor = null; eraseLine(state, c.x, c.y, c.x, c.y); lastCell = c; }
    else if (tool === 'belt') {
      paintMode = 'place'; downCell = c; anchorAtDown = beltAnchor; dragMoved = false; lastCell = c;
      paintBeltLine(state, c.x, c.y, c.x, c.y, placeDir); // immediate single-belt feedback
    }
    else if (tool === 'operator') { placeOperator(state, c.x, c.y, placeDir, currentOp()); paintMode = null; lastCell = null; }
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
    if (panning) { // drag the world under the cursor
      cam.x = panning.camX - (e.clientX - panning.sx) / cam.zoom;
      cam.y = panning.camY - (e.clientY - panning.sy) / cam.zoom;
      renderer.setCamera(cam); return;
    }
    const c = cellOf(e); hover = c;
    if (!paintMode || !lastCell) return;
    if (c.x === lastCell.x && c.y === lastCell.y) return;
    dragMoved = true;
    if (paintMode === 'erase') eraseLine(state, lastCell.x, lastCell.y, c.x, c.y);
    else paintBeltLine(state, lastCell.x, lastCell.y, c.x, c.y, placeDir);
    lastCell = c; dirty = true;
  });
  const endPaint = () => {
    if (panning) { panning = null; canvas.style.cursor = spaceDown ? 'grab' : ''; return; }
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
    // Trackpad pinch (and ctrl+wheel) zoom; plain two-finger scroll pans (Mac-native canvas feel).
    if (e.ctrlKey) {
      cam.zoom = Math.max(12, Math.min(96, cam.zoom * (e.deltaY < 0 ? 1.05 : 0.95)));
    } else {
      cam.x += e.deltaX / cam.zoom;
      cam.y += e.deltaY / cam.zoom;
    }
    renderer.setCamera(cam); e.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ') { spaceDown = true; if (!panning) canvas.style.cursor = 'grab'; e.preventDefault(); return; } // hold space, drag to pan
    if (e.key === '+' || e.key === '=') { cam.zoom = Math.min(96, cam.zoom * 1.1); renderer.setCamera(cam); return; }
    if (e.key === '-' || e.key === '_') { cam.zoom = Math.max(12, cam.zoom * 0.9); renderer.setCamera(cam); return; }
    if (e.key === 'r' || e.key === 'R') { placeDir = ROTATE_CW[placeDir]; pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '1') { tool = 'belt'; hud.setTool('belt'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '3') { tool = 'operator'; hud.setTool('operator'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '4') { tool = 'splitter'; hud.setTool('splitter'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '5') { tool = 'tunnel'; hud.setTool('tunnel'); pendingTunnel = null; beltAnchor = null; return; }
    if (e.key === '6') { tool = 'eraser'; hud.setTool('eraser'); pendingTunnel = null; beltAnchor = null; return; }
    const pan: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const d = pan[e.key];
    if (d) { cam.x += d[0]; cam.y += d[1]; renderer.setCamera(cam); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; if (!panning) canvas.style.cursor = ''; } });

  // --- fixed-timestep sim loop + rAF render ---
  const tickMs = 1000 / TICKS_PER_SECOND;
  const MAX_CATCHUP = tickMs * 5; // avoid a tick "spiral of death" after the tab is backgrounded
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc = Math.min(acc + (now - last), MAX_CATCHUP); last = now;
    while (acc >= tickMs) { step(state); acc -= tickMs; dirty = true; }
    // A level-up may have granted a new deposit; bring it into view if it's off-screen.
    if (state.levelIndex !== lastLevelIndex) {
      lastLevelIndex = state.levelIndex;
      for (const k of state.nodes.keys()) {
        if (!seenNodeKeys.has(k)) { seenNodeKeys.add(k); const p = parseKey(k); ensureNodeVisible(p.x, p.y); }
      }
    }
    const cr = renderer.visibleChunkRange();
    ensureChunksInRange(state, mvpGenerator, cr.minCx, cr.minCy, cr.maxCx, cr.maxCy);
    // placement ghost for the building tools
    if (tool !== 'operator' || !hover) {
      renderer.setPreview(null); // 1x1 tools + eraser: no 3x3 ghost (only the operator is a building now)
    } else {
      const ok = canPlaceOperator(state, hover.x, hover.y, placeDir);
      // A 1x3 operator's bar lies perpendicular to its output dir.
      const horizBar = placeDir === 'up' || placeDir === 'down';
      const vertBar = placeDir === 'left' || placeDir === 'right';
      const w = horizBar ? 3 : 1;
      const h = vertBar ? 3 : 1;
      const ox = hover.x - (w === 3 ? 1 : 0);
      const oy = hover.y - (h === 3 ? 1 : 0);
      renderer.setPreview({ type: tool, ox, oy, w, h, dir: placeDir, valid: ok });
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
