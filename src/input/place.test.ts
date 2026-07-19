import { describe, it, expect } from 'vitest';
import {
  paintBeltLine, routeBeltCells, autoConnectBeltEnd, planBeltRun, placeBeltCells,
  removeCell, eraseAt, eraseLine,
  canPlaceOperator, placeOperator, placeSplitter, placeTunnel, placeSquare,
} from './place';
import { emptyState, beltAt, splitterAt, tunnelAt, cellKey } from '../sim/grid';
import { addBuilding, buildingAt } from '../sim/buildings';
import { createItem } from '../sim/items';

describe('input.placeSquare (x² is a multiply-family tool)', () => {
  it('builds a squarer in normal mode but never in easy mode', () => {
    const normal = emptyState(1); // mode defaults to 'normal'
    expect(placeSquare(normal, 5, 5, 'right')).toBe(true);
    expect(buildingAt(normal, 5, 5)?.type).toBe('square');

    const easy = emptyState(1); easy.mode = 'easy';
    expect(placeSquare(easy, 5, 5, 'right')).toBe(false); // forbidden in +/− easy mode
    expect(buildingAt(easy, 5, 5)).toBeUndefined();
  });
});

describe('input.belts (footprint-aware)', () => {
  it('paints a straight run', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 3, 0, 'right');
    for (let x = 0; x <= 3; x++) expect(beltAt(s, x, 0)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('orients an L-bend corner toward the turn', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 2, 0, 'right');
    paintBeltLine(s, 2, 0, 2, 2, 'right');
    expect(beltAt(s, 2, 0)).toEqual({ type: 'belt', dir: 'down' });
    expect(beltAt(s, 2, 2)).toEqual({ type: 'belt', dir: 'down' });
  });
  it('does not paint over a building footprint', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'operator', ax: 2, ay: -1, dir: 'right', op: 'add', inputs: [], everyTicks: 20, sinceProduce: 0 }); // 1x3 vertical: (2,-1),(2,0),(2,1)
    paintBeltLine(s, 0, 0, 5, 0, 'right');
    expect(beltAt(s, 1, 0)).toEqual({ type: 'belt', dir: 'right' });
    expect(beltAt(s, 2, 0)).toBeUndefined(); // the one building cell on this row — skipped
    expect(beltAt(s, 3, 0)).toEqual({ type: 'belt', dir: 'right' }); // no longer covered (1x3, not 3x3)
    expect(beltAt(s, 5, 0)).toEqual({ type: 'belt', dir: 'right' });
  });
  it('removeCell drops a stranded item', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 0, 0, 'right');
    s.items.push(createItem(1, 9n, 0, 0));
    expect(removeCell(s, 0, 0)).toBe(true);
    expect(s.items.length).toBe(0);
  });
});

describe('input.buildings', () => {
  it('placeOperator rejects on overlap', () => {
    const s = emptyState(1);
    expect(canPlaceOperator(s, 5, 5, 'right')).toBe(true);
    expect(placeOperator(s, 5, 5, 'right')).toBe(true); // 1x3 vertical: (5,4),(5,5),(5,6)
    expect(placeOperator(s, 5, 7, 'right')).toBe(false); // would re-cover (5,6)
  });
});

describe('input.splitters', () => {
  it('places a splitter on an empty cell and rejects when blocked', () => {
    const s = emptyState(1);
    expect(placeSplitter(s, 4, 4, 'right')).toBe(true);
    expect(splitterAt(s, 4, 4)?.type).toBe('splitter');
    expect(placeSplitter(s, 4, 4, 'right')).toBe(false); // already occupied
  });
  it('belt paint does not overwrite a splitter', () => {
    const s = emptyState(1);
    placeSplitter(s, 2, 0, 'right');
    paintBeltLine(s, 0, 0, 4, 0, 'right');
    expect(splitterAt(s, 2, 0)?.type).toBe('splitter'); // preserved
    expect(beltAt(s, 1, 0)).toEqual({ type: 'belt', dir: 'right' });
    expect(beltAt(s, 2, 0)).toBeUndefined();
  });
  it('eraseAt removes a splitter and drops its item', () => {
    const s = emptyState(1);
    placeSplitter(s, 3, 3, 'right');
    s.items.push(createItem(1, 9n, 3, 3));
    expect(eraseAt(s, 3, 3)).toBe(true);
    expect(splitterAt(s, 3, 3)).toBeUndefined();
    expect(s.items.length).toBe(0);
  });
});

describe('input.tunnels', () => {
  it('places tunnel entrance/exit tiles and rejects on blocked cells', () => {
    const s = emptyState(1);
    expect(placeTunnel(s, 0, 0, 'right', 'in')).toBe(true);
    expect(placeTunnel(s, 3, 0, 'right', 'out')).toBe(true);
    expect(tunnelAt(s, 0, 0)).toEqual({ type: 'tunnel', dir: 'right', role: 'in' });
    expect(tunnelAt(s, 3, 0)).toEqual({ type: 'tunnel', dir: 'right', role: 'out' });
    expect(placeTunnel(s, 0, 0, 'right', 'in')).toBe(false); // already occupied
  });
  it('belt paint does not overwrite a tunnel; erase removes it', () => {
    const s = emptyState(1);
    placeTunnel(s, 2, 0, 'right', 'in');
    paintBeltLine(s, 0, 0, 4, 0, 'right');
    expect(tunnelAt(s, 2, 0)?.role).toBe('in'); // preserved
    expect(beltAt(s, 2, 0)).toBeUndefined();
    expect(eraseAt(s, 2, 0)).toBe(true);
    expect(tunnelAt(s, 2, 0)).toBeUndefined();
  });
});

