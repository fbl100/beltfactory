import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, chunkOfCell, chunkKey, ensureChunk, newGame } from './world';
import type { ChunkGenerator } from './world';
import { emptyState, beltAt, cellKey } from './grid';
import { buildingAt } from './buildings';

const gen: ChunkGenerator = (_s, cx, cy) => (cx === 0 && cy === 0 ? {
  nodes: [{ x: 2, y: 2, value: 7n }],
  buildings: [{ type: 'miner', x: 1, y: 1, dir: 'right' }],
  belts: [{ x: 6, y: 6, dir: 'right' }],
} : {});

describe('chunks', () => {
  it('maps cells to chunks, including negatives', () => {
    expect(chunkOfCell(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOfCell(CHUNK_SIZE, 0)).toEqual({ cx: 1, cy: 0 });
    expect(chunkOfCell(-1, -1)).toEqual({ cx: -1, cy: -1 });
  });
  it('places nodes, buildings (value cached from the center node), and belts once', () => {
    const s = emptyState(1);
    ensureChunk(s, gen, 0, 0);
    expect(s.nodes.get(cellKey(2, 2))?.value).toBe(7n);
    const m = buildingAt(s, 2, 2);
    expect(m?.type).toBe('miner');
    expect((m as any).value).toBe(7n);
    expect(beltAt(s, 6, 6)).toEqual({ type: 'belt', dir: 'right' });
    expect(s.loadedChunks.has(chunkKey(0, 0))).toBe(true);
  });
  it('never regenerates or overwrites an already-loaded chunk', () => {
    const s = emptyState(1);
    ensureChunk(s, gen, 0, 0);
    s.belts.set(cellKey(6, 6), { type: 'belt', dir: 'up' }); // simulate a player edit
    ensureChunk(s, gen, 0, 0);                               // must be a no-op
    expect(beltAt(s, 6, 6)).toEqual({ type: 'belt', dir: 'up' });
  });
  it('skips an authored miner with no center node', () => {
    const s = emptyState(1);
    const g: ChunkGenerator = (_s, cx, cy) => (cx === 0 && cy === 0 ? { buildings: [{ type: 'miner', x: 1, y: 1, dir: 'right' }] } : {});
    ensureChunk(s, g, 0, 0);
    expect(buildingAt(s, 2, 2)).toBeUndefined();
  });
  it('newGame ensures the origin chunk', () => {
    const s = newGame(7, gen);
    expect(s.seed).toBe(7);
    expect(buildingAt(s, 2, 2)?.type).toBe('miner');
  });
});
