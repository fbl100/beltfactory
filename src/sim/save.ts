import type { GameState } from './grid';
import { rebuildOccupancy } from './buildings';

export const SAVE_VERSION = 4;

// Versions this reader can still load. v3 (pre-progression, single fixed target) is migrated
// on load: it deserializes faithfully, then reconcileLevel() (called at boot) rolls it into
// level 0 — the family's built factory survives the upgrade.
const READABLE_VERSIONS = new Set([3, 4]);

// JSON has no BigInt: encode as { __big: "<decimal>" } and revive on load.
function replacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? { __big: value.toString() } : value;
}
function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__big' in (value as any)) return BigInt((value as any).__big);
  return value;
}

export function serialize(state: GameState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: state.seed,
    tick: state.tick,
    status: state.status,
    nextItemId: state.nextItemId,
    levelIndex: state.levelIndex,
    delivered: state.delivered,
    items: state.items,
    belts: [...state.belts.entries()],
    splitters: [...state.splitters.entries()],
    tunnels: [...state.tunnels.entries()],
    buildings: [...state.buildings.entries()],
    nodes: [...state.nodes.entries()],
    chunks: [...state.loadedChunks],
    // occupancy (derived) and misses (session feedback) are intentionally not saved.
  }, replacer);
}

export function deserialize(json: string): GameState {
  const o = JSON.parse(json, reviver);
  if (!READABLE_VERSIONS.has(o.version)) throw new Error(`unsupported save version ${o.version}`);
  const state: GameState = {
    version: o.version,
    seed: o.seed,
    tick: o.tick,
    status: o.status,
    nextItemId: o.nextItemId,
    levelIndex: typeof o.levelIndex === 'number' ? o.levelIndex : 0, // v3 has no levelIndex -> 0
    delivered: o.delivered ?? 0,
    items: o.items,
    belts: new Map(o.belts),
    splitters: new Map(o.splitters ?? []),
    tunnels: new Map(o.tunnels ?? []),
    buildings: new Map(o.buildings),
    nodes: new Map(o.nodes),
    occupancy: new Map(),
    loadedChunks: new Set(o.chunks),
    misses: 0,
  };
  rebuildOccupancy(state); // derive the spatial index from the buildings map
  return state;
}
