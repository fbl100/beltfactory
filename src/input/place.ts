import { GameState, cellAt, setCell } from '../sim/grid';
import type { Direction } from '../sim/grid';

export function placeBelt(state: GameState, x: number, y: number, dir: Direction): boolean {
  if (cellAt(state, x, y)) return false;
  setCell(state, x, y, { type: 'belt', dir });
  return true;
}

export function removeCell(state: GameState, x: number, y: number): boolean {
  const cell = cellAt(state, x, y);
  if (cell?.type !== 'belt') return false;
  setCell(state, x, y, null);
  return true;
}
