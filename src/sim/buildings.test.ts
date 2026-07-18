import { describe, it, expect } from 'vitest';
import { emptyState, cellKey, setBelt, setSplitter, setTunnel } from './grid';
import type { Direction } from './grid';
import {
  centerOf, footprintOf, coversCell, outCell, minerOutputs, inPortSlot, portsOf,
  dimsOf, operatorTips, operatorOutCells,
  addBuilding, removeBuildingAt, buildingAt, isBlocked, rebuildOccupancy,
  acceptKindAt, acceptsItemAt,
} from './buildings';
import type { MinerBuilding, OperatorBuilding, TargetBuilding } from './buildings';

const miner = (ax: number, ay: number, dir: Direction): MinerBuilding =>
  ({ type: 'miner', ax, ay, dir, value: 7n, everyTicks: 8, sinceEmit: 0 });
const op = (ax: number, ay: number, dir: Direction): OperatorBuilding =>
  ({ type: 'operator', ax, ay, dir, op: 'add', inputs: [], everyTicks: 20, sinceProduce: 0 });
const target = (ax: number, ay: number, dir: Direction): TargetBuilding =>
  ({ type: 'target', ax, ay, dir, target: 12n, required: 5 });

describe('acceptKindAt / acceptsItemAt (shared with tick.advanceBeltItem)', () => {
  it('carrier cells (belt/splitter/tunnel) accept', () => {
    const s = emptyState(1);
    setBelt(s, 0, 0, { type: 'belt', dir: 'right' });
    setSplitter(s, 1, 0, { type: 'splitter', dir: 'right', next: 0 });
    setTunnel(s, 2, 0, { type: 'tunnel', dir: 'right', role: 'in' });
    expect(acceptKindAt(s, 0, 0)).toBe('carrier');
    expect(acceptKindAt(s, 1, 0)).toBe('carrier');
    expect(acceptKindAt(s, 2, 0)).toBe('carrier');
    expect(acceptsItemAt(s, 0, 0)).toBe(true);
  });
  it('empty ground is a dead end', () => {
    const s = emptyState(1);
    expect(acceptKindAt(s, 5, 5)).toBe('none');
    expect(acceptsItemAt(s, 5, 5)).toBe(false);
  });
  it('operator tips accept; center/body do not; a full tip is NOT a dead end', () => {
    const s = emptyState(1);
    const b = op(0, 0, 'up'); // horizontal bar: tips at (0,0) & (2,0), center (output) at (1,0)
    addBuilding(s, b);
    const tips = operatorTips(b);
    expect(acceptKindAt(s, tips.A.x, tips.A.y)).toBe('operator-tip');
    expect(acceptKindAt(s, tips.B.x, tips.B.y)).toBe('operator-tip');
    expect(acceptKindAt(s, 1, 0)).toBe('none'); // center (output) rejects incoming items
    b.inputs.push({ tip: 'A', value: 3n }); // transient back-pressure, not a dead end
    expect(acceptsItemAt(s, tips.A.x, tips.A.y)).toBe(true);
  });
  it('target in-ports accept; corner and body do not', () => {
    const s = emptyState(1);
    const b = target(0, 0, 'right'); // 3x3, center (1,1)
    addBuilding(s, b);
    expect(acceptKindAt(s, 1, 0)).toBe('target-port'); // top edge-center
    expect(acceptKindAt(s, 0, 1)).toBe('target-port'); // left edge-center
    expect(acceptKindAt(s, 0, 0)).toBe('none');        // corner
    expect(acceptKindAt(s, 1, 1)).toBe('none');        // body center
  });
  it('a miner footprint face is a dead end (miners have no in-ports)', () => {
    const s = emptyState(1);
    addBuilding(s, miner(0, 0, 'right'));
    expect(acceptKindAt(s, 2, 1)).toBe('none'); // front-edge face cell of the 3x3 miner
  });
});

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
  it('miner emits from all four sides (12 cells)', () => {
    const outs = minerOutputs(miner(0, 0, 'right'));
    expect(outs.length).toBe(12);
    expect(outs.filter((o) => o.dir === 'right').map((o) => `${o.x},${o.y}`).sort()).toEqual(['3,0', '3,1', '3,2']);
    expect(outs.filter((o) => o.dir === 'left').map((o) => `${o.x},${o.y}`).sort()).toEqual(['-1,0', '-1,1', '-1,2']); // back side now emits too
    expect(new Set(outs.map((o) => `${o.x},${o.y}`)).size).toBe(12); // all distinct
  });
  it('operator (1x3, dir right -> vertical bar): tips are inputs, center emits from either long edge', () => {
    const b = op(0, 0, 'right'); // vertical bar: cells (0,0),(0,1),(0,2); center (0,1)
    expect(dimsOf(b)).toEqual({ w: 1, h: 3 });
    expect(centerOf(b)).toEqual({ x: 0, y: 1 });
    expect(footprintOf(b).length).toBe(3);
    expect(coversCell(b, 0, 2)).toBe(true);
    expect(coversCell(b, 1, 1)).toBe(false); // 1x3, not 3x3
    const tips = operatorTips(b);
    expect([tips.A, tips.B].map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,0', '0,2']);
    expect(outCell(b)).toEqual({ x: 1, y: 1 }); // preferred output = the facing (right) side
    expect(operatorOutCells(b).map((o) => `${o.x},${o.y}`).sort()).toEqual(['-1,1', '1,1']); // either long edge
    expect(inPortSlot(b, 0, 0)).toBe(-1); // operators use tip delivery (tick), not inPortSlot
  });
  it('operator bar orients perpendicular to the output (dir up -> horizontal bar)', () => {
    const b = op(0, 0, 'up'); // horizontal bar: cells (0,0),(1,0),(2,0); center (1,0)
    expect(dimsOf(b)).toEqual({ w: 3, h: 1 });
    expect(centerOf(b)).toEqual({ x: 1, y: 0 });
    const tips = operatorTips(b);
    expect([tips.A, tips.B].map((p) => `${p.x},${p.y}`).sort()).toEqual(['0,0', '2,0']);
    expect(outCell(b)).toEqual({ x: 1, y: -1 }); // facing (up) side
    expect(operatorOutCells(b).map((o) => `${o.x},${o.y}`).sort()).toEqual(['1,-1', '1,1']);
  });
  it('target accepts on all four edges but not corners', () => {
    const b = target(0, 0, 'right'); // center (1,1)
    expect(inPortSlot(b, 0, 1)).toBe(0);
    expect(inPortSlot(b, 2, 1)).toBe(0);
    expect(inPortSlot(b, 1, 0)).toBe(0);
    expect(inPortSlot(b, 1, 2)).toBe(0);
    expect(inPortSlot(b, 0, 0)).toBe(-1);
  });
  it('portsOf: miner 4 out; operator 2 tips in + 2 edges out; target 4 in', () => {
    expect(portsOf(miner(0, 0, 'right')).filter((p) => p.role === 'out').length).toBe(4);
    const ports = portsOf(op(0, 0, 'right'));
    const ins = ports.filter((p) => p.role === 'in');
    expect(ins.length).toBe(2);
    expect(ins.map((p) => p.label).sort()).toEqual(['A', 'B']); // labeled input tips
    expect(ports.filter((p) => p.role === 'out').length).toBe(2); // both middle edges
    expect(portsOf(target(0, 0, 'right')).filter((p) => p.role === 'in').length).toBe(4);
  });
});

