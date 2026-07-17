import { describe, it, expect } from 'vitest';
import { step } from './tick';
import { emptyState, setBelt, setSplitter, setTunnel, itemAt } from './grid';
import type { Direction } from './grid';
import type { BeltCell } from './entities';
import { createItem } from './items';
import { addBuilding, buildingAt } from './buildings';
import type { MinerBuilding, OperatorBuilding, TargetBuilding } from './buildings';
import { LEVELS } from '../content/levels';

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
  it('emits onto every connected output belt in one cycle (wide output)', () => {
    const s = emptyState(1);
    const m: MinerBuilding = { type: 'miner', ax: 0, ay: 0, dir: 'right', value: 7n, everyTicks: 2, sinceEmit: 0 };
    addBuilding(s, m); // front (right) outputs: (3,0),(3,1),(3,2)
    setBelt(s, 3, 0, belt('right'));
    setBelt(s, 3, 1, belt('right'));
    setBelt(s, 3, 2, belt('right'));
    step(s); step(s); // reach the emit cycle
    expect(itemAt(s, 3, 0)?.value).toBe(7n);
    expect(itemAt(s, 3, 1)?.value).toBe(7n);
    expect(itemAt(s, 3, 2)?.value).toBe(7n);
  });
});

describe('tick: operator (1x3)', () => {
  // dir right -> vertical bar: anchor (2,1); cells (2,1),(2,2),(2,3); center (2,2);
  // tips (2,1)&(2,3); outputs (3,2) [facing] and (1,2) [fallback].
  const opRight = (): OperatorBuilding => ({ type: 'operator', ax: 2, ay: 1, dir: 'right', op: 'add', inputs: [], everyTicks: 1, sinceProduce: 0 });

  it('combines two tip inputs and emits the sum after a one-tick settle', () => {
    const s = emptyState(1);
    addBuilding(s, opRight());
    setBelt(s, 2, 0, belt('down')); // feeds the top tip (2,1) from above
    setBelt(s, 2, 4, belt('up'));   // feeds the bottom tip (2,3) from below
    setBelt(s, 3, 2, belt('right')); // out belt (facing side)
    s.items.push(createItem(1, 7n, 2, 0));
    s.items.push(createItem(2, 5n, 2, 4));
    step(s); // both items absorbed into the operator's tips
    expect(s.items.length).toBe(0);
    step(s); // produce() sees 2 inputs -> emits 12 on the out belt
    expect(itemAt(s, 3, 2)?.value).toBe(12n);
  });
  it('any exposed edge of a tip accepts input (side approach, not just end-on)', () => {
    const s = emptyState(1);
    addBuilding(s, opRight());
    setBelt(s, 1, 1, belt('right')); // approaches the top tip (2,1) from its LEFT edge
    setBelt(s, 3, 3, belt('left'));  // approaches the bottom tip (2,3) from its RIGHT edge
    setBelt(s, 3, 2, belt('right')); // out
    s.items.push(createItem(1, 4n, 1, 1));
    s.items.push(createItem(2, 6n, 3, 3));
    for (let i = 0; i < 3; i++) step(s);
    expect(itemAt(s, 3, 2)?.value).toBe(10n); // 4 + 6, fed in from the sides
  });
  it('emits from the fallback edge when the facing output is blocked', () => {
    const s = emptyState(1);
    addBuilding(s, opRight());
    setBelt(s, 2, 0, belt('down'));
    setBelt(s, 2, 4, belt('up'));
    setBelt(s, 1, 2, belt('left')); // ONLY the fallback edge (1,2) has a belt; facing (3,2) has none
    s.items.push(createItem(1, 7n, 2, 0));
    s.items.push(createItem(2, 5n, 2, 4));
    step(s); step(s);
    expect(itemAt(s, 1, 2)?.value).toBe(12n); // emerged from the other middle edge
  });
  it('applies the operator op (× here) to its two inputs', () => {
    const s = emptyState(1);
    const o = { ...opRight(), op: 'multiply' as const };
    addBuilding(s, o);
    setBelt(s, 2, 0, belt('down'));
    setBelt(s, 2, 4, belt('up'));
    setBelt(s, 3, 2, belt('right'));
    s.items.push(createItem(1, 5n, 2, 0));
    s.items.push(createItem(2, 10n, 2, 4));
    step(s); step(s);
    expect(itemAt(s, 3, 2)?.value).toBe(50n); // 5 × 10
  });
  it('holds one input per tip: two items from the SAME belt never pair together', () => {
    const s = emptyState(1);
    const o = { ...opRight(), op: 'multiply' as const };
    addBuilding(s, o); // top tip (2,1), bottom tip (2,3), out (3,2)
    setBelt(s, 2, -1, belt('down')); // top feed lane (two 3s queue here)
    setBelt(s, 2, 0, belt('down'));
    setBelt(s, 3, 2, belt('right')); // out belt
    s.items.push(createItem(1, 3n, 2, 0));
    s.items.push(createItem(2, 3n, 2, -1));
    for (let i = 0; i < 5; i++) step(s);
    // only ONE 3 can occupy the top tip; the second waits — a 3×3=9 must never be produced
    expect(s.items.every((it) => it.value !== 9n)).toBe(true);
    expect((buildingAt(s, 2, 2) as OperatorBuilding).inputs.length).toBe(1);
    // feed a 2 into the OTHER (bottom) tip -> now two different belts pair -> 2×3 = 6
    setBelt(s, 2, 4, belt('up'));
    s.items.push(createItem(3, 2n, 2, 4));
    for (let i = 0; i < 5; i++) step(s);
    expect(s.items.some((it) => it.value === 6n)).toBe(true);
    expect(s.items.some((it) => it.value === 9n)).toBe(false);
  });
});

