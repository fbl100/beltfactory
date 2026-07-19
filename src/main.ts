import { createPixiRenderer } from './render/pixi-renderer';
import { DEFAULT_THEME } from './render/themes';
import type { Theme, Camera } from './render/renderer';
import { newGame, resetGame, clearBuild, ensureChunksInRange } from './sim/world';
import { makeGenerator } from './content/worldgen';
import { opsForLevel, ENDLESS_START, EASY_SUB_UNLOCK } from './content/levels';
import type { Mode } from './content/levels';
import type { OpId } from './content/operations';
import { TUNNEL_REACH } from './content/config';
import { serialize, deserialize } from './sim/save';
import { step, TICKS_PER_SECOND } from './sim/tick';
import { reconcileLevel, startReplay, skipTutorial } from './sim/progression';
import type { GameState, Direction } from './sim/grid';
import { DELTA, parseKey } from './sim/grid';
import {
  paintBeltLine, eraseLine, placeOperator, placeSplitter, placeTunnel, placeSquare,
  canPlaceOperator, canPlaceSquare, operatorFootprintCells, squareFootprintCells, ROTATE_CW,
} from './input/place';
import { centerOf } from './sim/buildings';
import { celebrate } from './ui/celebrate';
import { showLogin } from './ui/login';
import { createHud, TOOL_HOTKEYS, OP_HOTKEYS } from './ui/hud';
import type { Tool } from './ui/hud';
import { formatValue } from './render/format';
import { cursorFor, PAN, PANNING } from './input/cursors';
import { createSfx } from './audio/sfx';
import { createSoundDirector } from './audio/director';
import { apiMe, apiLogout, apiGetState, apiSaveState } from './net/api';

const parent = document.getElementById('app')!;

// A corrupt / partial / incompatible (v1) save must never brick the game — fall back to a fresh
// world instead of throwing to a blank screen. `mode` seeds a BRAND-NEW game (the account's sign-up
// choice); an existing save carries its own mode, so it wins when present.
function loadOrNewGame(saved: string | null, mode: Mode): GameState {
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
  const fresh = newGame(Date.now() >>> 0, makeGenerator(mode), mode);
  reconcileLevel(fresh); // sync the hub's par + golf baseline for the starting level
  return fresh;
}

