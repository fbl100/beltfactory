import type { GameState } from './grid';

export const SAVE_VERSION = 1;

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
    items: state.items,
    cells: [...state.cells.entries()],   // Map -> [key, cell][]
    chunks: [...state.loadedChunks],     // Set -> string[]
  }, replacer);
}

export function deserialize(json: string): GameState {
  const o = JSON.parse(json, reviver);
  return {
    version: o.version,
    seed: o.seed,
    tick: o.tick,
    status: o.status,
    nextItemId: o.nextItemId,
    items: o.items,
    cells: new Map(o.cells),
    loadedChunks: new Set(o.chunks),
  };
}
