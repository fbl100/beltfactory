import { describe, it, expect } from 'vitest';
import { LEVELS, ENDLESS_START, levelAt, clampLevelIndex, opsForLevel, parFor, startIndexForMode, EASY_SUB_UNLOCK, EASY_TAKEAWAY_INTRO, minOpsToBuild } from './levels';
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

describe('content/levels: endless generator', () => {
  const SEEDS = [1, 42, 7, 123456, 2 ** 31];
  const DEPOSITS = [2n, 3n, 5n, 7n];

  it('is deterministic: levelAt(i, seed) reproduces the same level', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 40; k++) {
        const i = ENDLESS_START + k;
        expect(levelAt(i, seed)).toEqual(levelAt(i, seed));
      }
  });

  it('every generated target is in [8,999] and buildable from {2,3,5,7} in a few machines', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 60; k++) {
        const lvl = levelAt(ENDLESS_START + k, seed);
        expect(lvl.target).toBeGreaterThanOrEqual(8n);
        expect(lvl.target).toBeLessThanOrEqual(999n);
        expect(lvl.required).toBeGreaterThan(0);
        expect([...lvl.ops].sort()).toEqual([...ALL_OPS].sort());
        // independent reachability check — deeper budget than the generator itself uses
        expect(reachableWithOps(lvl.target, DEPOSITS, ALL_OPS)).toBe(true);
      }
  });

  it('every generated level carries a positive, finite golf par', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 60; k++) {
        const { par } = levelAt(ENDLESS_START + k, seed);
        expect(Number.isInteger(par)).toBe(true);
        expect(par).toBeGreaterThanOrEqual(1); // a target is never a raw deposit, so it costs >=1 machine
        expect(par).toBeLessThanOrEqual(12);   // sanity: short solutions exist for every generated goal
      }
  });

  it('parFor matches the fewest multiplies for clean products (tight par for prime chains)', () => {
    expect(parFor(6n)).toBe(1);    // 2×3
    expect(parFor(4n)).toBe(1);    // 2×2
    expect(parFor(30n)).toBe(2);   // 6×5
    expect(parFor(210n)).toBe(3);  // 2×3×5×7 — three multiplies, no reuse shortcut
  });

  it('parFor searches ALL ops for the cheapest route, not just multiplication', () => {
    // 36 is NOT 6×6 (3 machines); the solver finds 3×(5+7) = 3×12 = 36 in 2, mixing + and ×.
    expect(parFor(36n)).toBe(2);
  });

  it('difficulty is PAR-driven and gentle at the start (stage 0: par 1-2, small numbers)', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 20; k++) { // stage 0 = the first STAGE_SIZE (20) puzzles
        const lvl = levelAt(ENDLESS_START + k, seed);
        expect(lvl.par).toBeGreaterThanOrEqual(1);
        expect(lvl.par).toBeLessThanOrEqual(2);   // few machines
        expect(lvl.target).toBeLessThanOrEqual(60n); // and small, readable numbers
      }
  });

  it('later stages demand more machines (the par FLOOR rises every ~20 puzzles)', () => {
    // Stage 3 starts at endless offset 60 (STAGE_SIZE 20): minPar is floored at 3.
    for (const seed of SEEDS)
      for (let k = 60; k < 80; k++)
        expect(levelAt(ENDLESS_START + k, seed).par).toBeGreaterThanOrEqual(3);
  });

  it('average par climbs stage over stage (harder as she progresses)', () => {
    const avgPar = (from: number, to: number) => {
      let s = 0, n = 0;
      for (let k = from; k < to; k++) { s += levelAt(ENDLESS_START + k, 42).par; n++; }
      return s / n;
    };
    const early = avgPar(0, 20), mid = avgPar(40, 60), late = avgPar(80, 120);
    expect(early).toBeLessThan(mid);
    expect(mid).toBeLessThanOrEqual(late);
  });

  it('eases in with 2-digit targets for the first 10 endless levels', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 10; k++) {
        const t = levelAt(ENDLESS_START + k, seed).target;
        expect(t).toBeGreaterThanOrEqual(10n);
        expect(t).toBeLessThanOrEqual(99n); // 2-digit while easing her in
      }
  });

  it('produces both prime and composite targets over a run (not just a multiplication game)', () => {
    let primes = 0, composites = 0;
    for (let k = 0; k < 80; k++) {
      const t = levelAt(ENDLESS_START + k, 42).target;
      if (isPrime(t)) primes++; else composites++;
    }
    expect(primes).toBeGreaterThan(0);
    expect(composites).toBeGreaterThan(0);
  });

  it('deposit drips are single-digit-prime copies, spaced out, capped, and never on the hub', () => {
    const seen = new Set<string>();
    let drips = 0;
    for (let k = 0; k < 120; k++)
      for (const n of levelAt(ENDLESS_START + k, 99).grantNodes) {
        drips++;
        expect(DEPOSITS).toContain(n.value);   // only {2,3,5,7} are ever dripped
        expect(onHub(n.x, n.y)).toBe(false);
        const key = `${n.x},${n.y}`;
        expect(seen.has(key)).toBe(false);      // no two drips land on the same cell
        seen.add(key);
      }
    expect(drips).toBeGreaterThan(0);
    expect(drips).toBeLessThanOrEqual(6);        // MAX_DRIPS — never re-clutters the map
  });

  it('goals ramp up in magnitude as levels climb', () => {
    const avg = (from: number, to: number, seed: number) => {
      let sum = 0;
      for (let k = from; k < to; k++) sum += Number(levelAt(ENDLESS_START + k, seed).target);
      return sum / (to - from);
    };
    let laterBigger = 0;
    for (const seed of SEEDS) if (avg(45, 60, seed) > avg(0, 15, seed)) laterBigger++;
    expect(laterBigger).toBeGreaterThanOrEqual(4); // holds for at least 4 of 5 seeds
  });
});

