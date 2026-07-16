import { describe, it, expect } from 'vitest';
import { createItem } from './items';

describe('items', () => {
  it('creates an item with previous position equal to current', () => {
    expect(createItem(7, 42n, 3, 4)).toEqual({ id: 7, value: 42n, x: 3, y: 4, px: 3, py: 4 });
  });
  it('preserves large BigInt values exactly', () => {
    const big = 123456789012345678901234567890n;
    expect(createItem(1, big, 0, 0).value).toBe(big);
  });
});
