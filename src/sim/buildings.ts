import type { Direction, GameState } from './grid';
import { DELTA, DIRECTIONS, OPPOSITE, RIGHT_OF, cellKey, beltAt, splitterAt, tunnelAt } from './grid';
import type { OpId } from '../content/operations';

// Rotatable buildings. Anchor = top-left cell of the bounding box (also the unique key). Miner and
// target are 3x3 (center = ax+1,ay+1); an OPERATOR is a 1x3 bar (its center is the middle cell).
// Belts are 1x1 and live in a separate map; a single derived `occupancy` index maps every footprint
// cell -> anchor key. `dimsOf` is the single source of truth for a building's bounding-box size.
export const FOOTPRINT = 3;

export type BuildingType = 'miner' | 'operator' | 'target' | 'square';

interface Base { ax: number; ay: number; dir: Direction }
export interface MinerBuilding extends Base { type: 'miner'; value: bigint; everyTicks: number; sinceEmit: number }
// everyTicks/sinceProduce throttle an operator's output rate (its throughput cap).
// A pending input waiting to be paired, tagged with the tip (A/B) it arrived at.
export interface OperatorInput { tip: 'A' | 'B'; value: bigint }
// Holds at most ONE pending value per tip, so two items from the SAME belt can't pair (that
// produced e.g. 3×3=9 instead of 2×3=6). A and B are interchangeable (ops are order-independent).
export interface OperatorBuilding extends Base { type: 'operator'; op: OpId; inputs: OperatorInput[]; everyTicks: number; sinceProduce: number }
// `par` = golf par for the current goal (fewest operator machines to build it), synced from the
// active level by progression.syncTargetToLevel so the HUD/celebration can read it straight off state.
export interface TargetBuilding extends Base { type: 'target'; target: bigint; required: number; par: number } // dir vestigial (accepts all 4 sides)
// A 1x2 UNARY "squarer": a number arriving on the input end is squared (n -> n²) and emitted from
// the output end (which points along `dir`). Holds at most one pending value; `pending` is transient
// (reset on load, like an operator's inputs).
export interface SquareBuilding extends Base { type: 'square'; pending: bigint | null; everyTicks: number; sinceProduce: number }
export type Building = MinerBuilding | OperatorBuilding | TargetBuilding | SquareBuilding;

// An operator's 1x3 bar lies PERPENDICULAR to its output direction: output up/down -> a horizontal
// bar (tips left & right); output left/right -> a vertical bar (tips above & below).
function operatorHoriz(dir: Direction): boolean {
  return dir === 'up' || dir === 'down';
}

// The machines the player BUILT toward a puzzle: operators and squarers. Miners (automatic) and the
// target hub don't count. This is the number compared against the level's par for the star rating.
export function countMachines(state: GameState): number {
  let n = 0;
  for (const b of state.buildings.values()) if (b.type === 'operator' || b.type === 'square') n++;
  return n;
}

// Bounding-box size in cells. Miner/target are 3x3; an operator is a 1x3 bar oriented by its output;
// a squarer is a 1x2 bar along its flow direction (input end -> output end).
export function dimsOf(b: Building): { w: number; h: number } {
  if (b.type === 'operator') return operatorHoriz(b.dir) ? { w: FOOTPRINT, h: 1 } : { w: 1, h: FOOTPRINT };
  if (b.type === 'square') return b.dir === 'left' || b.dir === 'right' ? { w: 2, h: 1 } : { w: 1, h: 2 };
  return { w: FOOTPRINT, h: FOOTPRINT };
}

// A squarer's two footprint cells: the item enters `input` (from any exposed edge) and the square
// leaves the machine one cell past `output` along `dir` (see squareOutCell). `output` is whichever
// of the two cells lies further along the flow direction.
export function squareCells(b: SquareBuilding): { input: { x: number; y: number }; output: { x: number; y: number } } {
  const horiz = b.dir === 'left' || b.dir === 'right';
  const c0 = { x: b.ax, y: b.ay };
  const c1 = horiz ? { x: b.ax + 1, y: b.ay } : { x: b.ax, y: b.ay + 1 };
  const d = DELTA[b.dir];
  const dot = (c1.x - c0.x) * d.dx + (c1.y - c0.y) * d.dy; // >0 => c1 is the downstream (output) cell
  return dot > 0 ? { input: c0, output: c1 } : { input: c1, output: c0 };
}

// The external belt cell just beyond the squarer's output end, where the squared value is emitted.
export function squareOutCell(b: SquareBuilding): { x: number; y: number } {
  const { output } = squareCells(b), d = DELTA[b.dir];
  return { x: output.x + d.dx, y: output.y + d.dy };
}

