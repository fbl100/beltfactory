import type { ChunkGenerator, Placement } from '../sim/world';
import type { Cell } from '../sim/entities';

// Content model (A): the origin chunk holds an authored addition puzzle
// (7 + 5 -> target 12); every other chunk is empty buildable land. Content
// model (B) later replaces the non-origin branch with procedural deposits.
export const TARGET = 12n;

const STARTER: Placement[] = [
  { x: 1, y: 3, cell: { type: 'extractor', dir: 'right', value: 7n, everyTicks: 8, sinceEmit: 0 } },
  { x: 1, y: 9, cell: { type: 'extractor', dir: 'right', value: 5n, everyTicks: 8, sinceEmit: 0 } },
  { x: 8, y: 6, cell: { type: 'operator', op: 'add', dir: 'right', inputs: [] } },
  { x: 13, y: 6, cell: { type: 'sink', target: TARGET } },
];

export const mvpGenerator: ChunkGenerator = (_seed, cx, cy) =>
  cx === 0 && cy === 0 ? STARTER.map((p) => ({ x: p.x, y: p.y, cell: cloneCell(p.cell) })) : [];

// Deep-clone a cell so live runtime state (operator.inputs, extractor.sinceEmit)
// is never shared between the static template and a live game.
function cloneCell(cell: Cell): Cell {
  return JSON.parse(
    JSON.stringify(cell, (_k, v) => (typeof v === 'bigint' ? { __big: v.toString() } : v)),
    (_k, v) => (v && typeof v === 'object' && '__big' in v ? BigInt((v as any).__big) : v),
  );
}
