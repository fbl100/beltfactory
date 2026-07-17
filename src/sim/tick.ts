import type { GameState } from './grid';
import { DELTA, DIRECTIONS, OPPOSITE, beltAt, splitterAt, tunnelAt } from './grid';
import type { Item } from './items';
import type { SplitterCell } from './entities';
import type { Direction } from './grid';
import { minerOutputs, inPortSlot, buildingAt, operatorTips, operatorOutCells } from './buildings';
import { createItem } from './items';
import { advanceLevel, isStaleTargetValue } from './progression';
import { applyOp } from '../content/operations';
import { TUNNEL_REACH } from '../content/config';

// Sim rate. Items advance one cell per tick, so this is also the belt speed
// (cells/second). The renderer interpolates between ticks, so movement stays
// smooth. 2.5/s = quarter of the original 10/s (kid-followable pacing).
export const TICKS_PER_SECOND = 2.5;

export function step(state: GameState): void {
  for (const it of state.items) { it.px = it.x; it.py = it.y; }
  mine(state);
  // produce() before move(): an operator that fills its two inputs during this
  // tick's move() should wait until *next* tick's produce() — a one-tick settle.
  produce(state);
  move(state);
  // Check the goal AFTER movement settles, so the target value is stable for the whole tick
  // (advancing mid-move() could mis-credit or drop same-tick deliveries). At most one level
  // advances per tick.
  checkLevel(state);
  state.tick++;
}

// If this level's delivery bar is full, advance to the next level (or win the whole game).
function checkLevel(state: GameState): void {
  if (state.status !== 'playing') return;
  for (const b of state.buildings.values()) {
    if (b.type === 'target' && state.delivered >= b.required) { advanceLevel(state, b); return; }
  }
}

// A cell that can receive a freshly-emitted item: an empty carrier (belt/splitter/tunnel).
function canEmitOnto(state: GameState, x: number, y: number): boolean {
  const carrier = beltAt(state, x, y) !== undefined || splitterAt(state, x, y) !== undefined || tunnelAt(state, x, y) !== undefined;
  return carrier && !occupied(state, x, y, null);
}

// Miners are wide sources: every N ticks they emit their (cached) node value onto
// each connected output cell across all four sides.
function mine(state: GameState): void {
  for (const b of state.buildings.values()) {
    if (b.type !== 'miner') continue;
    b.sinceEmit++;
    if (b.sinceEmit < b.everyTicks) continue;
    b.sinceEmit = 0;
    for (const o of minerOutputs(b)) {
      if (canEmitOnto(state, o.x, o.y)) state.items.push(createItem(state.nextItemId++, b.value, o.x, o.y));
    }
  }
}

// Operators combine two inputs into a OP b, rate-limited by everyTicks (throughput cap).
function produce(state: GameState): void {
  for (const b of state.buildings.values()) {
    if (b.type !== 'operator') continue;
    b.sinceProduce++;
    if (b.inputs.length < 2 || b.sinceProduce < b.everyTicks) continue;
    // inputs holds one pending value per tip, so [0] and [1] are always from different tips.
    // Emit from whichever middle edge has a free receiving belt (facing side preferred, back is fallback).
    for (const o of operatorOutCells(b)) {
      if (!canEmitOnto(state, o.x, o.y)) continue;
      state.items.push(createItem(state.nextItemId++, applyOp(b.op, b.inputs[0].value, b.inputs[1].value), o.x, o.y));
      b.inputs.splice(0, 2);
      b.sinceProduce = 0;
      break;
    }
  }
}

function move(state: GameState): void {
  const moved = new Set<number>();
  const removed = new Set<number>();
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const it of state.items) {
      if (moved.has(it.id) || removed.has(it.id)) continue;
      const belt = beltAt(state, it.x, it.y);
      if (belt) {
        if (advanceBeltItem(state, it, belt.dir, moved, removed)) progressed = true;
        continue;
      }
      const spl = splitterAt(state, it.x, it.y);
      if (spl) {
        if (distributeSplitterItem(state, it, spl, moved, removed)) progressed = true;
        continue;
      }
      const tun = tunnelAt(state, it.x, it.y);
      if (tun) {
        const ok = tun.role === 'out'
          ? advanceBeltItem(state, it, tun.dir, moved, removed) // exit behaves like a belt
          : tunnelJump(state, it, tun.dir, moved, removed);     // entrance dives to the paired exit
        if (ok) progressed = true;
        continue;
      }
      moved.add(it.id); // not on a carrier
    }
  }
  if (removed.size) state.items = state.items.filter((it) => !removed.has(it.id));
}