export function centerOf(b: Building): { x: number; y: number } {
  const { w, h } = dimsOf(b);
  return { x: b.ax + ((w - 1) >> 1), y: b.ay + ((h - 1) >> 1) }; // (n-1)/2: 3 -> +1, 1 -> +0
}

export function footprintOf(b: Building): { x: number; y: number }[] {
  const { w, h } = dimsOf(b);
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h; dy++)
    for (let dx = 0; dx < w; dx++)
      cells.push({ x: b.ax + dx, y: b.ay + dy });
  return cells;
}

export function coversCell(b: Building, x: number, y: number): boolean {
  const { w, h } = dimsOf(b);
  return x >= b.ax && x < b.ax + w && y >= b.ay && y < b.ay + h;
}

// The external belt cell just beyond the front (facing) edge: where emitted items land. Footprint-
// aware — one cell past the edge along `dir` (miner 3x3 -> +2 from center; operator 1x3 -> +1).
// For an operator this is the PREFERRED output (see operatorOutCells for the fallback edge).
export function outCell(b: Building): { x: number; y: number } {
  const c = centerOf(b), d = DELTA[b.dir], { w, h } = dimsOf(b);
  const along = b.dir === 'left' || b.dir === 'right' ? w : h; // footprint depth along the facing
  const off = ((along - 1) >> 1) + 1;
  return { x: c.x + off * d.dx, y: c.y + off * d.dy };
}

// A 1x3 operator emits from EITHER of the center cell's two exposed long edges (perpendicular to the
// bar). Preferred = the facing (dir) side; the other is the fallback used when the front is blocked.
export function operatorOutCells(b: OperatorBuilding): { x: number; y: number; dir: Direction }[] {
  const c = centerOf(b), f = DELTA[b.dir], back = DELTA[OPPOSITE[b.dir]];
  return [
    { x: c.x + f.dx, y: c.y + f.dy, dir: b.dir },
    { x: c.x + back.dx, y: c.y + back.dy, dir: OPPOSITE[b.dir] },
  ];
}

// A 1x3 operator's two input tips: the bar's end cells (perpendicular to the output). ANY exposed
// edge of a tip accepts input — the only inward edge faces the center, which items can't cross.
// A and B are interchangeable; the labels are for legibility.
export function operatorTips(b: OperatorBuilding): { A: { x: number; y: number }; B: { x: number; y: number } } {
  const c = centerOf(b), p = DELTA[RIGHT_OF[b.dir]]; // one step along the bar (perpendicular to output)
  return { A: { x: c.x + p.dx, y: c.y + p.dy }, B: { x: c.x - p.dx, y: c.y - p.dy } };
}

// A miner is a wide source: it emits from every edge cell on ALL FOUR sides — 3 cells per side,
// 12 output cells — each pointing outward. (dir is vestigial for miners; every side emits.)
export function minerOutputs(b: Building): { x: number; y: number; dir: Direction }[] {
  const cx = b.ax + 1, cy = b.ay + 1;
  const cells: { x: number; y: number; dir: Direction }[] = [];
  for (const side of DIRECTIONS) {
    const d = DELTA[side], p = DELTA[RIGHT_OF[side]]; // p = along the edge (perpendicular to side)
    const bx = cx + 2 * d.dx, by = cy + 2 * d.dy;     // edge-center, one cell beyond the footprint
    cells.push({ x: bx, y: by, dir: side });
    cells.push({ x: bx + p.dx, y: by + p.dy, dir: side });
    cells.push({ x: bx - p.dx, y: by - p.dy, dir: side });
  }
  return cells;
}

export interface Port { role: 'in' | 'out'; slot: number; side: Direction; dir: Direction; label?: string }

// Cold path (render draws arrows + labels from this). `side` = the direction from the center to the
// port cell; `dir` = travel-through direction. A 1x3 operator has two output edges (the facing side,
// preferred, and the back side, fallback) and two input tips (A/B) perpendicular to them.
export function portsOf(b: Building): Port[] {
  if (b.type === 'miner') return DIRECTIONS.map((s) => ({ role: 'out' as const, slot: 0, side: s, dir: s }));
  if (b.type === 'operator') {
    const perp = RIGHT_OF[b.dir]; // along the bar (toward tip A)
    return [
      { role: 'out', slot: 0, side: b.dir, dir: b.dir },
      { role: 'out', slot: 1, side: OPPOSITE[b.dir], dir: OPPOSITE[b.dir] },
      { role: 'in', slot: 0, side: perp, dir: OPPOSITE[perp], label: 'A' },
      { role: 'in', slot: 1, side: OPPOSITE[perp], dir: perp, label: 'B' },
    ];
  }
  if (b.type === 'square') return []; // the renderer draws the squarer's in/out arrows itself
  return DIRECTIONS.map((s) => ({ role: 'in' as const, slot: 0, side: s, dir: OPPOSITE[s] }));
}

