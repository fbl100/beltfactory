import { describe, it, expect } from 'vitest';
import { serialize, deserialize, SAVE_VERSION } from './save';
import { emptyState, beltAt, cellKey } from './grid';
import { addBuilding, buildingAt } from './buildings';
import { createItem } from './items';

function sample() {
  const s = emptyState(4242);
  s.tick = 12; s.nextItemId = 3; s.delivered = 4; s.levelIndex = 2;
  s.bestStars.set(6, 3); s.bestStars.set(7, 2); // earned golf stars must survive a reload
  s.loadedChunks.add('0,0');
  s.belts.set(cellKey(4, 2), { type: 'belt', dir: 'right' });
  s.splitters.set(cellKey(5, 5), { type: 'splitter', dir: 'right', next: 2 });
  s.tunnels.set(cellKey(6, 0), { type: 'tunnel', dir: 'right', role: 'in' });
  s.tunnels.set(cellKey(9, 0), { type: 'tunnel', dir: 'right', role: 'out' });
  s.nodes.set(cellKey(2, 2), { x: 2, y: 2, value: 7n });
  addBuilding(s, { type: 'miner', ax: 1, ay: 1, dir: 'right', value: 7n, everyTicks: 5, sinceEmit: 2 });
  addBuilding(s, { type: 'operator', ax: 7, ay: 4, dir: 'right', op: 'add', inputs: [{ tip: 'A', value: 7n }], everyTicks: 20, sinceProduce: 3 });
  addBuilding(s, { type: 'target', ax: 12, ay: 4, dir: 'right', target: 30n, required: 8 , par: 0});
  s.items.push(createItem(1, 9999999999n, 4, 2));
  return s;
}

describe('save', () => {
  it('round-trips belts/buildings/nodes/items incl. BigInt, and rebuilds occupancy', () => {
    const r = deserialize(serialize(sample()));
    expect(r.seed).toBe(4242);
    expect(r.tick).toBe(12);
    expect(r.delivered).toBe(4);
    expect(r.levelIndex).toBe(2);
    expect(r.version).toBe(SAVE_VERSION);
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
    expect(op.inputs).toEqual([]); // pending operator inputs are transient — reset on load
    const miner = [...r.buildings.values()].find((b) => b.type === 'miner') as any;
    expect(typeof miner.value).toBe('bigint');
    expect(r.items[0].value).toBe(9999999999n);
    // occupancy rebuilt: a footprint cell resolves to its building
    expect(buildingAt(r, 2, 2)?.type).toBe('miner'); // miner anchor (1,1) covers (2,2)
    expect(r.occupancy.size).toBe(21); // miner 9 + operator 3 (1x3) + target 9
  });
  it('round-trips earned golf stars (bestStars)', () => {
    const r = deserialize(serialize(sample()));
    expect(r.bestStars instanceof Map).toBe(true);
    expect(r.bestStars.get(6)).toBe(3);
    expect(r.bestStars.get(7)).toBe(2);
  });

  it('defaults bestStars to empty for a pre-v6 save that never had it', () => {
    const s = sample();
    const raw = JSON.parse(serialize(s));
    raw.version = 5; delete raw.bestStars; // simulate an old save
    const r = deserialize(JSON.stringify(raw));
    expect(r.bestStars instanceof Map).toBe(true);
    expect(r.bestStars.size).toBe(0);
  });

  it('round-trips the difficulty mode, defaulting to normal for pre-mode saves', () => {
    const s = sample(); s.mode = 'easy';
    expect(deserialize(serialize(s)).mode).toBe('easy');
    const raw = JSON.parse(serialize(sample())); delete raw.mode;
    expect(deserialize(JSON.stringify(raw)).mode).toBe('normal');
  });

  it('round-trips replayReturn (a mid-replay save resumes correctly), defaulting to null', () => {
    const s = sample(); s.replayReturn = 42;
    expect(deserialize(serialize(s)).replayReturn).toBe(42);
    expect(deserialize(serialize(emptyState(1))).replayReturn).toBeNull();
  });

  it('stamps the current save version', () => {
    expect(JSON.parse(serialize(sample())).version).toBe(SAVE_VERSION);
  });
  it('rejects a pre-progression-incompatible / unknown save version', () => {
    expect(() => deserialize('{"version":1}')).toThrow();
    expect(() => deserialize('{"version":2}')).toThrow();
    expect(() => deserialize('{"version":99}')).toThrow();
  });
  it('round-trips a squarer, resetting its transient pending value on load', () => {
    const s = emptyState(7);
    addBuilding(s, { type: 'square', ax: 3, ay: 3, dir: 'right', pending: 6n, everyTicks: 20, sinceProduce: 4 });
    const r = deserialize(serialize(s));
    const sq = [...r.buildings.values()].find((b) => b.type === 'square') as any;
    expect(sq).toBeTruthy();
    expect(sq.dir).toBe('right');
    expect(sq.pending).toBeNull(); // transient — reset like operator inputs
    expect(buildingAt(r, 4, 3)?.type).toBe('square'); // occupancy covers the 1x2 footprint
  });
  it('accepts a v3 (pre-progression) save and defaults levelIndex to 0', () => {
    const v3: any = JSON.parse(serialize(sample()));
    delete v3.levelIndex;   // v3 had no progression index
    v3.version = 3;
    const r = deserialize(JSON.stringify(v3));
    expect(r.levelIndex).toBe(0);
    expect(r.buildings instanceof Map).toBe(true); // built factory carried over
    expect([...r.buildings.values()].some((b) => b.type === 'target')).toBe(true);
  });
});
