import type { Cell } from './entities';
import type { Item } from './items';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export interface GameState {
  version: number;
  seed: number;
  tick: number;
  cells: Map<string, Cell>;
  loadedChunks: Set<string>;
  items: Item[];
  nextItemId: number;
  status: 'playing' | 'won';
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseKey(key: string): { x: number; y: number } {
  const c = key.indexOf(',');
  return { x: Number(key.slice(0, c)), y: Number(key.slice(c + 1)) };
}

export function cellAt(state: GameState, x: number, y: number): Cell | undefined {
  return state.cells.get(cellKey(x, y));
}

export function setCell(state: GameState, x: number, y: number, cell: Cell | null): void {
  const k = cellKey(x, y);
  if (cell) state.cells.set(k, cell);
  else state.cells.delete(k);
}

export function itemAt(state: GameState, x: number, y: number): Item | undefined {
  return state.items.find((it) => it.x === x && it.y === y);
}

export function emptyState(seed: number): GameState {
  return {
    version: 1, seed, tick: 0,
    cells: new Map(), loadedChunks: new Set(),
    items: [], nextItemId: 1, status: 'playing',
  };
}
