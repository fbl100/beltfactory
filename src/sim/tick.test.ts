import { describe, it, expect } from 'vitest';
import { step } from './tick';
import { emptyState, setCell, itemAt } from './grid';
import { createItem } from './items';
import type { Cell } from './entities';

const belt = (dir: any): Cell => ({ type: 'belt', dir });

describe('tick: movement', () => {
  it('advances an item one cell along a belt', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('records previous position for interpolation', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    const it = itemAt(s, 1, 0)!;
    expect([it.px, it.py]).toEqual([0, 0]);
  });
  it('does not advance off the end of a belt', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right')); setCell(s, 1, 0, belt('right')); // nothing at (2,0)
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)?.id).toBe(2);
  });
  it('advances a train downstream-first in one tick', () => {
    const s = emptyState(1);
    for (let x = 0; x < 4; x++) setCell(s, x, 0, belt('right'));
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 2, 0)?.id).toBe(1);
    expect(itemAt(s, 1, 0)?.id).toBe(2);
  });
});

describe('tick: extractor', () => {
  it('emits every N ticks onto the belt in front', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, { type: 'extractor', dir: 'right', value: 5n, everyTicks: 2, sinceEmit: 0 });
    setCell(s, 1, 0, belt('right'));
    step(s);
    expect(itemAt(s, 1, 0)).toBeUndefined();
    step(s);
    expect(itemAt(s, 1, 0)?.value).toBe(5n);
  });
});

describe('tick: operator', () => {
  it('combines two inputs into a OP b on the output cell', () => {
    const s = emptyState(1);
    setCell(s, 1, 1, { type: 'operator', op: 'add', dir: 'right', inputs: [] });
    setCell(s, 2, 1, belt('right'));
    setCell(s, 0, 1, belt('right'));
    setCell(s, 1, 0, belt('down'));
    s.items.push(createItem(1, 7n, 0, 1));
    s.items.push(createItem(2, 4n, 1, 0));
    step(s);
    expect(s.items.length).toBe(0);
    step(s);
    expect(itemAt(s, 2, 1)?.value).toBe(11n);
  });
});

describe('tick: sink / win', () => {
  it('consumes an item and wins when it equals the target', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, { type: 'sink', target: 9n });
    s.items.push(createItem(1, 9n, 0, 0));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('won');
  });
  it('consumes without winning when value != target', () => {
    const s = emptyState(1);
    setCell(s, 0, 0, belt('right'));
    setCell(s, 1, 0, { type: 'sink', target: 9n });
    s.items.push(createItem(1, 8n, 0, 0));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('playing');
  });
});
