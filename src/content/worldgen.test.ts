import { describe, it, expect } from 'vitest';
import { mvpGenerator, TARGET } from './worldgen';

describe('mvp world generation', () => {
  it('places the authored puzzle in the origin chunk', () => {
    const p = mvpGenerator(0, 0, 0);
    const types = p.map((x) => x.cell.type);
    expect(types).toContain('extractor');
    expect(types).toContain('operator');
    expect(types).toContain('sink');
    // all placements are inside the origin chunk (0..15)
    for (const pl of p) { expect(pl.x).toBeGreaterThanOrEqual(0); expect(pl.x).toBeLessThan(16); }
  });
  it('generates empty land for every non-origin chunk', () => {
    expect(mvpGenerator(0, 1, 0)).toEqual([]);
    expect(mvpGenerator(0, -2, 5)).toEqual([]);
  });
  it('has a reachable small-number target', () => {
    expect(TARGET).toBeGreaterThan(0n);
    expect(TARGET).toBeLessThanOrEqual(30n);
  });
  it('returns fresh mutable cells each call (no shared inputs buffer)', () => {
    const a = mvpGenerator(0, 0, 0).find((p) => p.cell.type === 'operator')!.cell as any;
    const b = mvpGenerator(0, 0, 0).find((p) => p.cell.type === 'operator')!.cell as any;
    a.inputs.push(1n);
    expect(b.inputs.length).toBe(0);
  });
});
