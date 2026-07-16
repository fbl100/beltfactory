import { describe, it, expect } from 'vitest';
import { cellKey, parseKey, cellAt, setCell, itemAt, emptyState, DELTA } from './grid';

describe('sparse grid', () => {
  it('keys and parses cells including negatives', () => {
    expect(cellKey(-3, 4)).toBe('-3,4');
    expect(parseKey('-3,4')).toEqual({ x: -3, y: 4 });
  });
  it('sets, reads, and deletes cells at arbitrary coords', () => {
    const s = emptyState(1);
    setCell(s, -5, 20, { type: 'belt', dir: 'right' });
    expect(cellAt(s, -5, 20)).toEqual({ type: 'belt', dir: 'right' });
    expect(cellAt(s, 0, 0)).toBeUndefined();
    setCell(s, -5, 20, null);
    expect(cellAt(s, -5, 20)).toBeUndefined();
  });
  it('finds an item at a cell', () => {
    const s = emptyState(1);
    s.items.push({ id: 1, value: 5n, x: 2, y: 2, px: 2, py: 2 });
    expect(itemAt(s, 2, 2)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('builds an empty state with the given seed', () => {
    const s = emptyState(99);
    expect(s.seed).toBe(99);
    expect(s.cells.size).toBe(0);
    expect(s.status).toBe('playing');
  });
  it('exposes direction deltas', () => {
    expect(DELTA.right).toEqual({ dx: 1, dy: 0 });
    expect(DELTA.up).toEqual({ dx: 0, dy: -1 });
  });
});
