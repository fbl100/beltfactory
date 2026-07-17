import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SAVE_VERSION } from './save';
import { emptyState, beltAt, cellKey } from './grid';
import { addBuilding, buildingAt } from './buildings';
import { createItem } from './items';

function sample() {
  const s = emptyState(4242);
  s.tick = 12; s.nextItemId = 3; s.delivered = 4;
  s.loadedChunks.add('0,0');
  s.belts.set(cellKey(4, 2), { type: 'belt', dir: 'right' });
  s.splitters.set(cellKey(5, 5), { type: 'splitter', dir: 'right', next: 2 });
  s.tunnels.set(cellKey(6, 0), { type: 'tunnel', dir: 'right', role: 'in' });
  s.tunnels.set(cellKey(9, 0), { type: 'tunnel', dir: 'right', role: 'out' });
  s.nodes.set(cellKey(2, 2), { x: 2, y: 2, value: 7n });
  addBuilding(s, { type: 'miner', ax: 1, ay: 1, dir: 'right', value: 7n, everyTicks: 5, sinceEmit: 2 });
  addBuilding(s, { type: 'operator', ax: 7, ay: 4, dir: 'right', op: 'add', inputs: [7n], everyTicks: 20, sinceProduce: 3 });
  addBuilding(s, { type: 'target', ax: 12, ay: 4, dir: 'right', target: 30n, required: 8 });
  s.items.push(createItem(1, 9999999999n, 4, 2));
  return s;
}

describe('save', () => {
  it('round-trips belts/buildings/nodes/items incl. BigInt, and rebuilds occupancy', () => {
    const r = deserialize(serialize(sample()));
    expect(r.seed).toBe(4242);
    expect(r.tick).toBe(12);
    expect(r.delivered).toBe(4);
    expect(r.version).toBe(3);
    const tgt = [...r.buildings.values()].find((b) => b.type === 'target') as any;
    expect(tgt.required).toBe(8);
    const opBuilding = [...r.buildings.values()].find((b) => b.type === 'operator') as any;
    expect(opBuilding.everyTicks).toBe(20);
    expect(r.loadedChunks.has('0,0')).toBe(true);
    expect(r.belts instanceof Map).toBe(true);
    expect(r.splitters instanceof Map).toBe(true);
    expect(r.buildings instanceof Map).toBe(true);
    expect(r.nodes instanceof Map).toBe(true);
    expect(beltAt(r, 4, 2)).toEqual({ type: 'belt', dir: 'right' });
    expect(r.splitters.get(cellKey(5, 5))).toEqual({ type: 'splitter', dir: 'right', next: 2 });
    expect(r.tunnels instanceof Map).toBe(true);
    expect(r.tunnels.get(cellKey(6, 0))).toEqual({ type: 'tunnel', dir: 'right', role: 'in' });
    expect(r.tunnels.get(cellKey(9, 0))).toEqual({ type: 'tunnel', dir: 'right', role: 'out' });
    expect(r.nodes.get(cellKey(2, 2))?.value).toBe(7n);
    const op = [...r.buildings.values()].find((b) => b.type === 'operator') as any;
    expect(op.inputs[0]).toBe(7n);
    const miner = [...r.buildings.values()].find((b) => b.type === 'miner') as any;
    expect(typeof miner.value).toBe('bigint');
    expect(r.items[0].value).toBe(9999999999n);
    // occupancy rebuilt: a footprint cell resolves to its building
    expect(buildingAt(r, 2, 2)?.type).toBe('miner'); // miner anchor (1,1) covers (2,2)
    expect(r.occupancy.size).toBe(27); // 3 buildings * 9 cells
  });
  it('stamps version 2', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(SAVE_VERSION);
  });
  it('rejects an old / unknown save version', () => {
    expect(() => deserialize('{"version":1}')).toThrow();
  });
});
