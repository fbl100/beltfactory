import { describe, it, expect } from 'vitest';
import { placeBelt, removeCell } from './place';
import { emptyState, cellAt, setCell } from '../sim/grid';

describe('input.place', () => {
  it('places a belt on an empty cell (any coordinate)', () => {
    const s = emptyState(1);
    expect(placeBelt(s, -4, 20, 'right')).toBe(true);
    expect(cellAt(s, -4, 20)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('refuses to overwrite a non-empty cell', () => {
    const s = emptyState(1);
    setCell(s, 1, 1, { type: 'sink', target: 5n });
    expect(placeBelt(s, 1, 1, 'right')).toBe(false);
  });
  it('removes only belts', () => {
    const s = emptyState(1);
    placeBelt(s, 0, 0, 'up');
    setCell(s, 1, 0, { type: 'sink', target: 5n });
    expect(removeCell(s, 0, 0)).toBe(true);
    expect(cellAt(s, 0, 0)).toBeUndefined();
    expect(removeCell(s, 1, 0)).toBe(false);
  });
});
