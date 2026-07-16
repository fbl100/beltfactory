import { GameState, cellAt, setCell } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean {
  if (cellAt(state, x, y)) return false;
  setCell(state, x, y, { type: 'belt', dir });
  return true;
}

export function removeCell(state: GameState, x: number, y: number): boolean {
  const cell = cellAt(state, x, y);
  if (cell?.type !== 'belt') return false;
  setCell(state, x, y, null);
  // Drop any item sitting on the removed belt so it isn't stranded on empty ground.
  state.items = state.items.filter((it) => !(it.x === x && it.y === y));
  return true;
}

// Direction you'd travel going from (ax,ay) to an adjacent (bx,by).
function dirBetween(ax: number, ay: number, bx: number, by: number): Direction {
  if (bx > ax) return 'right';
  if (bx < ax) return 'left';
  if (by > ay) return 'down';
  return 'up';
}

// Place a belt on an empty cell, or re-orient an existing belt. Machines
// (extractor/operator/sink) are left untouched so you can paint up to them.
function placeOrOrientBelt(state: GameState, x: number, y: number, dir: Direction): void {
  const c = cellAt(state, x, y);
  if (!c) setCell(state, x, y, { type: 'belt', dir });
  else if (c.type === 'belt') c.dir = dir;
}

// Paint a contiguous belt run from (ax,ay) to (bx,by) along a Manhattan path
// (x first, then y), orienting each belt toward the next cell so corners flow
// the way you dragged. `endDir` is used for a single-cell stroke — i.e. a plain
// click — so it still honors the HUD-selected direction.
export function paintBeltLine(
  state: GameState, ax: number, ay: number, bx: number, by: number, endDir: Direction,
): void {
  let cx = ax, cy = ay;
  let lastDir: Direction = endDir;
  while (cx !== bx || cy !== by) {
    let nx = cx, ny = cy;
    if (cx !== bx) nx += Math.sign(bx - cx);
    else ny += Math.sign(by - cy);
    lastDir = dirBetween(cx, cy, nx, ny);
    placeOrOrientBelt(state, cx, cy, lastDir);
    cx = nx; cy = ny;
  }
  placeOrOrientBelt(state, bx, by, lastDir);
}

// Erase belts along a Manhattan path (removeCell leaves machines untouched).
export function eraseBeltLine(
  state: GameState, ax: number, ay: number, bx: number, by: number,
): void {
  let cx = ax, cy = ay;
  for (;;) {
    removeCell(state, cx, cy);
    if (cx === bx && cy === by) break;
    if (cx !== bx) cx += Math.sign(bx - cx);
    else cy += Math.sign(by - cy);
  }
}
