import type { GameState, Direction } from './grid';
import { cellKey, emptyState, setBelt, setSplitter, setTunnel } from './grid';
import type { ResourceNode } from './entities';
import type { Building } from './buildings';
import { isBlocked, addBuilding, buildingAt, rebuildOccupancy, assertNever } from './buildings';
import type { OpId } from '../content/operations';
import type { Mode } from '../content/levels';
import { startIndexForMode } from '../content/levels';
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
  switch (ab.type) {
    case 'miner': {
      const node = state.nodes.get(cellKey(ab.x + 1, ab.y + 1)); // center = anchor + (1,1)
      if (!node) return;
      b = { type: 'miner', ax: ab.x, ay: ab.y, dir: ab.dir, value: node.value, everyTicks: MINER_EVERY_TICKS, sinceEmit: 0 };
      break;
    }
    case 'operator':
      b = { type: 'operator', ax: ab.x, ay: ab.y, dir: ab.dir, op: ab.op, inputs: [], everyTicks: OPERATOR_EVERY_TICKS, sinceProduce: 0 };
      break;
    case 'target':
      // par is a placeholder here; progression.syncTargetToLevel sets the real par from the active level.
      b = { type: 'target', ax: ab.x, ay: ab.y, dir: ab.dir, target: ab.target, required: ab.required, par: 0 };
      break;
    default:
      return assertNever(ab);
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

// Miners are fully automatic: every deposit gets one, no player action needed. For each node whose
// center isn't already covered by a building, clear its whole 3x3 footprint (belts/splitters/tunnels
// + any in-flight items) — the miner OVERRIDES whatever was there — then drop a permanent miner
// anchored at (node.x-1, node.y-1). Idempotent: a node that already has a building is skipped, so
// calling this repeatedly (newGame, load, level-up) never double-places or disturbs a running mine.
export function ensureMiners(state: GameState): void {
  for (const node of state.nodes.values()) {
    if (buildingAt(state, node.x, node.y) !== undefined) continue;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        setBelt(state, node.x + dx, node.y + dy, null);
        setSplitter(state, node.x + dx, node.y + dy, null);
        setTunnel(state, node.x + dx, node.y + dy, null);
      }
    state.items = state.items.filter(
      (it) => Math.abs(it.x - node.x) > 1 || Math.abs(it.y - node.y) > 1,
    );
    addBuilding(state, {
      type: 'miner', ax: node.x - 1, ay: node.y - 1, dir: 'right',
      value: node.value, everyTicks: MINER_EVERY_TICKS, sinceEmit: 0,
    });
  }
}

export function newGame(seed: number, gen: ChunkGenerator, mode: Mode = 'normal'): GameState {
  const s = emptyState(seed);
  s.mode = mode;
  s.levelIndex = startIndexForMode(mode); // easy starts in the endless range; normal at campaign level 0
  ensureChunk(s, gen, 0, 0);              // origin chunk holds the starting puzzle (gen must match `mode`)
  ensureMiners(s);                        // auto-place a miner on every starting deposit
  return s;
}

// Clear the player's BUILD on the current level (belts/splitters/tunnels + operators + in-flight
// items) for a fresh attempt at the SAME puzzle. Keeps the level, its target hub (un-erasable, it
// defines the goal), the revealed deposits, the loaded chunks, and the automatic miners (which are
// permanent — ensureMiners restores them after the wipe). The progress bar resets since the factory
// that filled it is gone. Contrast resetGame, a full "start over".
export function clearBuild(state: GameState): void {
  state.belts.clear();
  state.splitters.clear();
  state.tunnels.clear();
  for (const [key, b] of state.buildings) if (b.type !== 'target') state.buildings.delete(key);
  rebuildOccupancy(state); // drop the cleared footprints from the occupancy index
  state.items = [];
  state.nextItemId = 1;
  state.delivered = 0;
  state.misses = 0;
  ensureMiners(state); // miners are permanent — put them back on every deposit
}

// Wipe the deposit layer (nodes + their automatic miners) so a new set can be placed. Easy mode deals
// a FRESH hand of sources every puzzle, so its deposits change from one puzzle to the next. Keeps
// belts/operators/hub; call it just before granting the new deposits, then ensureMiners.
export function resetDeposits(state: GameState): void {
  state.nodes.clear();
  for (const [key, b] of state.buildings) if (b.type === 'miner') state.buildings.delete(key);
  rebuildOccupancy(state);
}

// Reset an existing game IN PLACE (so all live references keep working): clear the
// world and player build, then regenerate the origin puzzle fresh.
export function resetGame(state: GameState, seed: number, gen: ChunkGenerator, mode: Mode = state.mode): void {
  state.seed = seed;
  state.mode = mode; // may switch modes; `gen` must be built for the same mode
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
  state.levelIndex = startIndexForMode(mode); // BEFORE regen, so the origin puzzle matches the mode
  state.delivered = 0;
  state.misses = 0;
  state.status = 'playing';
  state.bestStars.clear(); // "Start Over" wipes ALL progress, including earned golf stars
  state.lastStars = 0;
  state.replayReturn = null; // MUST clear, else reconcileLevel would abort-replay back to the old level
  state.solvedCount = 0;
  state.starsTotal = 0;
  state.perfectCount = 0;
  ensureChunk(state, gen, 0, 0);
}
