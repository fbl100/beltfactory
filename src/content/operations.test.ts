import { describe, it, expect } from 'vitest';
import { applyOp, OPERATIONS } from './operations';

describe('operations', () => {
  it('adds with BigInt', () => { expect(applyOp('add', 7n, 5n)).toBe(12n); });
  it('exposes a display symbol', () => { expect(OPERATIONS.add.symbol).toBe('+'); });
});
