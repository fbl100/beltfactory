import type { GameState, Direction } from './grid';
import { cellKey, emptyState } from './grid';
import type { ResourceNode } from './entities';
import type { Building } from './buildings';
import { isBlocked, addBuilding } from './buildings';
import type { OpId } from '../content/operations';
import { MINER_EVERY_TICKS, OPERATOR_EVERY_TICKS } from '../content/config';

export const CHUNK_SIZE = 16;

// Authored (data-only) building placements: anchor coords + facing, no runtime state.
export type AuthoredBuilding =
  | { type: 'miner'; x: number; y: number; dir: Direction }
  | { type: 'operator'; x: number; y: number; dir: Direction; op: OpId }
  | { type: 'target'; x: number; y: number; dir: Direction; target: bigint; required: number };

export interface ChunkContent {
  belts?: { x: number; y: number; dir: Direction }[];
  nodes?: ResourceNode[];
  buildings?: AuthoredBuilding[];
}
export type ChunkGenerator = (seed: number, cx: number, cy: number) => ChunkContent;

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function chunkOfCell(x: number, y: number): { cx: number; cy: number } {
  return { cx: Math.floor(x / CHUNK_SIZE), cy: Math.floor(y / CHUNK_SIZE) };
}

// Build a runtime building from an authored placement. Miners read (and cache) the
// value of the node under their center; a nodeless authored miner is skipped.
function instantiateBuilding(state: GameState, ab: AuthoredBuilding): void {
  let b: Building;
  if (ab.type === 'miner') {
    const node = state.nodes.get(cellKey(ab.x + 1, ab.y + 1)); // center = anchor + (1,1)
    if (!node) return;
    b = { type: 'miner', ax: ab.x, ay: ab.y, dir: ab.dir, value: node.value, everyTicks: MINER_EVERY_TICKS, sinceEmit: 0 };
  } else if (ab.type === 'operator') {
    b = { type: 'operator', ax: ab.x, ay: ab.y, dir: ab.dir, op: ab.op, inputs: [], everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
  } else {
    b = { type: 'target', ax: ab.x, ay: ab.y, dir: ab.dir, target: ab.target, required: ab.required };
  }
  addBuilding(state, b); // rejects on footprint conflict, so resume stays non-destructive
}

// Generate a chunk at most once, non-destructively (never overwrites existing state):
// nodes -> buildings (need nodes present) -> belts (skip cells a building occupies).
export function ensureChunk(state: GameState, gen: ChunkGenerator, cx: number, cy: number): void {
  const k = chunkKey(cx, cy);
  if (state.loadedChunks.has(k)) return;
  state.loadedChunks.add(k);
  const content = gen(state.seed, cx, cy);
  for (const n of content.nodes ?? []) {
    const nk = cellKey(n.x, n.y);
    if (!state.nodes.has(nk)) state.nodes.set(nk, n);
  }
  for (const ab of content.buildings ?? []) instantiateBuilding(state, ab);
  for (const belt of content.belts ?? []) {
    if (!isBlocked(state, belt.x, belt.y)) state.belts.set(cellKey(belt.x, belt.y), { type: 'belt', dir: belt.dir });
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

// Reset an existing game IN PLACE (so all live references keep working): clear the
// world and player build, then regenerate the origin puzzle fresh.
export function resetGame(state: GameState, seed: number, gen: ChunkGenerator): void {
  state.seed = seed;
  state.tick = 0;
  state.belts.clear();
  state.splitters.clear();
  state.tunnels.clear();
  state.buildings.clear();
  state.nodes.clear();
  state.occupancy.clear();
  state.loadedChunks.clear();
  state.items = [];
  state.nextItemId = 1;
  state.delivered = 0;
  state.misses = 0;
  state.status = 'playing';
  ensureChunk(state, gen, 0, 0);
}
