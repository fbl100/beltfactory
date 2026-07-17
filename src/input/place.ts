import type { GameState, Direction } from '../sim/grid';
import { beltAt, setBelt, splitterAt, setSplitter, tunnelAt, setTunnel, nodeAt, RIGHT_OF } from '../sim/grid';
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
// a resource node (separate layer) but never over a building, splitter, or tunnel.
function placeOrOrientBelt(state: GameState, x: number, y: number, dir: Direction): void {
  if (buildingAt(state, x, y) || splitterAt(state, x, y) || tunnelAt(state, x, y)) return;
  const b = beltAt(state, x, y);
  if (!b) setBelt(state, x, y, { type: 'belt', dir });
  else b.dir = dir;
}

// Place a 1x1 splitter on an otherwise-empty cell (may sit over a node).
export function placeSplitter(state: GameState, x: number, y: number, dir: Direction): boolean {
  if (isBlocked(state, x, y)) return false;
  setSplitter(state, x, y, { type: 'splitter', dir, next: 0 });
  return true;
}

// Place one underground-belt tile (entrance or exit) on an otherwise-empty cell.
// Pairing (entrance -> nearest matching exit ahead) is resolved by the sim at run time.
export function placeTunnel(state: GameState, x: number, y: number, dir: Direction, role: 'in' | 'out'): boolean {
  if (isBlocked(state, x, y)) return false;
  setTunnel(state, x, y, { type: 'tunnel', dir, role });
  return true;
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

// A 1x3 operator centered on (cx,cy), oriented by its output dir (bar perpendicular to the output):
// output up/down -> a horizontal bar; output left/right -> a vertical bar.
function operatorHoriz(dir: Direction): boolean { return dir === 'up' || dir === 'down'; }

export function operatorFootprintCells(cx: number, cy: number, dir: Direction): { x: number; y: number }[] {
  const horiz = operatorHoriz(dir);
  const cells: { x: number; y: number }[] = [];
  for (let i = -1; i <= 1; i++) cells.push(horiz ? { x: cx + i, y: cy } : { x: cx, y: cy + i });
  return cells;
}

export function canPlaceOperator(state: GameState, cx: number, cy: number, dir: Direction): boolean {
  return operatorFootprintCells(cx, cy, dir).every((c) => !isBlocked(state, c.x, c.y));
}

export function placeMiner(state: GameState, cx: number, cy: number, dir: Direction, everyTicks = MINER_EVERY_TICKS): boolean {
  const node = nodeAt(state, cx, cy);
  if (!node || !footprintClear(state, cx, cy)) return false;
  const b: MinerBuilding = { type: 'miner', ax: cx - 1, ay: cy - 1, dir, value: node.value, everyTicks, sinceEmit: 0 };
  return addBuilding(state, b);
}

export function placeOperator(state: GameState, cx: number, cy: number, dir: Direction, op: OpId = 'add'): boolean {
  if (!canPlaceOperator(state, cx, cy, dir)) return false;
  // Anchor = top-left of the bounding box: a horizontal bar starts one cell left; a vertical bar one up.
  const ax = operatorHoriz(dir) ? cx - 1 : cx;
  const ay = operatorHoriz(dir) ? cy : cy - 1;
  const b: OperatorBuilding = { type: 'operator', ax, ay, dir, op, inputs: [], everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
  return addBuilding(state, b);
}

// ---------- erase ----------

// Erase a belt, or an OPERATOR (from any of its cells). The target hub and the automatic miners
// are protected: a 9-year-old can't delete the goal, and miners are permanent (they auto-respawn
// on every deposit). Nodes are never removed.
export function eraseAt(state: GameState, x: number, y: number): boolean {
  if (removeCell(state, x, y)) return true; // belt (also drops a stranded item)
  if (splitterAt(state, x, y) || tunnelAt(state, x, y)) {
    setSplitter(state, x, y, null);
    setTunnel(state, x, y, null);
    state.items = state.items.filter((it) => !(it.x === x && it.y === y));
    return true;
  }
  const b = buildingAt(state, x, y);
  if (b && b.type === 'operator') return removeBuildingAt(state, x, y);
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
