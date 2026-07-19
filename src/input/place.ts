import type { GameState, Direction } from '../sim/grid';
import { beltAt, setBelt, splitterAt, setSplitter, tunnelAt, setTunnel, RIGHT_OF, DIRECTIONS, DELTA } from '../sim/grid';
import type { Building, OperatorBuilding, SquareBuilding } from '../sim/buildings';
import { isBlocked, buildingAt, addBuilding, removeBuildingAt, isHorizontal, acceptsItemAt } from '../sim/buildings';
import type { OpId } from '../content/operations';
import { OPERATOR_EVERY_TICKS } from '../content/config';

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

// Manhattan (L-shaped) route from (ax,ay) to (bx,by), orienting each belt toward the next cell so
// corners flow the way you'd drag. `endDir` covers a single-cell route (anchor == cursor), honoring
// the HUD facing. `verticalFirst` picks which leg of the L comes first — false = go across then down
// (default, matches drag-paint); true = down then across (the other corner, toggled with R in the
// live route). PURE (no state) — the ghost and the commit both build from this, so preview == result.
export function routeBeltCells(
  ax: number, ay: number, bx: number, by: number, endDir: Direction, verticalFirst = false,
): { x: number; y: number; dir: Direction }[] {
  const cells: { x: number; y: number; dir: Direction }[] = [];
  let cx = ax, cy = ay;
  let lastDir: Direction = endDir;
  while (cx !== bx || cy !== by) {
    let nx = cx, ny = cy;
    // horizontal-first exhausts X before Y; vertical-first exhausts Y before X.
    const moveX = verticalFirst ? cy === by : cx !== bx;
    if (moveX) nx += Math.sign(bx - cx);
    else ny += Math.sign(by - cy);
    lastDir = dirBetween(cx, cy, nx, ny);
    cells.push({ x: cx, y: cy, dir: lastDir });
    cx = nx; cy = ny;
  }
  cells.push({ x: bx, y: by, dir: lastDir });
  return cells;
}

// Auto-connect the run's END: if a cell adjacent to the last belt accepts items (an operator tip,
// target port, or squarer input), aim the last belt into it — so clicking next to a machine wires
// straight in without hand-orienting. Skips the neighbor the route just came from. Mutates in place
// so the ghost and the commit stay identical. (The START needs no fixup: a belt on a miner's output
// cell already receives from it, whichever way it then flows.)
export function autoConnectBeltEnd(state: GameState, cells: { x: number; y: number; dir: Direction }[]): void {
  if (cells.length === 0) return;
  const end = cells[cells.length - 1];
  const prev = cells.length >= 2 ? cells[cells.length - 2] : null;
  for (const d of DIRECTIONS) {
    const nx = end.x + DELTA[d].dx, ny = end.y + DELTA[d].dy;
    if (prev && nx === prev.x && ny === prev.y) continue; // don't point back up the route
    if (acceptsItemAt(state, nx, ny)) { end.dir = d; return; }
  }
}

// Place/re-orient every belt in a routed run (skips cells occupied by a building/splitter/tunnel, so
// a route grazing a machine leaves a gap rather than clobbering it). Returns the cells actually
// painted (for the dead-end-warning placement grace).
export function placeBeltCells(state: GameState, cells: { x: number; y: number; dir: Direction }[]): { x: number; y: number }[] {
  const painted: { x: number; y: number }[] = [];
  for (const c of cells) {
    if (buildingAt(state, c.x, c.y) || splitterAt(state, c.x, c.y) || tunnelAt(state, c.x, c.y)) continue;
    placeOrOrientBelt(state, c.x, c.y, c.dir);
    painted.push({ x: c.x, y: c.y });
  }
  return painted;
}

// The full plan for a click-start/click-end belt run: Manhattan route -> auto-connect the end ->
// drop cells that overlap a machine (they won't place). The SAME plan feeds the live ghost and the
// commit, so what the ghost shows is exactly what a second click paints.
export function planBeltRun(
  state: GameState, ax: number, ay: number, bx: number, by: number, endDir: Direction, verticalFirst = false,
): { x: number; y: number; dir: Direction }[] {
  const cells = routeBeltCells(ax, ay, bx, by, endDir, verticalFirst);
  autoConnectBeltEnd(state, cells);
  return cells.filter((c) => !buildingAt(state, c.x, c.y) && !splitterAt(state, c.x, c.y) && !tunnelAt(state, c.x, c.y));
}

