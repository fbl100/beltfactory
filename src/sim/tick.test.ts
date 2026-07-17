import { describe, it, expect } from 'vitest';
import { step } from './tick';
import { emptyState, setBelt, itemAt } from './grid';
import type { Direction } from './grid';
import type { BeltCell } from './entities';
import { createItem } from './items';
import { addBuilding } from './buildings';
import type { MinerBuilding, OperatorBuilding, TargetBuilding } from './buildings';

const belt = (dir: Direction): BeltCell => ({ type: 'belt', dir });

describe('tick: movement', () => {
  it('advances an item one cell along a belt', () => {
    const s = emptyState(1);
    setBelt(s, 0, 0, belt('right')); setBelt(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)).toBeUndefined();
  });
  it('records previous position for interpolation', () => {
    const s = emptyState(1);
    setBelt(s, 0, 0, belt('right')); setBelt(s, 1, 0, belt('right'));
    s.items.push(createItem(1, 3n, 0, 0));
    step(s);
    const it = itemAt(s, 1, 0)!;
    expect([it.px, it.py]).toEqual([0, 0]);
  });
  it('does not advance off the end of a belt', () => {
    const s = emptyState(1);
    setBelt(s, 0, 0, belt('right')); setBelt(s, 1, 0, belt('right')); // nothing at (2,0)
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    expect(itemAt(s, 0, 0)?.id).toBe(2);
  });
  it('advances a train downstream-first in one tick', () => {
    const s = emptyState(1);
    for (let x = 0; x < 4; x++) setBelt(s, x, 0, belt('right'));
    s.items.push(createItem(1, 1n, 1, 0));
    s.items.push(createItem(2, 2n, 0, 0));
    step(s);
    expect(itemAt(s, 2, 0)?.id).toBe(1);
    expect(itemAt(s, 1, 0)?.id).toBe(2);
  });
});

describe('tick: miner', () => {
  it('emits its value onto the out belt every N ticks', () => {
    const s = emptyState(1);
    const m: MinerBuilding = { type: 'miner', ax: 0, ay: 0, dir: 'right', value: 5n, everyTicks: 2, sinceEmit: 0 };
    addBuilding(s, m); // center (1,1) -> outCell (3,1)
    setBelt(s, 3, 1, belt('right'));
    step(s); // sinceEmit 1 (<2): no emit
    expect(itemAt(s, 3, 1)).toBeUndefined();
    step(s); // sinceEmit 2: emit
    expect(itemAt(s, 3, 1)?.value).toBe(5n);
  });
});

describe('tick: operator', () => {
  it('combines two side inputs and emits the sum after a one-tick settle', () => {
    const s = emptyState(1);
    const o: OperatorBuilding = { type: 'operator', ax: 1, ay: 1, dir: 'right', op: 'add', inputs: [] };
    addBuilding(s, o); // center (2,2); in edges (2,1)&(2,3); out (4,2)
    setBelt(s, 2, 0, belt('down')); // external belt feeding the top in-port
    setBelt(s, 2, 4, belt('up'));   // external belt feeding the bottom in-port
    setBelt(s, 4, 2, belt('right')); // out belt
    s.items.push(createItem(1, 7n, 2, 0));
    s.items.push(createItem(2, 5n, 2, 4));
    step(s); // both items absorbed into the operator's inputs
    expect(s.items.length).toBe(0);
    step(s); // produce() sees 2 inputs -> emits 12 on the out belt
    expect(itemAt(s, 4, 2)?.value).toBe(12n);
  });
});

describe('tick: target / win', () => {
  it('wins when the exact target value arrives', () => {
    const s = emptyState(1);
    const t: TargetBuilding = { type: 'target', ax: 0, ay: 0, dir: 'right', target: 9n };
    addBuilding(s, t); // center (1,1); accepts on all 4 edges (left edge = (0,1))
    setBelt(s, -1, 1, belt('right')); // feeds the left edge (0,1)
    s.items.push(createItem(1, 9n, -1, 1));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('won');
  });
  it('counts a miss without winning on a wrong value', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'target', ax: 0, ay: 0, dir: 'right', target: 9n });
    setBelt(s, -1, 1, belt('right'));
    s.items.push(createItem(1, 8n, -1, 1));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.misses).toBe(1);
  });
  it('an item stepping onto a non-port footprint cell stops (no crash, no consume)', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'operator', ax: 1, ay: 1, dir: 'right', op: 'add', inputs: [] }); // center (2,2)
    setBelt(s, 0, 1, belt('right')); // (0,1) -> corner (1,1), not an in-port
    s.items.push(createItem(1, 3n, 0, 1));
    step(s);
    expect(itemAt(s, 0, 1)?.id).toBe(1); // stayed put
    expect(s.items.length).toBe(1);
  });
});
