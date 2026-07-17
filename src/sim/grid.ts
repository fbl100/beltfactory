import type { BeltCell, SplitterCell, TunnelCell, ResourceNode } from './entities';
import type { Building } from './buildings';
import type { Item } from './items';

export type Direction = 'up' | 'down' | 'left' | 'right';

// Clockwise on a y-down screen: up -> right -> down -> left.
export const DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left'];

export const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const RIGHT_OF: Record<Direction, Direction> = { up: 'right', right: 'down', down: 'left', left: 'up' };
export const LEFT_OF: Record<Direction, Direction> = { up: 'left', left: 'down', down: 'right', right: 'up' };

export interface GameState {
  version: number;
  seed: number;
  tick: number;
  belts: Map<string, BeltCell>;          // 1x1
  splitters: Map<string, SplitterCell>;  // 1x1, round-robin a stream across outgoing belts
  tunnels: Map<string, TunnelCell>;      // 1x1, underground belt entrance/exit pairs
  buildings: Map<string, Building>;      // key = cellKey(anchor) = top-left of the 3x3
  nodes: Map<string, ResourceNode>;      // passive ground layer
  occupancy: Map<string, string>;        // DERIVED: footprint cell key -> building anchor key; never serialized
  loadedChunks: Set<string>;
  items: Item[];
  nextItemId: number;
  levelIndex: number;                    // which LEVELS entry is active (the current goal)
  delivered: number;                     // correct targets delivered toward the level's required count
  misses: number;                        // wrong-value-at-target count (feedback; not serialized)
  status: 'playing' | 'won';
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(key: string): { x: number; y: number } {
  const c = key.indexOf(',');
  return { x: Number(key.slice(0, c)), y: Number(key.slice(c + 1)) };
}

export function beltAt(state: GameState, x: number, y: number): BeltCell | undefined {
  return state.belts.get(cellKey(x, y));
}

export function setBelt(state: GameState, x: number, y: number, cell: BeltCell | null): void {
  const k = cellKey(x, y);
  if (cell) state.belts.set(k, cell);
  else state.belts.delete(k);
}

export function splitterAt(state: GameState, x: number, y: number): SplitterCell | undefined {
  return state.splitters.get(cellKey(x, y));
}

export function setSplitter(state: GameState, x: number, y: number, cell: SplitterCell | null): void {
  const k = cellKey(x, y);
  if (cell) state.splitters.set(k, cell);
  else state.splitters.delete(k);
}

export function tunnelAt(state: GameState, x: number, y: number): TunnelCell | undefined {
  return state.tunnels.get(cellKey(x, y));
}

export function setTunnel(state: GameState, x: number, y: number, cell: TunnelCell | null): void {
  const k = cellKey(x, y);
  if (cell) state.tunnels.set(k, cell);
  else state.tunnels.delete(k);
}

export function nodeAt(state: GameState, x: number, y: number): ResourceNode | undefined {
  return state.nodes.get(cellKey(x, y));
}

export function itemAt(state: GameState, x: number, y: number): Item | undefined {
  return state.items.find((it) => it.x === x && it.y === y);
}

export function emptyState(seed: number): GameState {
  return {
    version: 2, seed, tick: 0,
    belts: new Map(), splitters: new Map(), tunnels: new Map(), buildings: new Map(), nodes: new Map(), occupancy: new Map(),
    loadedChunks: new Set(),
    items: [], nextItemId: 1, levelIndex: 0, delivered: 0, misses: 0, status: 'playing',
  };
}