describe('tick: splitter', () => {
  it('an item rides a belt into a splitter and out an output belt', () => {
    const s = emptyState(1);
    setBelt(s, 0, 0, belt('right'));
    setSplitter(s, 1, 0, { type: 'splitter', dir: 'right', next: 1 }); // prefer east first
    setBelt(s, 2, 0, belt('right'));
    s.items.push(createItem(1, 9n, 0, 0));
    step(s); // (0,0) -> splitter (1,0)
    expect(itemAt(s, 1, 0)?.id).toBe(1);
    step(s); // splitter -> east belt (2,0)
    expect(itemAt(s, 2, 0)?.id).toBe(1);
  });
  it('round-robins consecutive items across two outgoing belts', () => {
    const s = emptyState(1);
    setSplitter(s, 2, 0, { type: 'splitter', dir: 'right', next: 0 });
    setBelt(s, 3, 0, belt('right')); // east output
    setBelt(s, 2, 1, belt('down'));  // south output
    s.items.push(createItem(1, 7n, 2, 0));
    step(s); // item1 leaves to one output
    s.items.push(createItem(2, 5n, 2, 0));
    step(s); // item2 leaves to the *other* output
    const eastId = itemAt(s, 3, 0)?.id;
    const southId = itemAt(s, 2, 1)?.id;
    expect(eastId).toBeDefined();
    expect(southId).toBeDefined();
    expect(eastId).not.toBe(southId);
  });
});

describe('tick: tunnel', () => {
  it('an item dives at the entrance and emerges past the exit, under a crossing belt', () => {
    const s = emptyState(1);
    setBelt(s, -1, 0, belt('right'));
    setTunnel(s, 0, 0, { type: 'tunnel', dir: 'right', role: 'in' });
    // covered cells (1,0),(2,0): a surface belt crosses overhead going down
    setBelt(s, 1, 0, belt('down'));
    setBelt(s, 1, 1, belt('down'));
    setTunnel(s, 3, 0, { type: 'tunnel', dir: 'right', role: 'out' });
    setBelt(s, 4, 0, belt('right'));
    s.items.push(createItem(1, 7n, -1, 0)); // tunneling item
    s.items.push(createItem(2, 9n, 1, 0));  // crossing surface item
    for (let i = 0; i < 6; i++) step(s);
    const t1 = s.items.find((it) => it.id === 1)!;
    const t2 = s.items.find((it) => it.id === 2)!;
    expect(t1.x).toBeGreaterThanOrEqual(3); // emerged at/past the exit, not stuck at the entrance
    expect(t2.y).toBeGreaterThan(0);        // crossing item went down independently (not sucked in)
  });
  it('an item at an entrance with no exit in range just waits (no crash)', () => {
    const s = emptyState(1);
    setTunnel(s, 0, 0, { type: 'tunnel', dir: 'right', role: 'in' }); // no matching exit ahead
    s.items.push(createItem(1, 7n, 0, 0));
    step(s);
    expect(itemAt(s, 0, 0)?.id).toBe(1);
    expect(s.items.length).toBe(1);
  });
});

