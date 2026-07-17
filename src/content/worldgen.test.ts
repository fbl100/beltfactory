import { describe, it, expect } from 'vitest';
import { mvpGenerator } from './worldgen';
import { LEVELS } from './levels';

describe('mvp world generation', () => {
  it('authors level-0 deposits and a target hub in the origin chunk (machines are player-placed)', () => {
    const c = mvpGenerator(0, 0, 0);
    const lvl0Values = LEVELS[0].grantNodes.map((n) => n.value).sort();
    expect((c.nodes ?? []).map((n) => n.value).sort()).toEqual(lvl0Values);
    const targets = (c.buildings ?? []).filter((b) => b.type === 'target');
    expect(targets.length).toBe(1);
    expect((targets[0] as any).target).toBe(LEVELS[0].target);
    expect((targets[0] as any).required).toBe(LEVELS[0].required);
    for (const n of c.nodes ?? []) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.x).toBeLessThan(16); }
    for (const b of c.buildings ?? []) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x).toBeLessThan(16); }
  });
  it('generates empty land for every non-origin chunk', () => {
    expect(mvpGenerator(0, 1, 0)).toEqual({});
    expect(mvpGenerator(0, -2, 5)).toEqual({});
  });
  it('starts with a reachable small-number target', () => {
    expect(LEVELS[0].target).toBeGreaterThan(0n);
    expect(LEVELS[0].target).toBeLessThanOrEqual(30n);
  });
  it('returns fresh objects each call (no shared mutable content)', () => {
    const a = mvpGenerator(0, 0, 0);
    const b = mvpGenerator(0, 0, 0);
    (a.nodes as any)[0].value = 999n;
    expect((b.nodes as any)[0].value).not.toBe(999n);
  });
});
