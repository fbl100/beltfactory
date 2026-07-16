import { describe, it, expect } from 'vitest';
import { CHUNK_SIZE, chunkOfCell, chunkKey, ensureChunk, newGame, ChunkGenerator } from './world';
import { emptyState, cellAt } from './grid';

const genAt = (px: number, py: number): ChunkGenerator =>
  (_seed, cx, cy) => (cx === 0 && cy === 0 ? [{ x: px, y: py, cell: { type: 'belt', dir: 'right' } }] : []);

describe('chunks', () => {
  it('maps cells to chunks, including negatives', () => {
    expect(chunkOfCell(0, 0)).toEqual({ cx: 0, cy: 0 });
    expect(chunkOfCell(CHUNK_SIZE, 0)).toEqual({ cx: 1, cy: 0 });
    expect(chunkOfCell(-1, -1)).toEqual({ cx: -1, cy: -1 });
  });
  it('generates a chunk once and marks it loaded', () => {
    const s = emptyState(1);
    ensureChunk(s, genAt(2, 3), 0, 0);
    expect(cellAt(s, 2, 3)).toEqual({ type: 'belt', dir: 'right' });
    expect(s.loadedChunks.has(chunkKey(0, 0))).toBe(true);
  });
  it('never regenerates or overwrites an already-loaded chunk', () => {
    const s = emptyState(1);
    ensureChunk(s, genAt(2, 3), 0, 0);
    s.cells.set('2,3', { type: 'belt', dir: 'up' }); // simulate a player edit
    ensureChunk(s, genAt(2, 3), 0, 0);               // must be a no-op
    expect(cellAt(s, 2, 3)).toEqual({ type: 'belt', dir: 'up' });
  });
  it('newGame ensures the origin chunk', () => {
    const s = newGame(7, genAt(1, 1));
    expect(s.seed).toBe(7);
    expect(cellAt(s, 1, 1)).toEqual({ type: 'belt', dir: 'right' });
  });
});
