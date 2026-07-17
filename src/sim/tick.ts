import type { GameState } from './grid';
import { DELTA, beltAt } from './grid';
import { outCell, inPortSlot, buildingAt } from './buildings';
import { createItem } from './items';
import { applyOp } from '../content/operations';

// Sim rate. Items advance one cell per tick, so this is also the belt speed
// (cells/second). The renderer interpolates between ticks, so movement stays
// smooth. 2.5/s = quarter of the original 10/s (kid-followable pacing).
export const TICKS_PER_SECOND = 2.5;

export function step(state: GameState): void {
  for (const it of state.items) { it.px = it.x; it.py = it.y; }
  mine(state);
  // produce() before move(): an operator that fills its two inputs during this
  // tick's move() should wait until *next* tick's produce() to emit — a one-tick
  // "settle" so an output never teleports out the same tick its inputs arrive.
  produce(state);
  move(state);
  state.tick++;
}

// Miners emit their (cached) node value onto the belt at their output cell every N ticks.
function mine(state: GameState): void {
  for (const b of state.buildings.values()) {
    if (b.type !== 'miner') continue;
    b.sinceEmit++;
    if (b.sinceEmit < b.everyTicks) continue;
    const { x, y } = outCell(b);
    if (beltAt(state, x, y) && !occupied(state, x, y, null)) {
      state.items.push(createItem(state.nextItemId++, b.value, x, y));
      b.sinceEmit = 0;
    }
  }
}

// Operators holding two inputs emit a OP b onto the belt at their output cell.
function produce(state: GameState): void {
  for (const b of state.buildings.values()) {
    if (b.type !== 'operator' || b.inputs.length < 2) continue;
    const { x, y } = outCell(b);
    if (beltAt(state, x, y) && !occupied(state, x, y, null)) {
      state.items.push(createItem(state.nextItemId++, applyOp(b.op, b.inputs[0], b.inputs[1]), x, y));
      b.inputs.splice(0, 2);
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
      if (!belt) { moved.add(it.id); continue; } // only belts self-propel
      const { dx, dy } = DELTA[belt.dir];
      const tx = it.x + dx, ty = it.y + dy;

      // 1) belt ahead -> advance downstream-first when the target frees
      if (beltAt(state, tx, ty)) {
        if (!occupied(state, tx, ty, removed)) { it.x = tx; it.y = ty; moved.add(it.id); progressed = true; }
        // else blocked this pass; leave unmarked to retry as downstream drains
        continue;
      }

      // 2) building ahead -> deliver iff we're stepping onto one of its in-ports
      const b = buildingAt(state, tx, ty);
      if (b) {
        const slot = inPortSlot(b, tx, ty);
        if (b.type === 'operator' && slot >= 0) {
          if (b.inputs.length < 2) { b.inputs.push(it.value); removed.add(it.id); progressed = true; }
          else moved.add(it.id); // back-pressure: both inputs full
        } else if (b.type === 'target' && slot >= 0) {
          if (it.value === b.target) state.status = 'won';
          else state.misses++;
          removed.add(it.id); progressed = true;
        } else {
          moved.add(it.id); // non-port footprint cell / miner face -> stop, harmless
        }
        continue;
      }

      moved.add(it.id); // empty ground / node-only cell / edge of built world
    }
  }
  if (removed.size) state.items = state.items.filter((it) => !removed.has(it.id));
}

// True if a live (non-removed) item occupies (x,y).
function occupied(state: GameState, x: number, y: number, removed: Set<number> | null): boolean {
  return state.items.some((o) => (!removed || !removed.has(o.id)) && o.x === x && o.y === y);
}
