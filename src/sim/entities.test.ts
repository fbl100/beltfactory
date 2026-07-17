import { describe, it, expect } from 'vitest';
import type { BeltCell, ResourceNode } from './entities';

describe('entities', () => {
  it('constructs a belt and a resource node', () => {
    const belt: BeltCell = { type: 'belt', dir: 'right' };
    const node: ResourceNode = { x: 1, y: 2, value: 42n };
    expect(belt.dir).toBe('right');
    expect(node.value).toBe(42n);
  });
});