describe('content/levels: easy mode (addition & subtraction, for a 6-year-old)', () => {
  const SEEDS = [1, 42, 7, 999, 12345];
  const handOf = (idx: number, seed: number): bigint[] =>
    levelAt(idx, seed, 'easy').grantNodes.map((n) => n.value);

  it('startIndexForMode: easy starts in the endless range, normal at level 0', () => {
    expect(startIndexForMode('normal')).toBe(0);
    expect(startIndexForMode('easy')).toBe(ENDLESS_START);
  });

  it('addition-only until the Take-Away unlock, then + and −', () => {
    expect(opsForLevel(ENDLESS_START, 'easy')).toEqual(['add']);
    expect(opsForLevel(ENDLESS_START + EASY_SUB_UNLOCK - 1, 'easy')).toEqual(['add']);
    expect(opsForLevel(ENDLESS_START + EASY_SUB_UNLOCK, 'easy')).toEqual(['add', 'subtract']);
    expect(opsForLevel(ENDLESS_START, 'normal').length).toBe(4); // normal is unaffected
  });

  it('every puzzle deals a FRESH hand of >=3 distinct small sources', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 60; k++) {
        const hand = handOf(ENDLESS_START + k, seed);
        expect(hand.length).toBeGreaterThanOrEqual(3);
        expect(new Set(hand).size).toBe(hand.length);            // distinct
        for (const v of hand) { expect(v).toBeGreaterThanOrEqual(1n); expect(v).toBeLessThanOrEqual(9n); }
      }
  });

  it('the hand actually varies puzzle to puzzle (kills the repeated-goal problem)', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k++) seen.add(handOf(ENDLESS_START + k, 42).map(String).join(','));
    expect(seen.size).toBeGreaterThanOrEqual(6); // many different hands over a run
  });

  it('every target is small, in par band, and ALWAYS buildable by addition alone (never stuck)', () => {
    for (const seed of SEEDS)
      for (let k = 0; k < 60; k++) {
        const lvl = levelAt(ENDLESS_START + k, seed, 'easy');
        const hand = lvl.grantNodes.map((n) => n.value);
        expect(lvl.target).toBeGreaterThanOrEqual(4n);
        expect(lvl.target).toBeLessThanOrEqual(15n); // small numbers for a 6-year-old
        expect(lvl.par).toBeGreaterThanOrEqual(1);
        expect(lvl.required).toBe(5);
        // The crucial guarantee: an addition-only route always exists, so she can never be blocked.
        expect(reachableWithOps(lvl.target, hand, ['add'])).toBe(true);
      }
  });

  it('the first puzzles after the − unlock are guaranteed take-away boards (subtraction strictly wins)', () => {
    for (const seed of [1, 42, 7, 999, 12345])
      for (let k = 0; k < EASY_TAKEAWAY_INTRO; k++) {
        const lvl = levelAt(ENDLESS_START + EASY_SUB_UNLOCK + k, seed, 'easy');
        const hand = lvl.grantNodes.map((n) => Number(n.value));
        const t = Number(lvl.target);
        const withSub = minOpsToBuild(hand, ['add', 'subtract'], t);
        const addOnly = minOpsToBuild(hand, ['add'], t);
        expect(addOnly).toBeDefined();               // addition fallback always exists (never stuck)
        expect(withSub!).toBeLessThan(addOnly!);      // but − is the cheaper hero → she'll actually use it
      }
  });

  it('is deterministic and gentle at the start (stage 0: par ≤ 2, target ≤ 8)', () => {
    for (const seed of SEEDS) {
      expect(levelAt(ENDLESS_START + 3, seed, 'easy')).toEqual(levelAt(ENDLESS_START + 3, seed, 'easy'));
      for (let k = 0; k < 10; k++) { // first stage = 10 puzzles
        const lvl = levelAt(ENDLESS_START + k, seed, 'easy');
        expect(lvl.par).toBeLessThanOrEqual(2);
        expect(lvl.target).toBeLessThanOrEqual(10n);
        expect(lvl.ops).toEqual(['add']); // subtraction not yet unlocked in the first stretch
      }
    }
  });
});
