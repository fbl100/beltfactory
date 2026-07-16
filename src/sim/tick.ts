import { GameState, DELTA, cellAt, parseKey } from './grid';
import type { OperatorCell, ExtractorCell } from './entities';
import { accepts } from './entities';
import { createItem } from './items';
import { applyOp } from '../content/operations';
import type { OpId } from '../content/operations';

export const TICKS_PER_SECOND = 10;

export function step(state: GameState): void {
  for (const it of state.items) { it.px = it.x; it.py = it.y; }
  emit(state);
  // produce() before move(): an operator that reaches 2 inputs during this
  // tick's move() phase should not also emit its output the same tick — it
  // should wait until the *next* tick's produce() sees the filled inputs.
  // Running produce() first (against inputs left over from a prior tick)
  // gives operators a one-tick "settle" before their output appears.
  produce(state);
  move(state);
  state.tick++;
}

function emit(state: GameState): void {
  for (const [key, cell] of state.cells) {
    if (cell.type !== 'extractor') continue;
    const ex = cell as ExtractorCell;
    ex.sinceEmit++;
    if (ex.sinceEmit < ex.everyTicks) continue;
    const { x, y } = parseKey(key);
    const { dx, dy } = DELTA[ex.dir];
    const tx = x + dx, ty = y + dy;
    const target = cellAt(state, tx, ty);
    if (accepts(target, 0) && !occupied(state, tx, ty, null)) {
      state.items.push(createItem(state.nextItemId++, ex.value, tx, ty));
      ex.sinceEmit = 0;
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
      const cell = cellAt(state, it.x, it.y);
      if (cell?.type !== 'belt') { moved.add(it.id); continue; } // only belts self-propel
      const { dx, dy } = DELTA[cell.dir];
      const tx = it.x + dx, ty = it.y + dy;
      const target = cellAt(state, tx, ty);
      if (!target) { moved.add(it.id); continue; }             // edge of built world

      if (target.type === 'operator') {
        const op = target as OperatorCell;
        if (op.inputs.length < 2) { op.inputs.push(it.value); removed.add(it.id); progressed = true; }
        else moved.add(it.id);
        continue;
      }
      if (target.type === 'sink') {
        if (it.value === target.target) state.status = 'won';
        removed.add(it.id); progressed = true;
        continue;
      }
      if (target.type === 'belt') {
        if (!occupied(state, tx, ty, removed)) { it.x = tx; it.y = ty; moved.add(it.id); progressed = true; }
        // else blocked this pass; leave unmarked so it retries as downstream frees
        continue;
      }
      moved.add(it.id); // extractor: cannot enter
    }
  }
  if (removed.size) state.items = state.items.filter((it) => !removed.has(it.id));
}

function produce(state: GameState): void {
  for (const [key, cell] of state.cells) {
    if (cell.type !== 'operator') continue;
    const op = cell as OperatorCell;
    if (op.inputs.length < 2) continue;
    const { x, y } = parseKey(key);
    const { dx, dy } = DELTA[op.dir];
    const tx = x + dx, ty = y + dy;
    const target = cellAt(state, tx, ty);
    if (accepts(target, 0) && !occupied(state, tx, ty, null)) {
      state.items.push(createItem(state.nextItemId++, applyOp(op.op as OpId, op.inputs[0], op.inputs[1]), tx, ty));
      op.inputs.splice(0, 2);
    }
  }
}

// True if a live (non-removed) item occupies (x,y).
function occupied(state: GameState, x: number, y: number, removed: Set<number> | null): boolean {
  return state.items.some((o) => (!removed || !removed.has(o.id)) && o.x === x && o.y === y);
}