// Hot path: is (x,y) an IN-port EDGE cell of b (center + DELTA[side])? Returns the
// slot, or -1. No allocation. Miner has no inputs; front out-edge/back/corners/center are -1.
export function inPortSlot(b: Building, x: number, y: number): number {
  // Miners have no in-ports; operators use side-based delivery to their A/B ports (see tick.ts).
  if (b.type !== 'target') return -1;
  // target: any of the four edge-center cells
  const cx = b.ax + 1, cy = b.ay + 1;
  for (const s of DIRECTIONS) {
    const d = DELTA[s];
    if (x === cx + d.dx && y === cy + d.dy) return 0;
  }
  return -1;
}

export function buildingAt(s: GameState, x: number, y: number): Building | undefined {
  const anchor = s.occupancy.get(cellKey(x, y));
  return anchor ? s.buildings.get(anchor) : undefined;
}

// How a cell would receive an item that arrives on it. STRUCTURAL only: independent of travel
// direction and of transient state (belt occupancy, a tip already holding a pending value, target
// counting). tick.ts's advanceBeltItem switches on this, and the renderer's dead-end warning reads
// it, so item movement and the warning can never disagree about what counts as a dead end.
// Order matches advanceBeltItem: carriers first (a cell can never be both a carrier and a building —
// placement of one refuses if the other is present).
export type AcceptKind = 'carrier' | 'operator-tip' | 'target-port' | 'square-input' | 'none';
export function acceptKindAt(s: GameState, x: number, y: number): AcceptKind {
  if (beltAt(s, x, y) || splitterAt(s, x, y) || tunnelAt(s, x, y)) return 'carrier';
  const b = buildingAt(s, x, y);
  if (b) {
    if (b.type === 'operator') {
      const tips = operatorTips(b);
      if ((x === tips.A.x && y === tips.A.y) || (x === tips.B.x && y === tips.B.y)) return 'operator-tip';
      return 'none'; // center (output) cell / bar body: an item can't enter here
    }
    if (b.type === 'square') {
      const { input } = squareCells(b);
      return x === input.x && y === input.y ? 'square-input' : 'none'; // the output end rejects incoming items
    }
    if (b.type === 'target' && inPortSlot(b, x, y) >= 0) return 'target-port';
  }
  return 'none'; // empty ground / node-only / miner face / operator center / target corner+body
}
export function acceptsItemAt(s: GameState, x: number, y: number): boolean {
  return acceptKindAt(s, x, y) !== 'none';
}

// True if a belt, splitter, tunnel, OR building already occupies (x,y). Nodes are a separate layer and never block.
export function isBlocked(s: GameState, x: number, y: number): boolean {
  return beltAt(s, x, y) !== undefined || splitterAt(s, x, y) !== undefined
    || tunnelAt(s, x, y) !== undefined || buildingAt(s, x, y) !== undefined;
}

// Place a building iff its whole 3x3 footprint is clear; indexes occupancy. Returns success.
export function addBuilding(s: GameState, b: Building): boolean {
  const cells = footprintOf(b);
  for (const c of cells) if (isBlocked(s, c.x, c.y)) return false;
  const anchor = cellKey(b.ax, b.ay);
  s.buildings.set(anchor, b);
  for (const c of cells) s.occupancy.set(cellKey(c.x, c.y), anchor);
  return true;
}

// Remove the building covering (x,y) (from any footprint cell). Returns success.
export function removeBuildingAt(s: GameState, x: number, y: number): boolean {
  const anchor = s.occupancy.get(cellKey(x, y));
  if (!anchor) return false;
  const b = s.buildings.get(anchor);
  if (!b) { s.occupancy.delete(cellKey(x, y)); return false; }
  for (const c of footprintOf(b)) s.occupancy.delete(cellKey(c.x, c.y));
  s.buildings.delete(anchor);
  return true;
}

// Rebuild the derived occupancy index from the buildings map (call after deserialize).
export function rebuildOccupancy(s: GameState): void {
  s.occupancy.clear();
  for (const [anchor, b] of s.buildings) {
    for (const c of footprintOf(b)) s.occupancy.set(cellKey(c.x, c.y), anchor);
  }
}
