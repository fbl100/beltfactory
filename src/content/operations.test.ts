import { describe, it, expect } from 'vitest';
import { applyOp, OPERATIONS, ALL_OPS } from './operations';

describe('operations', () => {
  it('adds with BigInt', () => { expect(applyOp('add', 7n, 5n)).toBe(12n); });
  it('exposes a display symbol for every op', () => {
    for (const op of ALL_OPS) expect(OPERATIONS[op].symbol.length).toBeGreaterThan(0);
    expect(OPERATIONS.add.symbol).toBe('+');
  });

  // All ops are order-independent (the operator machine feeds inputs in arrival order).
  it('subtracts as a non-negative absolute difference, either way round', () => {
    expect(applyOp('subtract', 12n, 5n)).toBe(7n);
    expect(applyOp('subtract', 5n, 12n)).toBe(7n); // order-independent
    expect(applyOp('subtract', 8n, 8n)).toBe(0n);  // never negative
  });
  it('multiplies (order-independent)', () => {
    expect(applyOp('multiply', 5n, 10n)).toBe(50n);
    expect(applyOp('multiply', 10n, 5n)).toBe(50n);
  });
  it('divides bigger-by-smaller as a whole number, either way round', () => {
    expect(applyOp('divide', 100n, 50n)).toBe(2n);
    expect(applyOp('divide', 50n, 100n)).toBe(2n); // order-independent
    expect(applyOp('divide', 12n, 5n)).toBe(2n);   // whole part only (fits twice)
  });
  it('guards divide-by-zero (returns 0, no throw)', () => {
    expect(applyOp('divide', 0n, 7n)).toBe(0n);
    expect(applyOp('divide', 7n, 0n)).toBe(0n);
    expect(applyOp('divide', 0n, 0n)).toBe(0n);
  });
});