// Advance an item one cell in `dir`. Returns true if it progressed (moved/consumed).
function advanceBeltItem(state: GameState, it: Item, dir: Direction, moved: Set<number>, removed: Set<number>): boolean {
  const { dx, dy } = DELTA[dir];
  const tx = it.x + dx, ty = it.y + dy;

  // carrier ahead (belt/splitter/tunnel) -> advance downstream-first when it frees
  if (beltAt(state, tx, ty) || splitterAt(state, tx, ty) || tunnelAt(state, tx, ty)) {
    if (!occupied(state, tx, ty, removed)) { it.x = tx; it.y = ty; moved.add(it.id); return true; }
    return false; // blocked this pass; leave unmarked to retry as downstream drains
  }

  // building ahead -> deliver iff stepping onto one of its in-ports
  const b = buildingAt(state, tx, ty);
  if (b) {
    if (b.type === 'operator') {
      // 1x3 operator: the two end cells (tips A/B) are inputs; the center's two long edges are
      // outputs. ANY edge of a tip accepts (the only inward edge faces the center, which an item
      // can't cross). Keep at most one pending value PER tip so two items from the SAME belt can't
      // pair (which produced e.g. 3×3=9 instead of 2×3=6). Entering the center (output) is rejected.
      const tips = operatorTips(b);
      const tip = tx === tips.A.x && ty === tips.A.y ? 'A' : tx === tips.B.x && ty === tips.B.y ? 'B' : null;
      if (tip && !b.inputs.some((p) => p.tip === tip)) {
        b.inputs.push({ tip, value: it.value }); removed.add(it.id); return true;
      }
      moved.add(it.id); return false; // center (output) cell, or that tip already full
    }
    const slot = inPortSlot(b, tx, ty);
    if (b.type === 'target' && slot >= 0) {
      // Count only; the level-up / win decision happens once per tick in checkLevel(), after
      // all movement settles — see step(). A value that was a target on an earlier level is
      // stale leftover output from the pre-advance factory, not a mistake — don't punish it.
      if (it.value === b.target) state.delivered++;
      else if (!isStaleTargetValue(state, it.value)) state.misses++;
      removed.add(it.id); return true;
    }
    moved.add(it.id); return false; // non-port footprint cell / miner face
  }

  moved.add(it.id); return false; // empty ground / node-only cell / edge
}

// An item on a tunnel entrance dives to the nearest matching exit ahead.
function tunnelJump(state: GameState, it: Item, dir: Direction, moved: Set<number>, removed: Set<number>): boolean {
  const exit = pairedExit(state, it.x, it.y, dir);
  if (!exit) { moved.add(it.id); return false; } // no exit in range -> stuck (no retry)
  if (occupied(state, exit.x, exit.y, removed)) return false; // exit busy -> retry as it drains
  it.x = exit.x; it.y = exit.y; moved.add(it.id); return true;
}

// The nearest tunnel 'out' with the same dir within reach ahead (surface belts in between are ignored).
function pairedExit(state: GameState, ex: number, ey: number, dir: Direction): { x: number; y: number } | null {
  const d = DELTA[dir];
  for (let k = 1; k <= TUNNEL_REACH; k++) {
    const cx = ex + d.dx * k, cy = ey + d.dy * k;
    const t = tunnelAt(state, cx, cy);
    if (t && t.role === 'out' && t.dir === dir) return { x: cx, y: cy };
  }
  return null;
}

// Round-robin an item onto the next available outgoing belt/splitter.
function distributeSplitterItem(state: GameState, it: Item, spl: SplitterCell, moved: Set<number>, removed: Set<number>): boolean {
  for (let i = 0; i < DIRECTIONS.length; i++) {
    const d = DIRECTIONS[(spl.next + i) % DIRECTIONS.length];
    const { dx, dy } = DELTA[d];
    const nx = it.x + dx, ny = it.y + dy;
    if (!isSplitterOutput(state, nx, ny, d)) continue;
    if (occupied(state, nx, ny, removed)) continue;
    it.x = nx; it.y = ny;
    spl.next = (DIRECTIONS.indexOf(d) + 1) % DIRECTIONS.length;
    moved.add(it.id);
    return true;
  }
  return false; // no free output this pass; retry / back-pressure
}

// A neighbor is an output if it's a belt not pointing back into the splitter, or another splitter.
function isSplitterOutput(state: GameState, nx: number, ny: number, dirToNeighbor: Direction): boolean {
  const b = beltAt(state, nx, ny);
  if (b) return b.dir !== OPPOSITE[dirToNeighbor];
  return splitterAt(state, nx, ny) !== undefined;
}

// True if a live (non-removed) item occupies (x,y).
function occupied(state: GameState, x: number, y: number, removed: Set<number> | null): boolean {
  return state.items.some((o) => (!removed || !removed.has(o.id)) && o.x === x && o.y === y);
}
