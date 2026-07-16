import { describe, it, expect } from 'vitest';
import { placeBelt, removeCell, paintBeltLine, eraseBeltLine } from './place';
import { emptyState, cellAt, setCell } from '../sim/grid';
import { createItem } from '../sim/items';

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
  it('drops an item sitting on a removed belt (no orphaned items)', () => {
    const s = emptyState(1);
    placeBelt(s, 3, 3, 'right');
    s.items.push(createItem(1, 9n, 3, 3));
    expect(removeCell(s, 3, 3)).toBe(true);
    expect(s.items.length).toBe(0);
  });
});

describe('input.paint (drag)', () => {
  it('paints a straight run, every belt pointing along it', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 3, 0, 'right');
    for (let x = 0; x <= 3; x++) expect(cellAt(s, x, 0)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('orients an L-bend corner toward the turn', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 2, 0, 'right'); // drag right
    paintBeltLine(s, 2, 0, 2, 2, 'right'); // then drag down from the corner
    expect(cellAt(s, 1, 0)).toEqual({ type: 'belt', dir: 'right' });
    expect(cellAt(s, 2, 0)).toEqual({ type: 'belt', dir: 'down' }); // corner turns
    expect(cellAt(s, 2, 1)).toEqual({ type: 'belt', dir: 'down' });
    expect(cellAt(s, 2, 2)).toEqual({ type: 'belt', dir: 'down' });
  });
  it('a single-cell paint honors the HUD direction (a plain click)', () => {
    const s = emptyState(1);
    paintBeltLine(s, 5, 5, 5, 5, 'up');
    expect(cellAt(s, 5, 5)).toEqual({ type: 'belt', dir: 'up' });
  });
  it('paints across a machine without overwriting it', () => {
    const s = emptyState(1);
    setCell(s, 2, 0, { type: 'operator', op: 'add', dir: 'right', inputs: [] });
    paintBeltLine(s, 0, 0, 4, 0, 'right');
    expect(cellAt(s, 2, 0)).toMatchObject({ type: 'operator' }); // preserved
    expect(cellAt(s, 1, 0)).toEqual({ type: 'belt', dir: 'right' }); // belt feeds into it
    expect(cellAt(s, 3, 0)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('erases belts along a path but leaves machines', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 3, 0, 'right');
    setCell(s, 2, 0, { type: 'sink', target: 5n });
    eraseBeltLine(s, 0, 0, 3, 0);
    expect(cellAt(s, 0, 0)).toBeUndefined();
    expect(cellAt(s, 1, 0)).toBeUndefined();
    expect(cellAt(s, 2, 0)).toMatchObject({ type: 'sink' }); // survives
    expect(cellAt(s, 3, 0)).toBeUndefined();
  });
});