// Paint a contiguous belt run from (ax,ay) to (bx,by) along a Manhattan path (drag-paint path).
// `endDir` covers a single-cell stroke (a plain click), honoring the HUD facing.
export function paintBeltLine(
  state: GameState, ax: number, ay: number, bx: number, by: number, endDir: Direction,
): { x: number; y: number }[] {
  return placeBeltCells(state, routeBeltCells(ax, ay, bx, by, endDir));
}

// Remove a belt (not buildings/nodes); drops any item sitting on it.
export function removeCell(state: GameState, x: number, y: number): boolean {
  if (!beltAt(state, x, y)) return false;
  setBelt(state, x, y, null);
  state.items = state.items.filter((it) => !(it.x === x && it.y === y));
  return true;
}

// ---------- buildings (1x3 operator, centered on the cursor) ----------

// A 1x3 operator centered on (cx,cy), oriented by its output dir. The bar sits PERPENDICULAR
// to the output, so the bar is horizontal when the output dir is up/down — i.e. !isHorizontal(dir).
export function operatorFootprintCells(cx: number, cy: number, dir: Direction): { x: number; y: number }[] {
  const barHoriz = !isHorizontal(dir); // bar perpendicular to flow: up/down output => horizontal bar
  const cells: { x: number; y: number }[] = [];
  for (let i = -1; i <= 1; i++) cells.push(barHoriz ? { x: cx + i, y: cy } : { x: cx, y: cy + i });
  return cells;
}

export function canPlaceOperator(state: GameState, cx: number, cy: number, dir: Direction): boolean {
  return operatorFootprintCells(cx, cy, dir).every((c) => !isBlocked(state, c.x, c.y));
}

export function placeOperator(state: GameState, cx: number, cy: number, dir: Direction, op: OpId = 'add'): boolean {
  if (!canPlaceOperator(state, cx, cy, dir)) return false;
  // Anchor = top-left of the bounding box. Bar is perpendicular to output: a horizontal bar
  // (output up/down => !isHorizontal) starts one cell left; a vertical bar one up.
  const barHoriz = !isHorizontal(dir);
  const ax = barHoriz ? cx - 1 : cx;
  const ay = barHoriz ? cy : cy - 1;
  const b: OperatorBuilding = { type: 'operator', ax, ay, dir, op, inputs: [], everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
  return addBuilding(state, b);
}

// A 1x2 squarer: INPUT end on the cursor cell (cx,cy), OUTPUT end one cell along `dir`.
export function squareFootprintCells(cx: number, cy: number, dir: Direction): { x: number; y: number }[] {
  const d = DELTA[dir];
  return [{ x: cx, y: cy }, { x: cx + d.dx, y: cy + d.dy }];
}

export function canPlaceSquare(state: GameState, cx: number, cy: number, dir: Direction): boolean {
  return squareFootprintCells(cx, cy, dir).every((c) => !isBlocked(state, c.x, c.y));
}

export function placeSquare(state: GameState, cx: number, cy: number, dir: Direction): boolean {
  if (state.mode === 'easy') return false; // x² is a multiply-family machine — forbidden in +/− easy mode
  if (!canPlaceSquare(state, cx, cy, dir)) return false;
  const d = DELTA[dir];
  const ax = Math.min(cx, cx + d.dx), ay = Math.min(cy, cy + d.dy); // anchor = top-left of the 1x2 box
  const b: SquareBuilding = { type: 'square', ax, ay, dir, pending: null, everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
  return addBuilding(state, b);
}

// ---------- erase ----------

// Which building types the eraser may remove. Exhaustive over Building['type'] so any future
// building type must consciously opt into (or out of) erasability at compile time.
const ERASABLE = { miner: false, target: false, operator: true, square: true } as const satisfies Record<Building['type'], boolean>;

// Erase a belt, or an operator/squarer (from any of its cells). The target hub and the automatic miners
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
  if (b && ERASABLE[b.type]) return removeBuildingAt(state, x, y);
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
