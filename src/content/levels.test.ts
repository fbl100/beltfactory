import { describe, it, expect } from 'vitest';
import { LEVELS, clampLevelIndex, opsForLevel } from './levels';
import { ALL_OPS } from './operations';
import type { OpId } from './operations';

// Every node value available at (and before) a given level index (deposits are cumulative).
function cumulativeNodeValues(index: number): bigint[] {
  const vals: bigint[] = [];
  for (let i = 0; i <= index; i++) for (const n of LEVELS[i].grantNodes) vals.push(n.value);
  return vals;
}

// Can `target` be formed by repeated addition of the available node values? (Classic coin
// reachability — every value is usable any number of times.) Targets are small, so a Number DP
// is exact. This is the guardrail on the tuning surface: a mistuned edit that makes a target
// unreachable via addition fails here rather than stranding the player.
function reachableByAddition(target: bigint, values: bigint[]): boolean {
  const t = Number(target);
  const vs = values.map(Number).filter((v) => v > 0);
  const reach = new Array(t + 1).fill(false);
  reach[0] = true;
  for (const v of vs) for (let j = v; j <= t; j++) if (reach[j - v]) reach[j] = true;
  return reach[t];
}

// The target-hub footprint (worldgen authors the hub at anchor (12,4)); deposits must not land on it.
const HUB = { minX: 12, maxX: 14, minY: 4, maxY: 6 };
function onHub(x: number, y: number): boolean {
  return x >= HUB.minX && x <= HUB.maxX && y >= HUB.minY && y <= HUB.maxY;
}

function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (let d = 2n; d * d <= n; d++) if (n % d === 0n) return false;
  return true;
}

// Mirror of the (order-independent) op semantics in content/operations, on Numbers.
function applyNum(op: OpId, a: number, b: number): number {
  if (op === 'add') return a + b;
  if (op === 'subtract') return Math.abs(a - b);
  if (op === 'multiply') return a * b;
  const hi = Math.max(a, b), lo = Math.min(a, b); // divide
  return lo === 0 ? 0 : Math.floor(hi / lo);
}

// Is `target` buildable from `values` using the level's `ops` within a small machine budget?
// BFS over combinable values (bounded so × can't run away). Proves a *tidy* route exists — e.g.
// 21 = (2×3×3)+3 uses × and + together, which a pure-product check would wrongly reject.
function reachableWithOps(target: bigint, values: bigint[], ops: OpId[], maxOps = 8): boolean {
  const t = Number(target), cap = t * 2 + 5;
  let reach = new Set<number>(values.map(Number));
  if (reach.has(t)) return true;
  for (let step = 0; step < maxOps; step++) {
    const arr = [...reach];
    const next = new Set(reach);
    for (const a of arr) for (const b of arr) for (const op of ops) {
      const v = applyNum(op, a, b);
      if (v > 0 && v <= cap) next.add(v);
    }
    if (next.has(t)) return true;
    if (next.size === reach.size) break; // saturated
    reach = next;
  }
  return reach.has(t);
}

describe('content/levels', () => {
  it('has a gentle, forgiving first level', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(2);
    expect(LEVELS[0].target).toBeGreaterThan(0n);
    expect(LEVELS[0].target).toBeLessThanOrEqual(30n); // Phase-1 addition, kid-sized
  });

  it('targets strictly increase and every level asks for at least one delivery', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      expect(LEVELS[i].required).toBeGreaterThan(0);
      if (i > 0) expect(LEVELS[i].target > LEVELS[i - 1].target).toBe(true);
    }
  });

  it('every level target is reachable by addition from its cumulative deposits', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const values = cumulativeNodeValues(i);
      expect(values.length).toBeGreaterThan(0);
      expect(reachableByAddition(LEVELS[i].target, values)).toBe(true);
    }
  });

  it('every deposit is a prime number (Prime Foundry invariant)', () => {
    for (const lvl of LEVELS)
      for (const n of lvl.grantNodes) expect(isPrime(n.value)).toBe(true);
  });

  it('every target is buildable with the level ops from its deposits in a few machines (× route exists)', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const values = cumulativeNodeValues(i);
      expect(reachableWithOps(LEVELS[i].target, values, LEVELS[i].ops)).toBe(true);
    }
  });

  it('grant-node coordinates are unique and never sit on the target hub', () => {
    const seen = new Set<string>();
    for (const lvl of LEVELS)
      for (const n of lvl.grantNodes) {
        const k = `${n.x},${n.y}`;
        expect(seen.has(k)).toBe(false); // no two deposits share a cell (would silently drop one)
        seen.add(k);
        expect(onHub(n.x, n.y)).toBe(false);
        expect(n.value).toBeGreaterThan(0n);
      }
  });

  it('every level unlocks a valid, cumulative op set that always includes addition', () => {
    for (let i = 0; i < LEVELS.length; i++) {
      const ops = LEVELS[i].ops;
      expect(ops.length).toBeGreaterThan(0);
      expect(ops).toContain('add');                       // addition is always available
      for (const op of ops) expect(ALL_OPS).toContain(op); // no unknown op ids
      if (i > 0) for (const prev of LEVELS[i - 1].ops) expect(ops).toContain(prev); // never lose an unlock
    }
    // final level exposes the whole toolkit
    expect([...LEVELS[LEVELS.length - 1].ops].sort()).toEqual([...ALL_OPS].sort());
  });

  it('opsForLevel clamps out-of-range indices', () => {
    expect(opsForLevel(-1)).toEqual(LEVELS[0].ops);
    expect(opsForLevel(999)).toEqual(LEVELS[LEVELS.length - 1].ops);
  });

  it('clampLevelIndex keeps the index in range', () => {
    expect(clampLevelIndex(-5)).toBe(0);
    expect(clampLevelIndex(0)).toBe(0);
    expect(clampLevelIndex(999)).toBe(LEVELS.length - 1);
    expect(clampLevelIndex(NaN)).toBe(0);
    expect(clampLevelIndex(2.7)).toBe(2);
  });
});
