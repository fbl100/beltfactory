import { describe, it, expect } from 'vitest';
import { emptyState, cellKey } from './grid';
import type { Direction } from './grid';
import {
  centerOf, footprintOf, coversCell, outCell, minerOutputs, inPortSlot, portsOf,
  addBuilding, removeBuildingAt, buildingAt, isBlocked, rebuildOccupancy,
} from './buildings';
import type { MinerBuilding, OperatorBuilding, TargetBuilding } from './buildings';

const miner = (ax: number, ay: number, dir: Direction): MinerBuilding =>
  ({ type: 'miner', ax, ay, dir, value: 7n, everyTicks: 8, sinceEmit: 0 });
const op = (ax: number, ay: number, dir: Direction): OperatorBuilding =>
  ({ type: 'operator', ax, ay, dir, op: 'add', inputs: [], everyTicks: 20, sinceProduce: 0 });
const target = (ax: number, ay: number, dir: Direction): TargetBuilding =>
  ({ type: 'target', ax, ay, dir, target: 12n, required: 5 });

describe('building geometry', () => {
  it('center, footprint, coversCell', () => {
    const b = miner(0, 0, 'right');
    expect(centerOf(b)).toEqual({ x: 1, y: 1 });
    expect(footprintOf(b).length).toBe(9);
    expect(coversCell(b, 0, 0)).toBe(true);
    expect(coversCell(b, 2, 2)).toBe(true);
    expect(coversCell(b, 3, 1)).toBe(false);
  });
  it('outCell is two cells beyond center along the facing', () => {
    expect(outCell(miner(0, 0, 'right'))).toEqual({ x: 3, y: 1 });
    expect(outCell(miner(0, 0, 'up'))).toEqual({ x: 1, y: -1 });
    expect(outCell(miner(0, 0, 'down'))).toEqual({ x: 1, y: 3 });
    expect(outCell(miner(0, 0, 'left'))).toEqual({ x: -1, y: 1 });
  });
  it('miner has no in-ports', () => {
    const b = miner(0, 0, 'right');
    expect(inPortSlot(b, 1, 0)).toBe(-1);
    expect(inPortSlot(b, 3, 1)).toBe(-1);
  });
  it('miner emits from all 3 open sides (9 cells), skipping the back', () => {
    const outs = minerOutputs(miner(0, 0, 'right')); // back = left (x=-1) is skipped
    expect(outs.length).toBe(9);
    expect(outs.filter((o) => o.dir === 'right').map((o) => `${o.x},${o.y}`).sort()).toEqual(['3,0', '3,1', '3,2']);
    expect(outs.some((o) => o.x === -1)).toBe(false); // no output on the back (left) side
  });
  it('operator: inputs on the 3 non-front sides, output on the front', () => {
    const b = op(0, 0, 'right'); // center (1,1); front (output) edge = x=2 column
    expect(inPortSlot(b, 1, 0)).toBe(0);  // top side
    expect(inPortSlot(b, 1, 2)).toBe(0);  // bottom side
    expect(inPortSlot(b, 0, 1)).toBe(0);  // back side (now an input)
    expect(inPortSlot(b, 2, 1)).toBe(-1); // front out-edge (output, not input)
    expect(inPortSlot(b, 2, 0)).toBe(-1); // front corner
    expect(outCell(b)).toEqual({ x: 3, y: 1 });
  });
  it('target accepts on all four edges but not corners', () => {
    const b = target(0, 0, 'right'); // center (1,1)
    expect(inPortSlot(b, 0, 1)).toBe(0);
    expect(inPortSlot(b, 2, 1)).toBe(0);
    expect(inPortSlot(b, 1, 0)).toBe(0);
    expect(inPortSlot(b, 1, 2)).toBe(0);
    expect(inPortSlot(b, 0, 0)).toBe(-1);
  });
  it('portsOf: operator 1 out + 3 in; target 4 in', () => {
    const ports = portsOf(op(0, 0, 'right'));
    expect(ports.filter((p) => p.role === 'in').length).toBe(3);
    expect(ports.filter((p) => p.role === 'out').length).toBe(1);
    expect(portsOf(target(0, 0, 'right')).filter((p) => p.role === 'in').length).toBe(4);
  });
});

describe('building occupancy', () => {
  it('adds a building and indexes all nine cells', () => {
    const s = emptyState(1);
    expect(addBuilding(s, op(0, 0, 'right'))).toBe(true);
    expect(buildingAt(s, 0, 0)?.type).toBe('operator');
    expect(buildingAt(s, 2, 2)?.type).toBe('operator');
    expect(buildingAt(s, 3, 3)).toBeUndefined();
    expect(isBlocked(s, 1, 1)).toBe(true);
    expect(isBlocked(s, 5, 5)).toBe(false);
  });
  it('rejects an overlapping building', () => {
    const s = emptyState(1);
    expect(addBuilding(s, op(0, 0, 'right'))).toBe(true);
    expect(addBuilding(s, op(2, 2, 'right'))).toBe(false); // overlaps at (2,2)
    expect(s.buildings.size).toBe(1);
  });
  it('removes a building from any footprint cell', () => {
    const s = emptyState(1);
    addBuilding(s, op(0, 0, 'right'));
    expect(removeBuildingAt(s, 2, 2)).toBe(true); // non-anchor cell
    expect(buildingAt(s, 0, 0)).toBeUndefined();
    expect(s.buildings.size).toBe(0);
    expect(s.occupancy.size).toBe(0);
  });
  it('rebuildOccupancy reindexes all buildings', () => {
    const s = emptyState(1);
    s.buildings.set(cellKey(0, 0), op(0, 0, 'right'));
    s.buildings.set(cellKey(5, 5), miner(5, 5, 'right'));
    rebuildOccupancy(s);
    expect(buildingAt(s, 1, 1)?.type).toBe('operator');
    expect(buildingAt(s, 6, 6)?.type).toBe('miner');
    expect(s.occupancy.size).toBe(18);
  });
});
