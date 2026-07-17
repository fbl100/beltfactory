import { describe, it, expect } from 'vitest';
import { mvpGenerator } from './worldgen';
import { TARGET, TARGET_COUNT } from './config';

describe('mvp world generation', () => {
  it('places nodes 7 and 5 and a target hub in the origin chunk (machines are player-placed)', () => {
    const c = mvpGenerator(0, 0, 0);
    expect((c.nodes ?? []).map((n) => n.value).sort()).toEqual([5n, 7n]);
    const targets = (c.buildings ?? []).filter((b) => b.type === 'target');
    expect(targets.length).toBe(1);
    expect((targets[0] as any).target).toBe(TARGET);
    expect((targets[0] as any).required).toBe(TARGET_COUNT);
    for (const n of c.nodes ?? []) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThan(16); }
    for (const b of c.buildings ?? []) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x).toBeLessThan(16); }
  });
  it('generates empty land for every non-origin chunk', () => {
    expect(mvpGenerator(0, 1, 0)).toEqual({});
    expect(mvpGenerator(0, -2, 5)).toEqual({});
  });
  it('has a reachable small-number target', () => {
    expect(TARGET).toBeGreaterThan(0n);
    expect(TARGET).toBeLessThanOrEqual(30n);
  });
  it('returns fresh objects each call (no shared mutable content)', () => {
    const a = mvpGenerator(0, 0, 0);
    const b = mvpGenerator(0, 0, 0);
    (a.nodes as any)[0].value = 999n;
    expect((b.nodes as any)[0].value).not.toBe(999n);
  });
});