describe('tick: target / win', () => {
  it('counts each correct delivery and wins at the required count on the final level', () => {
    const s = emptyState(1);
    s.levelIndex = LEVELS.length - 1; // final level: filling the bar wins the whole game
    const t: TargetBuilding = { type: 'target', ax: 0, ay: 0, dir: 'right', target: 9n, required: 2 };
    addBuilding(s, t); // center (1,1); accepts on all 4 edges (left edge = (0,1))
    setBelt(s, -1, 1, belt('right')); // feeds the left edge (0,1)
    s.items.push(createItem(1, 9n, -1, 1));
    step(s);
    expect(s.delivered).toBe(1);
    expect(s.status).toBe('playing'); // 1 of 2
    s.items.push(createItem(2, 9n, -1, 1));
    step(s);
    expect(s.delivered).toBe(2);
    expect(s.status).toBe('won'); // reached the required count
  });

  it('reaching the required count on a non-final level advances the goal instead of winning', () => {
    const s = emptyState(1);
    s.levelIndex = 0; // not the final level
    const t: TargetBuilding = { type: 'target', ax: 0, ay: 0, dir: 'right', target: 9n, required: 2 };
    addBuilding(s, t);
    setBelt(s, -1, 1, belt('right'));
    s.items.push(createItem(1, 9n, -1, 1));
    s.items.push(createItem(2, 9n, -3, 1)); // two feed cells so both arrive
    setBelt(s, -3, 1, belt('right'));
    setBelt(s, -2, 1, belt('right'));
    for (let i = 0; i < 6; i++) step(s);
    expect(s.status).toBe('playing');       // advanced, not won
    expect(s.levelIndex).toBe(1);           // moved to level 1
    expect(t.target).toBe(LEVELS[1].target); // hub re-pointed at the next goal
    expect(s.delivered).toBe(0);            // bar reset for the new level
  });
  it('counts a miss (not a delivery) on a wrong value', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'target', ax: 0, ay: 0, dir: 'right', target: 9n, required: 3 });
    setBelt(s, -1, 1, belt('right'));
    s.items.push(createItem(1, 8n, -1, 1));
    step(s);
    expect(s.items.length).toBe(0);
    expect(s.delivered).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.misses).toBe(1);
  });
  it('does not punish leftover output equal to a PREVIOUS level target after advancing', () => {
    const s = emptyState(1);
    s.levelIndex = 1; // LEVELS[0].target is now a stale value the old factory still makes
    addBuilding(s, { type: 'target', ax: 0, ay: 0, dir: 'right', target: LEVELS[1].target, required: 5 });
    setBelt(s, -1, 1, belt('right'));
    s.items.push(createItem(1, LEVELS[0].target, -1, 1)); // e.g. still delivering 12 when the goal is 20
    setBelt(s, -3, 1, belt('right'));
    s.items.push(createItem(2, 999n, -3, 1));             // a genuinely wrong value, though
    setBelt(s, -2, 1, belt('right'));
    for (let i = 0; i < 4; i++) step(s);
    expect(s.delivered).toBe(0);
    expect(s.misses).toBe(1); // only the truly-wrong 999 counts; the stale old-target value doesn't
  });
  it('an item entering the center (output) cell of an operator is not consumed (no crash)', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'operator', ax: 1, ay: 1, dir: 'right', op: 'add', inputs: [], everyTicks: 1, sinceProduce: 0 }); // 1x3 vertical; center (1,2)
    setBelt(s, 2, 2, belt('left')); // (2,2) -> center (1,2): an output edge, not an input tip
    s.items.push(createItem(1, 3n, 2, 2));
    step(s);
    expect(itemAt(s, 2, 2)?.id).toBe(1); // stayed put
    expect(s.items.length).toBe(1);
  });
});