describe('input.erase', () => {
  it('erases a belt', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 0, 0, 'right');
    expect(eraseAt(s, 0, 0)).toBe(true);
    expect(beltAt(s, 0, 0)).toBeUndefined();
  });
  it('erases a whole building from any footprint cell', () => {
    const s = emptyState(1);
    placeOperator(s, 5, 5, 'right'); // 1x3 vertical: (5,4),(5,5),(5,6)
    expect(eraseAt(s, 5, 6)).toBe(true); // non-anchor footprint cell
    expect(buildingAt(s, 5, 5)).toBeUndefined();
  });
  it('refuses to erase the target', () => {
    const s = emptyState(1);
    addBuilding(s, { type: 'target', ax: 0, ay: 0, dir: 'right', target: 12n, required: 5 , par: 0});
    expect(eraseAt(s, 1, 1)).toBe(false);
    expect(buildingAt(s, 1, 1)?.type).toBe('target');
  });
  it('refuses to erase a miner (miners are automatic + permanent)', () => {
    const s = emptyState(1);
    s.nodes.set(cellKey(5, 5), { x: 5, y: 5, value: 7n });
    // Miners are auto-placed (world.ts ensureMiners); place one directly for this test.
    expect(addBuilding(s, { type: 'miner', ax: 4, ay: 4, dir: 'right', value: 7n, everyTicks: 5, sinceEmit: 0 })).toBe(true);
    expect(eraseAt(s, 5, 5)).toBe(false);      // center cell
    expect(eraseAt(s, 4, 4)).toBe(false);      // a non-anchor footprint cell
    expect(buildingAt(s, 5, 5)?.type).toBe('miner');
  });
  it('eraseLine removes belts along a path but leaves nodes', () => {
    const s = emptyState(1);
    paintBeltLine(s, 0, 0, 3, 0, 'right');
    s.nodes.set(cellKey(2, 0), { x: 2, y: 0, value: 5n });
    eraseLine(s, 0, 0, 3, 0);
    for (let x = 0; x <= 3; x++) expect(beltAt(s, x, 0)).toBeUndefined();
    expect(s.nodes.get(cellKey(2, 0))?.value).toBe(5n);
  });
});

describe('input.belt click-route (ghost === commit)', () => {
  it('routeBeltCells is a horizontal-first L, each belt aimed at the next cell', () => {
    const cells = routeBeltCells(0, 0, 2, 3, 'right');
    expect(cells).toEqual([
      { x: 0, y: 0, dir: 'right' }, { x: 1, y: 0, dir: 'right' }, // across first
      { x: 2, y: 0, dir: 'down' },  { x: 2, y: 1, dir: 'down' },  // then down
      { x: 2, y: 2, dir: 'down' },  { x: 2, y: 3, dir: 'down' },
    ]);
  });

  it('routeBeltCells verticalFirst flips the elbow (down first, then across)', () => {
    const cells = routeBeltCells(0, 0, 2, 3, 'down', true);
    expect(cells).toEqual([
      { x: 0, y: 0, dir: 'down' },  { x: 0, y: 1, dir: 'down' },  // down first
      { x: 0, y: 2, dir: 'down' },  { x: 0, y: 3, dir: 'right' }, // then across
      { x: 1, y: 3, dir: 'right' }, { x: 2, y: 3, dir: 'right' },
    ]);
  });

  it('autoConnectBeltEnd aims the last belt into an adjacent target port', () => {
    const s = emptyState(1);
    // target 3x3 at (5,5): center (6,6), so its LEFT input port is (5,6).
    addBuilding(s, { type: 'target', ax: 5, ay: 5, dir: 'right', target: 6n, required: 8, par: 0 });
    // approach the port cell's neighbor (4,6) from above, so the natural end dir is 'down'...
    const cells = routeBeltCells(4, 0, 4, 6, 'down');
    expect(cells[cells.length - 1].dir).toBe('down');
    autoConnectBeltEnd(s, cells);
    expect(cells[cells.length - 1].dir).toBe('right'); // ...auto-turned to deliver into the port at (5,6)
  });

  it('planBeltRun skips machine cells so the ghost shows the real gap', () => {
    const s = emptyState(1);
    // 1x3 vertical operator at (2,-1): occupies (2,-1),(2,0),(2,1)
    addBuilding(s, { type: 'operator', ax: 2, ay: -1, dir: 'right', op: 'add', inputs: [], everyTicks: 20, sinceProduce: 0 });
    const plan = planBeltRun(s, 0, 0, 5, 0, 'right');
    expect(plan.some((c) => c.x === 2 && c.y === 0)).toBe(false); // the operator cell is dropped
    // committing the plan places exactly the ghost cells — and nothing on the machine
    placeBeltCells(s, plan);
    expect(beltAt(s, 1, 0)?.dir).toBe('right');
    expect(beltAt(s, 2, 0)).toBeUndefined();
    expect(beltAt(s, 3, 0)?.dir).toBe('right');
  });
});