async function boot() {
  let me = await apiMe();
  if (!me) { await showLogin(parent); me = await apiMe(); }
  const username = me?.username;
  const state: GameState = loadOrNewGame(await apiGetState(), me?.mode ?? 'normal');
  // The chunk generator must match the save's mode (its origin deposits + goal differ per mode).
  let gen = makeGenerator(state.mode);

  let theme: Theme = DEFAULT_THEME;
  const renderer = createPixiRenderer(parent);
  await renderer.init(theme);
  const cam: Camera = { x: 8, y: 6, zoom: 44 };
  renderer.setCamera(cam);

  // When a level-up reveals a new number deposit, nudge the camera to it if it isn't already
  // comfortably in view — so she never has to hunt off-screen for the new number.
  let lastLevelIndex = state.levelIndex;
  // True from when a replay is started until its return fires P3, so the level-up handler can show a
  // "back home" toast instead of a false "new level" one. Reset on any non-replay jump (reset/skip).
  let replayActive = false;
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
  // Sound: a decoupled synth + a director that watches state deltas (deliveries, misses,
  // level-ups) and is told about place/erase actions. The sim never imports either. Created
  // BEFORE the HUD because the HUD's mute button drives it. The AudioContext must be created on
  // a user gesture (autoplay policy) and re-resumed after iPad Safari backgrounds it.
  const sfx = createSfx();
  const sound = createSoundDirector(sfx);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.unlock(); });

  const hud = createHud(parent, {
    onTheme: (t) => { theme = t; renderer.setTheme(t); },
    onTool: (tl) => { tool = tl; pendingTunnel = null; beltAnchor = null; updateCursor(); },
    onReset: () => {
      if (!confirm('Start over from Level 1? This wipes ALL progress and everything you built.')) return;
      resetGame(state, Date.now() >>> 0, gen, state.mode);
      reconcileLevel(state); // re-sync the hub's par + golf baseline after the wipe
      lastLevelIndex = state.levelIndex;
      replayActive = false;
      seenNodeKeys.clear();
      for (const k of state.nodes.keys()) seenNodeKeys.add(k);
      dirty = true;
      apiSaveState(serialize(state)); // overwrite the old save right away
    },
    onClearMap: () => {
      if (!confirm('Clear everything you built on this level? You keep the level and its goal.')) return;
      clearBuild(state);
      dirty = true;
      apiSaveState(serialize(state)); // persist the cleared build
    },
    // Replay a past endless puzzle (from the ⭐ My Puzzles screen). startReplay jumps the hub to that
    // level on a fresh board and remembers home; finishing it returns her. Sync lastLevelIndex to the
    // (backward) jump so the single level-up source (P3) doesn't misfire now but DOES fire on return.
    onReplay: (index: number) => {
      startReplay(state, index);
      lastLevelIndex = state.levelIndex;
      replayActive = true; // the eventual return-to-home should read as "replay done", not a level-up
      for (const k of state.nodes.keys()) seenNodeKeys.add(k);
      dirty = true;
      apiSaveState(serialize(state));
    },
    // Skip the authored tutorial and jump straight into endless puzzles. skipTutorial backfills the
    // missing deposits ({2,3,5,7}) and points the hub at the first endless goal on a fresh board.
    onSkipTutorial: () => {
      if (state.levelIndex >= ENDLESS_START) return;
      if (!confirm('Skip the practice levels and jump straight to endless puzzles?')) return;
      skipTutorial(state);
      lastLevelIndex = state.levelIndex; // suppress the level-up celebration for this deliberate jump
      replayActive = false;
      for (const k of state.nodes.keys()) seenNodeKeys.add(k);
      dirty = true;
      apiSaveState(serialize(state));
    },
    // Switch difficulty (Easy + − / Normal). Different modes are different progressions, so this starts
    // a fresh game in the chosen mode with a matching generator. lastLevelIndex/replay reset like Start Over.
    onSetMode: (mode) => {
      if (state.mode === mode) return;
      const label = mode === 'easy' ? 'Easy (＋ −, for a little kid)' : 'Normal';
      if (!confirm(`Switch to ${label} mode? This starts a fresh game and replaces what's on this account.`)) return;
      gen = makeGenerator(mode);
      resetGame(state, Date.now() >>> 0, gen, mode);
      reconcileLevel(state);
      lastLevelIndex = state.levelIndex;
      replayActive = false;
      tool = 'belt'; hud.setTool('belt'); pendingTunnel = null; beltAnchor = null; updateCursor(); // don't carry a now-hidden tool (e.g. x²) into the new mode
      seenNodeKeys.clear();
      for (const k of state.nodes.keys()) seenNodeKeys.add(k);
      dirty = true;
      apiSaveState(serialize(state));
    },
    // The HUD's 🔊 button drives the Sfx that lives here; it paints itself from the return value.
    onMuteToggle: () => { sfx.unlock(); return sfx.toggleMuted(); },
    isMuted: () => sfx.isMuted(),
    username: username ?? 'player',
    onLogout: () => {
      if (!confirm('Log out? Your progress is saved.')) return;
      apiLogout().then(() => location.reload()); // reload drops back to the login screen
    },
  });

  const canvas = renderer['app'].canvas as HTMLCanvasElement;
  const cellOf = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return renderer.screenToWorld(e.clientX - r.left, e.clientY - r.top);
  };

  // Pan-by-drag: middle-button drag, or space-held left drag. Records the grab origin (screen px)
  // and the camera at grab time; mousemove then drags the world under the cursor.
  let panning: { sx: number; sy: number; camX: number; camY: number } | null = null;
  let spaceDown = false;
  // Single source of truth for the canvas cursor. Precedence: active pan > armed pan >
  // right-drag erase > the selected tool's glyph. Every state change that affects the cursor
  // (tool/op switch, space, pan start/end, right-drag) calls this instead of writing cursor directly.
  let rightErasing = false;
  function updateCursor(): void {
    canvas.style.cursor = panning ? PANNING
      : spaceDown ? PAN
      : rightErasing ? cursorFor('eraser', hud.getOp())
      : cursorFor(tool, hud.getOp());
  }
  updateCursor(); // initial cursor for the boot tool (belt)

  // F6: a short sim freeze on level-up so the celebration reads. While paused the tick loop stops
  // advancing and input handlers early-return, but rAF keeps drawing so confetti animates.
  let pauseUntil = 0; // performance.now() timestamp the freeze ends at
  const isPaused = () => performance.now() < pauseUntil;

  // The operator type to build: the HUD's selected op, gated to what this level has unlocked.
  const currentOp = (): OpId => {
    const op = hud.getOp();
    return opsForLevel(state.levelIndex, state.mode).includes(op) ? op : 'add';
  };

  // Belts drag-to-paint; buildings are single centered clicks; right-drag erases.
  // Belts support press-and-drag AND click-start / click-end: after one click, a second
  // click paints an oriented line to it. Other tools are single clicks; right-drag erases.
  let paintMode: 'place' | 'erase' | null = null;
  let lastCell: { x: number; y: number } | null = null;
  let downCell: { x: number; y: number } | null = null;
  let anchorAtDown: { x: number; y: number } | null = null;
  let dragMoved = false;

  // Placement grace for the renderer's dead-end warning. cellKey -> performance.now() (ms) when the
  // cell was last painted/placed. This is a RENDER hint ONLY: it never touches sim state, so the sim
  // stays pure and deterministic. Entries are read against a time window and forgotten lazily.
  const GRACE_MS = 1000;
  const paintedAt = new Map<string, number>();
  const stampPainted = (cells: { x: number; y: number }[]) => {
    const now = performance.now();
    for (const c of cells) paintedAt.set(`${c.x},${c.y}`, now);
  };
  // Suppress the dead-end warning on cells the player is actively working on: recently painted/placed,
  // or (belt tool) the cell under the cursor — the belt analogue of an operator's placement ghost.
  // Set once; the closure reads tool/hover/paintedAt live each frame (no per-frame allocation).
  renderer.setDeadEndGrace((x, y) => {
    if (tool === 'belt' && hover && x === hover.x && y === hover.y) return true;
    const at = paintedAt.get(`${x},${y}`);
    return at !== undefined && performance.now() - at < GRACE_MS;
  });

  canvas.addEventListener('mousedown', (e) => {
    if (isPaused()) return; // frozen during the level-up celebration (F6)
    sfx.unlock(); // first gesture unlocks Web Audio
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      panning = { sx: e.clientX, sy: e.clientY, camX: cam.x, camY: cam.y };
      updateCursor(); e.preventDefault(); return;
    }
    const c = cellOf(e);
    if (e.button === 2 || tool === 'eraser') { paintMode = 'erase'; beltAnchor = null; if (e.button === 2) { rightErasing = true; updateCursor(); } eraseLine(state, c.x, c.y, c.x, c.y); lastCell = c; sound.erased(); }
    else if (tool === 'belt') {
      paintMode = 'place'; downCell = c; anchorAtDown = beltAnchor; dragMoved = false; lastCell = c;
      stampPainted(paintBeltLine(state, c.x, c.y, c.x, c.y, placeDir)); // immediate single-belt feedback
      sound.belt();
    }
    else if (tool === 'operator') { if (placeOperator(state, c.x, c.y, placeDir, currentOp())) { sound.built(); stampPainted(operatorFootprintCells(c.x, c.y, placeDir)); } paintMode = null; lastCell = null; }
    else if (tool === 'square' && state.mode !== 'easy') { if (placeSquare(state, c.x, c.y, placeDir)) { sound.built(); stampPainted(squareFootprintCells(c.x, c.y, placeDir)); } paintMode = null; lastCell = null; } // x² is a multiply-family tool — never in easy mode
    else if (tool === 'splitter') { if (placeSplitter(state, c.x, c.y, placeDir)) sound.built(); paintMode = null; lastCell = null; }
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
      if (ahead && placeTunnel(state, c.x, c.y, placeDir, 'out')) { pendingTunnel = null; beltAnchor = null; sound.built(); return; }
    }
    if (placeTunnel(state, c.x, c.y, placeDir, 'in')) { pendingTunnel = c; sound.built(); }
  }
  canvas.addEventListener('mousemove', (e) => {
    if (isPaused()) return; // frozen during the level-up celebration (F6)
    if (panning) { // drag the world under the cursor
      cam.x = panning.camX - (e.clientX - panning.sx) / cam.zoom;
      cam.y = panning.camY - (e.clientY - panning.sy) / cam.zoom;
      renderer.setCamera(cam); return;
    }
    const c = cellOf(e); hover = c;
    if (!paintMode || !lastCell) return;
    if (c.x === lastCell.x && c.y === lastCell.y) return;
    dragMoved = true;
    if (paintMode === 'erase') { eraseLine(state, lastCell.x, lastCell.y, c.x, c.y); sound.erased(); }
    else { stampPainted(paintBeltLine(state, lastCell.x, lastCell.y, c.x, c.y, placeDir)); sound.belt(); }
    lastCell = c; dirty = true;
  });
  const endPaint = () => {
    if (panning) { panning = null; updateCursor(); return; }
    if (rightErasing) { rightErasing = false; updateCursor(); }
    if (paintMode === 'place' && tool === 'belt' && downCell) {
      if (dragMoved) {
        beltAnchor = null; // a drag is a complete line
      } else if (anchorAtDown && (anchorAtDown.x !== downCell.x || anchorAtDown.y !== downCell.y)) {
        stampPainted(paintBeltLine(state, anchorAtDown.x, anchorAtDown.y, downCell.x, downCell.y, placeDir)); // click1 -> click2
        beltAnchor = null; // segment complete
        sound.belt();
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
    if (isPaused()) { e.preventDefault(); return; } // frozen during the level-up celebration (F6)
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
    if (isPaused()) return; // frozen during the level-up celebration (F6); celebrate.ts handles dismiss
    if (hud.isModalOpen()) return; // ⭐ My Stars overlay is modal — don't let build/pan hotkeys leak through
    sfx.unlock(); // first gesture unlocks Web Audio
    if (e.key === 'm' || e.key === 'M') { sfx.toggleMuted(); hud.setMuted(sfx.isMuted()); return; }
    if (e.key === ' ') { spaceDown = true; updateCursor(); e.preventDefault(); return; } // hold space, drag to pan
    if (e.key === '+' || e.key === '=') { cam.zoom = Math.min(96, cam.zoom * 1.1); renderer.setCamera(cam); return; }
    if (e.key === '-' || e.key === '_') { cam.zoom = Math.max(12, cam.zoom * 0.9); renderer.setCamera(cam); return; }
    if (e.key === 'r' || e.key === 'R') { placeDir = ROTATE_CW[placeDir]; pendingTunnel = null; beltAnchor = null; return; }
    // Build hotkeys — the map lives in hud.ts (TOOL_HOTKEYS/OP_HOTKEYS, derived from the hotbar
    // slots) so a slot's key badge and the key we listen for can't drift:
    // 1 Belt · 2 Split · 3 Tunnel · 4–7 the ops · 0 Erase.
    const hotTool = TOOL_HOTKEYS[e.key];
    if (hotTool) {
      if (hotTool === 'square' && state.mode === 'easy') return; // x² is a multiply tool — hidden in easy mode
      tool = hotTool; hud.setTool(hotTool); pendingTunnel = null; beltAnchor = null; updateCursor(); return;
    }
    const hotOp = OP_HOTKEYS[e.key];
    if (hotOp) {
      // An op hotkey selects the operator tool AND the op in one press (mirrors the slot click),
      // gated to what this mode/level allows — a locked op key does nothing, silently.
      if (opsForLevel(state.levelIndex, state.mode).includes(hotOp)) {
        tool = 'operator'; hud.setOp(hotOp); pendingTunnel = null; beltAnchor = null; updateCursor();
      }
      return;
    }
    const pan: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    };
    const d = pan[e.key];
    if (d) { cam.x += d[0]; cam.y += d[1]; renderer.setCamera(cam); }
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceDown = false; updateCursor(); } });

  // The level's current goal value, read from the target hub (null if none is placed yet).
  const targetValue = (s: GameState): bigint | null => {
    for (const b of s.buildings.values()) if (b.type === 'target') return b.target;
    return null;
  };

  // F6 celebration: burst DOM confetti of the just-made number from the hub's screen position and show
  // a big auto-dismissing "You made N!" banner. No modal, no sim mutation. The level-up fanfare rides
  // the existing sound director (it already fires sfx.levelUp on a levelIndex delta) — no hook here.
  function fireCelebration(made: bigint | null): void {
    if (made === null) return;
    for (const b of state.buildings.values()) {
      if (b.type !== 'target') continue;
      const c = centerOf(b);
      const s = renderer.worldToScreen(c.x + 0.5, c.y + 0.5); // hub cell-center in canvas CSS px
      const rect = canvas.getBoundingClientRect();
      // lastStars was set by advanceLevel during the tick that just triggered this level-up.
      celebrate({ text: formatValue(made), x: rect.left + s.x, y: rect.top + s.y, stars: state.lastStars });
      return;
    }
  }

  // --- fixed-timestep sim loop + rAF render ---
  const tickMs = 1000 / TICKS_PER_SECOND;
  const MAX_CATCHUP = tickMs * 5; // avoid a tick "spiral of death" after the tab is backgrounded
  const PAUSE_MS = 800; // level-up freeze duration (F6); pauseUntil/isPaused declared above
  let acc = 0, last = performance.now(), dirty = false;
  function frame(now: number) {
    acc = Math.min(acc + (now - last), MAX_CATCHUP); last = now;
    const paused = now < pauseUntil;
    // The number showing on the hub BEFORE this frame's ticks — i.e. the value she completes if a tick
    // this frame wins the level. Captured pre-step because step() advances the goal in place.
    const madeBefore = paused ? null : targetValue(state);
    if (paused) acc = 0; // no catch-up spiral while frozen
    else while (acc >= tickMs) { step(state); acc -= tickMs; dirty = true; }
    sound.frame(state); // turn this frame's state deltas (deliveries, misses, level-ups) into sound
    // Single level-up event source (P3): POSITIVE delta only, re-seeded at boot/reset. This is the
    // one place anything reacts to a levelIndex change — camera nudge, HUD announce, celebration, freeze.
    if (state.levelIndex > lastLevelIndex) {
      lastLevelIndex = state.levelIndex;
      // A level-up may have granted a new deposit; bring it into view if it's off-screen.
      for (const k of state.nodes.keys()) {
        if (!seenNodeKeys.has(k)) { seenNodeKeys.add(k); const p = parseKey(k); ensureNodeVisible(p.x, p.y); }
      }
      const newGoal = formatValue(targetValue(state) ?? 0n);
      // A replay's return jumps levelIndex back UP to home (a positive delta), so it lands here too —
      // but she didn't advance, so announce "back home", not a false new level. fireCelebration still
      // celebrates the number she just made (madeBefore = the replayed puzzle's target).
      const returningFromReplay = replayActive;
      replayActive = false;
      const easy = state.mode === 'easy';
      const easyNo = state.levelIndex - ENDLESS_START + 1; // easy counts puzzles from 1
      hud.announceGoal(
        returningFromReplay ? `↩️ Replay done! Back to ${easy ? `Puzzle ${easyNo}` : `Level ${state.levelIndex + 1}`}.`
        : easy && state.levelIndex - ENDLESS_START === EASY_SUB_UNLOCK ? `🎉 New machine unlocked: Take-Away (−)! Now make ${newGoal}`
        : easy ? `⭐ Puzzle ${easyNo}! Now make ${newGoal}`
        : state.levelIndex === ENDLESS_START ? `♾️ Endless mode! Keep going — make ${newGoal}` // first level past the campaign
        : `⭐ Level ${state.levelIndex + 1}! Now make ${newGoal}`);
      fireCelebration(madeBefore); // burst confetti of the number she just made from the hub
      pauseUntil = now + PAUSE_MS; // brief freeze so the celebration reads
    }
    const cr = renderer.visibleChunkRange();
    ensureChunksInRange(state, gen, cr.minCx, cr.minCy, cr.maxCx, cr.maxCy);
    // placement ghost for the building tools (operator 1x3, squarer 1x2)
    if (hover && tool === 'operator') {
      const ok = canPlaceOperator(state, hover.x, hover.y, placeDir);
      // A 1x3 operator's bar lies perpendicular to its output dir.
      const horizBar = placeDir === 'up' || placeDir === 'down';
      const w = horizBar ? 3 : 1;
      const h = horizBar ? 1 : 3;
      const ox = hover.x - (w === 3 ? 1 : 0);
      const oy = hover.y - (h === 3 ? 1 : 0);
      renderer.setPreview({ type: 'operator', ox, oy, w, h, dir: placeDir, valid: ok });
    } else if (hover && tool === 'square' && state.mode !== 'easy') {
      // A 1x2 squarer: input on the hovered cell, output one cell along dir.
      const ok = canPlaceSquare(state, hover.x, hover.y, placeDir);
      const d = DELTA[placeDir];
      const horiz = placeDir === 'left' || placeDir === 'right';
      const ox = Math.min(hover.x, hover.x + d.dx), oy = Math.min(hover.y, hover.y + d.dy);
      renderer.setPreview({ type: 'square', ox, oy, w: horiz ? 2 : 1, h: horiz ? 1 : 2, dir: placeDir, valid: ok });
    } else {
      renderer.setPreview(null); // 1x1 tools + eraser: no building ghost
    }
    renderer.setHover(hover);
    renderer.draw(state, paused ? 1 : Math.min(acc / tickMs, 1));
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