describe('building occupancy', () => {
  it('adds a building and indexes its footprint cells', () => {
    const s = emptyState(1);
    expect(addBuilding(s, op(0, 0, 'right'))).toBe(true); // 1x3 vertical: (0,0),(0,1),(0,2)
    expect(buildingAt(s, 0, 0)?.type).toBe('operator');
    expect(buildingAt(s, 0, 2)?.type).toBe('operator');
    expect(buildingAt(s, 1, 1)).toBeUndefined(); // not part of the 1x3
    expect(isBlocked(s, 0, 1)).toBe(true);
    expect(isBlocked(s, 5, 5)).toBe(false);
  });
  it('rejects an overlapping building', () => {
    const s = emptyState(1);
    expect(addBuilding(s, op(0, 0, 'right'))).toBe(true); // (0,0),(0,1),(0,2)
    expect(addBuilding(s, op(0, 2, 'right'))).toBe(false); // would re-cover (0,2)
    expect(s.buildings.size).toBe(1);
  });
  it('removes a building from any footprint cell', () => {
    const s = emptyState(1);
    addBuilding(s, op(0, 0, 'right'));
    expect(removeBuildingAt(s, 0, 2)).toBe(true); // non-anchor cell
    expect(buildingAt(s, 0, 0)).toBeUndefined();
    expect(s.buildings.size).toBe(0);
    expect(s.occupancy.size).toBe(0);
  });
  it('rebuildOccupancy reindexes all buildings', () => {
    const s = emptyState(1);
    s.buildings.set(cellKey(0, 0), op(0, 0, 'right'));
    s.buildings.set(cellKey(5, 5), miner(5, 5, 'right'));
    rebuildOccupancy(s);
    expect(buildingAt(s, 0, 2)?.type).toBe('operator');
    expect(buildingAt(s, 6, 6)?.type).toBe('miner');
    expect(s.occupancy.size).toBe(12); // 3 (operator 1x3) + 9 (miner 3x3)
  });
});
