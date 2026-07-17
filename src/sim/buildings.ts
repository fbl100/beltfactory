import type { Direction, GameState } from './grid';
import { DELTA, DIRECTIONS, OPPOSITE, RIGHT_OF, LEFT_OF, cellKey, beltAt, splitterAt } from './grid';
import type { OpId } from '../content/operations';

// 3x3 rotatable buildings. Anchor = top-left cell (also the unique key); the
// center is (ax+1, ay+1). Belts are 1x1 and live in a separate map; a single
// derived `occupancy` index maps every footprint cell -> anchor key.
export const FOOTPRINT = 3;

export type BuildingType = 'miner' | 'operator' | 'target';

interface Base { ax: number; ay: number; dir: Direction }
export interface MinerBuilding extends Base { type: 'miner'; value: bigint; everyTicks: number; sinceEmit: number }
// everyTicks/sinceProduce throttle an operator's output rate (its throughput cap).
export interface OperatorBuilding extends Base { type: 'operator'; op: OpId; inputs: bigint[]; everyTicks: number; sinceProduce: number } // slot0=LEFT_OF, slot1=RIGHT_OF
export interface TargetBuilding extends Base { type: 'target'; target: bigint; required: number } // dir vestigial (accepts all 4 sides)
export type Building = MinerBuilding | OperatorBuilding | TargetBuilding;

export function centerOf(b: Building): { x: number; y: number } {
  return { x: b.ax + 1, y: b.ay + 1 };
}

export function footprintOf(b: Building): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < FOOTPRINT; dy++)
    for (let dx = 0; dx < FOOTPRINT; dx++)
      cells.push({ x: b.ax + dx, y: b.ay + dy });
  return cells;
}

export function coversCell(b: Building, x: number, y: number): boolean {
  return x >= b.ax && x < b.ax + FOOTPRINT && y >= b.ay && y < b.ay + FOOTPRINT;
}

// The external belt cell just beyond the front (output) edge: where emitted items land.
// Used by operators (single front output).
export function outCell(b: Building): { x: number; y: number } {
  const c = centerOf(b), d = DELTA[b.dir];
  return { x: c.x + 2 * d.dx, y: c.y + 2 * d.dy };
}

// A miner is a wide source: it emits from every edge cell on its three open
// sides (front + left + right of the facing; the back stays clear) — 3 per side,
// 9 output cells — each pointing outward. Rotating the miner picks the clear back.
export function minerOutputs(b: Building): { x: number; y: number; dir: Direction }[] {
  const cx = b.ax + 1, cy = b.ay + 1;
  const cells: { x: number; y: number; dir: Direction }[] = [];
  for (const side of [b.dir, LEFT_OF[b.dir], RIGHT_OF[b.dir]]) {
    const d = DELTA[side], p = DELTA[RIGHT_OF[side]]; // p = along the edge (perpendicular to side)
    const bx = cx + 2 * d.dx, by = cy + 2 * d.dy;     // edge-center, one cell beyond the footprint
    cells.push({ x: bx, y: by, dir: side });
    cells.push({ x: bx + p.dx, y: by + p.dy, dir: side });
    cells.push({ x: bx - p.dx, y: by - p.dy, dir: side });
  }
  return cells;
}

export interface Port { role: 'in' | 'out'; slot: number; side: Direction; dir: Direction }

// Cold path (render draws arrows from this). `dir` = travel-through direction:
// out ports flow outward along `side`; in ports flow inward (OPPOSITE[side]).
export function portsOf(b: Building): Port[] {
  if (b.type === 'miner') return [{ role: 'out', slot: 0, side: b.dir, dir: b.dir }];
  if (b.type === 'operator') {
    const l = LEFT_OF[b.dir], r = RIGHT_OF[b.dir], back = OPPOSITE[b.dir];
    return [
      { role: 'out', slot: 0, side: b.dir, dir: b.dir },
      { role: 'in', slot: 0, side: back, dir: OPPOSITE[back] },
      { role: 'in', slot: 1, side: l, dir: OPPOSITE[l] },
      { role: 'in', slot: 2, side: r, dir: OPPOSITE[r] },
    ];
  }
  return DIRECTIONS.map((s) => ({ role: 'in' as const, slot: 0, side: s, dir: OPPOSITE[s] }));
}

// Hot path: is (x,y) an IN-port EDGE cell of b (center + DELTA[side])? Returns the
// slot, or -1. No allocation. Miner has no inputs; front out-edge/back/corners/center are -1.
export function inPortSlot(b: Building, x: number, y: number): number {
  if (b.type === 'miner') return -1;
  if (b.type === 'operator') {
    // Inputs on the 3 non-front sides: a footprint cell is an input unless it's on
    // the front (output) edge — i.e. unless the cell ahead of it (in dir) is outside.
    const fd = DELTA[b.dir];
    return coversCell(b, x + fd.dx, y + fd.dy) ? 0 : -1;
  }
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

// True if a belt, splitter, OR building already occupies (x,y). Nodes are a separate layer and never block.
export function isBlocked(s: GameState, x: number, y: number): boolean {
  return beltAt(s, x, y) !== undefined || splitterAt(s, x, y) !== undefined || buildingAt(s, x, y) !== undefined;
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
