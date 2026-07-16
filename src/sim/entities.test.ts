import { describe, it, expect } from 'vitest';
import { accepts, Cell } from './entities';

describe('entities.accepts', () => {
  it('belt accepts', () => { expect(accepts({ type: 'belt', dir: 'right' }, 0)).toBe(true); });
  it('sink always accepts', () => { expect(accepts({ type: 'sink', target: 10n }, 0)).toBe(true); });
  it('extractor never accepts', () => {
    expect(accepts({ type: 'extractor', dir: 'right', value: 1n, everyTicks: 5, sinceEmit: 0 }, 0)).toBe(false);
  });
  it('operator accepts until it holds two inputs', () => {
    const op: Cell = { type: 'operator', op: 'add', dir: 'right', inputs: [] };
    expect(accepts(op, 0)).toBe(true);
    (op as any).inputs = [3n];
    expect(accepts(op, 0)).toBe(true);
    (op as any).inputs = [3n, 4n];
    expect(accepts(op, 0)).toBe(false);
  });
  it('undefined accepts nothing', () => { expect(accepts(undefined, 0)).toBe(false); });
});
