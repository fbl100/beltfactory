import type { GameState } from './grid';
import { cellKey, emptyState } from './grid';
import type { Cell } from './entities';

export const CHUNK_SIZE = 16;

export interface Placement { x: number; y: number; cell: Cell }
export type ChunkGenerator = (seed: number, cx: number, cy: number) => Placement[];

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function chunkOfCell(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}

// Generate a chunk at most once. Non-destructive: an existing cell (a player edit,
// or a cell from an overlapping restore) is never overwritten. This makes resume
// robust regardless of which chunks were marked loaded.
export function ensureChunk(state: GameState, gen: ChunkGenerator, cx: number, cy: number): void {
  const k = chunkKey(cx, cy);
  if (state.loadedChunks.has(k)) return;
  state.loadedChunks.add(k);
  for (const p of gen(state.seed, cx, cy)) {
    const ck = cellKey(p.x, p.y);
    if (!state.cells.has(ck)) state.cells.set(ck, p.cell);
  }
}

export function ensureChunksInRange(
  state: GameState, gen: ChunkGenerator,
  minCx: number, minCy: number, maxCx: number, maxCy: number,
): void {
  for (let cy = minCy; cy <= maxCy; cy++)
    for (let cx = minCx; cx <= maxCx; cx++)
      ensureChunk(state, gen, cx, cy);
}

export function newGame(seed: number, gen: ChunkGenerator): GameState {
  const s = emptyState(seed);
  ensureChunk(s, gen, 0, 0); // origin chunk holds the starting puzzle
  return s;
}
