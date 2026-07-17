import type { GameState, Direction } from '../sim/grid';
import { beltAt, setBelt, nodeAt, RIGHT_OF } from '../sim/grid';
import type { MinerBuilding, OperatorBuilding } from '../sim/buildings';
import { isBlocked, buildingAt, addBuilding, removeBuildingAt } from '../sim/buildings';
import type { OpId } from '../content/operations';
import { MINER_EVERY_TICKS, OPERATOR_EVERY_TICKS } from '../content/config';

// Rotating a facing clockwise (R key) reuses the direction algebra.
export const ROTATE_CW = RIGHT_OF;

// ---------- belts (1x1, footprint-aware) ----------

// Direction you'd travel going from (ax,ay) to an adjacent (bx,by).
function dirBetween(ax: number, ay: number, bx: number, by: number): Direction {
  if (bx > ax) return 'right';
  if (bx < ax) return 'left';
  if (by > ay) return 'down';
  return 'up';
}

// Place a belt on an empty cell, or re-orient an existing belt. Belts may sit over
// a resource node (separate layer) but never over a building footprint.
function placeOrOrientBelt(state: GameState, x: number, y: number, dir: Direction): void {
  if (buildingAt(state, x, y)) return;
  const b = beltAt(state, x, y);
  if (!b) setBelt(state, x, y, { type: 'belt', dir });
  else b.dir = dir;
}

// Paint a contiguous belt run from (ax,ay) to (bx,by) along a Manhattan path,
// orienting each belt toward the next cell so corners flow the way you dragged.
// `endDir` covers a single-cell stroke (a plain click), honoring the HUD facing.
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

// Remove a belt (not buildings/nodes); drops any item sitting on it.
export function removeCell(state: GameState, x: number, y: number): boolean {
  if (!beltAt(state, x, y)) return false;
  setBelt(state, x, y, null);
  state.items = state.items.filter((it) => !(it.x === x && it.y === y));
  return true;
}

// ---------- buildings (3x3, centered on the cursor) ----------

// The nine cells of a 3x3 footprint centered on (cx,cy) — anchor = (cx-1, cy-1).
export function footprintCells(cx: number, cy: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      cells.push({ x: cx + dx, y: cy + dy });
  return cells;
}

export function footprintClear(state: GameState, cx: number, cy: number): boolean {
  return footprintCells(cx, cy).every((c) => !isBlocked(state, c.x, c.y));
}

export function canPlaceMiner(state: GameState, cx: number, cy: number): boolean {
  return footprintClear(state, cx, cy) && nodeAt(state, cx, cy) !== undefined;
}

export function canPlaceOperator(state: GameState, cx: number, cy: number): boolean {
  return footprintClear(state, cx, cy);
}

export function placeMiner(state: GameState, cx: number, cy: number, dir: Direction, everyTicks = MINER_EVERY_TICKS): boolean {
  const node = nodeAt(state, cx, cy);
  if (!node || !footprintClear(state, cx, cy)) return false;
  const b: MinerBuilding = { type: 'miner', ax: cx - 1, ay: cy - 1, dir, value: node.value, everyTicks, sinceEmit: 0 };
  return addBuilding(state, b);
}

export function placeOperator(state: GameState, cx: number, cy: number, dir: Direction, op: OpId = 'add'): boolean {
  if (!footprintClear(state, cx, cy)) return false;
  const b: OperatorBuilding = { type: 'operator', ax: cx - 1, ay: cy - 1, dir, op, inputs: [], everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
  return addBuilding(state, b);
}

// ---------- erase ----------

// Erase a belt, or a whole building (from any of its cells). The target hub is
// protected (a 9-year-old can't delete the goal); nodes are never removed.
export function eraseAt(state: GameState, x: number, y: number): boolean {
  if (removeCell(state, x, y)) return true;
  const b = buildingAt(state, x, y);
  if (b && b.type !== 'target') return removeBuildingAt(state, x, y);
  return false;
}

export function eraseLine(state: GameState, ax: number, ay: number, bx: number, by: number): void {
  let cx = ax, cy = ay;
  for (;;) {
    eraseAt(state, cx, cy);
    if (cx === bx && cy === by) break;
    if (cx !== bx) cx += Math.sign(bx - cx);
    else cy += Math.sign(by - cy);
  }
}
